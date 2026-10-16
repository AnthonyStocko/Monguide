import { describe, expect, it } from 'vitest';
import { recomputeTravel } from '../domain/dayEdits.js';
import { migrate } from '../domain/migrations.js';
import { applyOps } from '../domain/ops/applyOps.js';
import { rules, standardDay, trip as fixtureTrip } from '../domain/testing/dayFixture.js';
import { rowToTrip, tripToRow } from '../domain/tripRow.js';
import { rateWindow } from '../rateLimit.js';
import { applyBatch, opTypeColumn, readBatch } from './applyBatch.js';

const TRIP = '0b9d6a7e-1c2f-4e3a-8b5d-6f7a8b9c0d1e';
const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const B = 'aaaaaaaa-0000-4000-8000-00000000000b';
const C = 'aaaaaaaa-0000-4000-8000-00000000000c';

function baseTrip() {
  const t = migrate({ ...fixtureTrip([standardDay('2026-10-10')]), id: TRIP }).trip;
  return { ...t, days: t.days.map((d) => recomputeTravel(d, t, rules)) };
}
const op = (type, params) => ({ opId: crypto.randomUUID(), type, params });

/** Base en mémoire qui reproduit trip_commit / trip_create (migration 20261016120000_trip_ops.sql). */
function memoryStore({ trip = baseTrip(), members = { [A]: 'owner', [B]: 'editor' } } = {}) {
  const db = {
    row: trip ? { ...tripToRow(trip), user_id: A, version: 1 } : null,
    members: { ...members },
    applied: new Map(),
    changes: [],
    notified: [],
    beforeCommit: null
  };
  const write = (row, { author, opIds, opType, summary, stepIds, summaryCount }) => {
    db.row = { ...row, version: (db.row?.version ?? 0) + 1, updated_at: new Date().toISOString() };
    for (const id of opIds) db.applied.set(id, db.row.version);
    if (summary) db.changes.push({ version: db.row.version, author, opType, summary, ...(stepIds ? { stepIds, summaryCount } : {}) });
    return { version: db.row.version, updatedAt: db.row.updated_at };
  };
  const store = {
    loadTrip: async () => (db.row ? structuredClone(db.row) : null),
    membership: async (_trip, userId) => (db.members[userId] ? { role: db.members[userId], memberCount: Object.keys(db.members).length } : null),
    appliedOpIds: async (ids) => new Set(ids.filter((id) => db.applied.has(id))),
    commit: async ({ expectedVersion, row, ...rest }) => {
      db.beforeCommit?.();
      if (db.row.version !== expectedVersion || rest.opIds.some((id) => db.applied.has(id))) return null;
      return write({ ...db.row, ...row }, rest);
    },
    notifyOthers: async (tripId, author) => void db.notified.push({ tripId, author }),
    create: async ({ owner, row, ...rest }) => {
      if (db.row) return null;
      db.members = { [owner]: 'owner' };
      return write({ ...row, user_id: owner }, { author: owner, ...rest });
    }
  };
  return { db, store };
}

const call = (store, userId, ops) => applyBatch({ store, userId, tripId: TRIP, ops, rules });
const stepOf = (trip, id) => trip.days.flatMap((d) => d.steps).find((s) => s.id === id);

describe('readBatch', () => {
  it('vérifie tripId, baseVersion et les opérations (50 au plus, opId uuid unique)', () => {
    const ok = { tripId: TRIP, baseVersion: 1, ops: [op('removeStep', { stepId: 'x' })] };
    expect(readBatch(ok).ops).toHaveLength(1);
    expect(() => readBatch({ ...ok, tripId: 'x' })).toThrow('tripId');
    expect(() => readBatch({ ...ok, baseVersion: -1 })).toThrow('baseVersion');
    expect(() => readBatch({ ...ok, ops: [] })).toThrow('ops');
    expect(() => readBatch({ ...ok, ops: Array.from({ length: 51 }, () => op('removeStep', { stepId: 'x' })) })).toThrow('at most 50');
    const same = op('removeStep', { stepId: 'x' });
    expect(() => readBatch({ ...ok, ops: [same, same] })).toThrow('duplicate');
    expect(() => readBatch({ ...ok, ops: [{ ...same, opId: 'abc' }] })).toThrow('opId');
  });
});

describe('applyBatch', () => {
  it('applique sur la dernière version, incrémente la version, une ligne d’historique', async () => {
    const { db, store } = memoryStore();
    const res = await call(store, B, [op('setStepTime', { stepId: 'culture', start: '10:15', end: '11:45', customTime: true })]);
    expect(res.version).toBe(2);
    expect(stepOf(res.trip, 'culture')).toMatchObject({ start: '10:15', end: '11:45' });
    expect(res.trip.version).toBe(2);
    expect(res.rejected).toEqual([]);
    expect(db.changes).toEqual([{ version: 2, author: B, opType: 'set_step_time', summary: "a changé l'horaire de « Musée Paul-Dini » : 10:15–11:45 (samedi)", stepIds: ['culture'], summaryCount: 1 }]);
    // Séjour partagé : les autres participants sont prévenus (version web).
    expect(db.notified).toEqual([{ tripId: TRIP, author: B }]);
  });

  it('idempotence : le même opId renvoyé deux fois n’est appliqué qu’une fois', async () => {
    const { db, store } = memoryStore();
    const batch = [op('removeStep', { stepId: 'lunch' })];
    const first = await call(store, A, batch);
    const again = await call(store, A, batch);
    expect(again.version).toBe(first.version);
    expect(again.rejected).toEqual([]);
    expect(db.changes).toHaveLength(1);
    expect(db.row.version).toBe(2);
  });

  it('étape disparue : TARGET_GONE pour cette opération, les autres du lot appliquées', async () => {
    const { store } = memoryStore();
    await call(store, A, [op('removeStep', { stepId: 'outdoor' })]);
    const late = op('setStepTime', { stepId: 'outdoor', start: '15:00', end: '16:00' });
    const res = await call(store, B, [late, op('setStepDone', { stepId: 'culture', status: 'done', completedAt: '11:30' })]);
    expect(res.rejected).toEqual([{ opId: late.opId, code: 'TARGET_GONE' }]);
    expect(stepOf(res.trip, 'culture').status).toBe('done');
    expect(res.version).toBe(3);
  });

  it('version changée entre la lecture et l’écriture : tout est réappliqué sur la nouvelle version (les deux modifications restent)', async () => {
    const { db, store } = memoryStore();
    let once = true;
    db.beforeCommit = () => {
      if (!once) return;
      once = false;
      // Un autre appareil écrit pendant le calcul : horaire du déjeuner.
      const trip = applyOps(migrate(rowToTrip(db.row)).trip, [op('setStepTime', { stepId: 'lunch', start: '12:45', end: '14:00' })], { rules }).trip;
      db.row = { ...db.row, ...tripToRow(trip), version: db.row.version + 1 };
    };
    const res = await call(store, B, [op('setStepTime', { stepId: 'culture', start: '09:30', end: '11:00' })]);
    expect(res.version).toBe(3);
    expect(stepOf(res.trip, 'culture').start).toBe('09:30');
    expect(stepOf(res.trip, 'lunch').start).toBe('12:45');
  });

  it('droits : non-participant -> 404 (rien n’est révélé) ; renommage réservé à l’owner ; version IA interdite si partagé', async () => {
    const { store } = memoryStore();
    await expect(call(store, C, [op('removeStep', { stepId: 'lunch' })])).rejects.toMatchObject({ status: 404, code: 'trip_not_found' });
    const rename = op('renameTrip', { title: 'Autre nom' });
    const review = op('switchReview', { to: 'original' });
    const res = await call(store, B, [rename, review]);
    expect(res.rejected).toEqual([
      { opId: rename.opId, code: 'FORBIDDEN' },
      { opId: review.opId, code: 'SHARED_TRIP' }
    ]);
    expect(res.version).toBe(1);
    expect((await call(store, A, [op('renameTrip', { title: 'Autre nom' })])).trip.title).toBe('Autre nom');
  });

  it('création (createTrip) puis renvoi de la même création : un seul séjour', async () => {
    const { db, store } = memoryStore({ trip: null });
    const create = op('createTrip', { trip: baseTrip() });
    const res = await call(store, A, [create]);
    expect(res.version).toBe(1);
    expect(db.members).toEqual({ [A]: 'owner' });
    expect(db.changes[0]).toMatchObject({ opType: 'create_trip', summary: 'a créé le séjour' });
    const again = await call(store, A, [create]);
    expect(again.version).toBe(1);
    // Création avec un autre opId sur un séjour existant : EXISTS, le reste du lot s'applique.
    const other = op('createTrip', { trip: baseTrip() });
    const res3 = await call(store, A, [other, op('removeStep', { stepId: 'relax' })]);
    expect(res3.rejected).toEqual([{ opId: other.opId, code: 'EXISTS' }]);
    expect(stepOf(res3.trip, 'relax')).toBeUndefined();
  });

  it('séjour inconnu sans création -> 404 ; création d’un autre identifiant -> 400', async () => {
    const { store } = memoryStore({ trip: null });
    await expect(call(store, A, [op('removeStep', { stepId: 'x' })])).rejects.toMatchObject({ status: 404 });
    await expect(call(store, A, [op('createTrip', { trip: { ...baseTrip(), id: crypto.randomUUID() } })])).rejects.toMatchObject({ status: 400 });
  });

  it('suppression par l’owner : marqueur sans contenu ; plus rien ne s’applique ensuite', async () => {
    const { db, store } = memoryStore();
    const res = await call(store, A, [op('deleteTrip', {})]);
    expect(res.trip.deleted).toBe(true);
    expect(db.row.planning).toEqual([]);
    const after = await call(store, B, [op('removeStep', { stepId: 'lunch' })]);
    expect(after.rejected[0].code).toBe('TRIP_DELETED');
  });

  it('avertissements des journées recalculées, sans blocage', async () => {
    const { store } = memoryStore();
    const res = await call(store, A, [op('setStepTime', { stepId: 'relax', start: '20:30', end: '21:30' })]);
    expect(res.rejected).toEqual([]);
    expect(Object.values(res.warnings)[0].relax.map((w) => w.code)).toContain('STARTS_TOO_LATE');
  });
});

describe('outils', () => {
  it('opTypeColumn et fenêtre de 120 appels par minute', () => {
    expect(opTypeColumn('setStepTime')).toBe('set_step_time');
    expect(rateWindow('tripOps', rules.rateLimits)).toEqual({ windowMs: 60_000, limit: 120 });
    expect(rateWindow('default', rules.rateLimits)).toEqual({ windowMs: 3_600_000, limit: 600 });
  });
});
