import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recomputeTravel } from '@domain/dayEdits.js';
import { migrate } from '@domain/migrations.js';
import { applyOps } from '@domain/ops/applyOps.js';
import { replaceStepPlace } from '@domain/replaceStep.js';
import { setStepStatus } from '@domain/reevaluatePlanning.js';
import { place, rules, standardDay, trip as fixtureTrip } from '@domain/testing/dayFixture.js';
import { rowToTrip, tripToRow } from '@domain/tripRow.js';
import { applyBatch } from '../../supabase/functions/_shared/trips/applyBatch.js';

// Appareil : IndexedDB et réglages en mémoire.
const db = new Map();
const prefs = new Map();
vi.mock('./storage.js', () => ({
  get: async (k, fallback = null) => (db.has(k) ? structuredClone(db.get(k)) : fallback),
  set: async (k, v) => void db.set(k, structuredClone(v)),
  remove: async (k) => void db.delete(k),
  keys: async () => [...db.keys()]
}));
vi.mock('./settings.js', () => ({
  get: async (k) => (prefs.has(k) ? structuredClone(prefs.get(k)) : null),
  set: async (k, v) => void prefs.set(k, structuredClone(v)),
  remove: async (k) => void prefs.delete(k)
}));
vi.mock('./offlineImages.js', () => ({ deleteTripPhotos: async () => {}, deleteAllTripPhotos: async () => {} }));

// Serveur : la vraie fonction applyBatch (trip-apply-ops) sur une base en mémoire.
const ME = 'aaaaaaaa-0000-4000-8000-00000000000a';
const server = { rows: new Map(), members: new Map(), applied: new Set(), calls: 0, failAfterApply: false };
const store = {
  loadTrip: async (id) => (server.rows.has(id) ? structuredClone(server.rows.get(id)) : null),
  membership: async (id, user) => (server.members.get(id)?.[user] ? { role: server.members.get(id)[user], memberCount: Object.keys(server.members.get(id)).length } : null),
  appliedOpIds: async (ids) => new Set(ids.filter((i) => server.applied.has(i))),
  commit: async ({ tripId, expectedVersion, row, opIds }) => {
    const current = server.rows.get(tripId);
    if (current.version !== expectedVersion) return null;
    const next = { ...current, ...row, version: current.version + 1, updated_at: new Date().toISOString() };
    server.rows.set(tripId, next);
    opIds.forEach((i) => server.applied.add(i));
    return { version: next.version, updatedAt: next.updated_at };
  },
  create: async ({ tripId, owner, row, opIds }) => {
    if (server.rows.has(tripId)) return null;
    server.rows.set(tripId, { ...row, id: tripId, user_id: owner, version: 1, updated_at: new Date().toISOString() });
    server.members.set(tripId, { [owner]: 'owner' });
    opIds.forEach((i) => server.applied.add(i));
    return { version: 1, updatedAt: server.rows.get(tripId).updated_at };
  }
};
const tripsRemote = {
  listVersions: async () => [...server.rows.values()].filter((r) => server.members.get(r.id)?.[ME]).map((r) => ({ id: r.id, version: r.version, deleted: r.deleted })),
  fetchRows: async (ids) => ids.map((id) => structuredClone(server.rows.get(id))),
  applyOps: async ({ tripId, ops }) => {
    server.calls += 1;
    const res = await applyBatch({ store, userId: ME, tripId, ops, rules });
    if (server.failAfterApply) {
      server.failAfterApply = false;
      throw Object.assign(new Error('network'), { code: 'network' });
    }
    return structuredClone(res);
  }
};
vi.mock('./api.js', () => ({ authApi: { getSession: async () => ({ user: {} }), signOut: async () => {}, onChange: () => () => {} }, tripsRemote }));

const { syncNow } = await import('./sync.js');
const { getQueue, loadTrip, updateTrip, deleteTrip } = await import('./tripsStore.js');

const TRIP = '0b9d6a7e-1c2f-4e3a-8b5d-6f7a8b9c0d1e';
const near = place('near', 'museum', 0.6, { name: 'Musée proche' });
function makeTrip() {
  const t = migrate({ ...fixtureTrip([standardDay('2026-10-10')], [near]), id: TRIP }).trip;
  return { ...t, days: t.days.map((d) => recomputeTravel(d, t, rules)) };
}
/** Séjour déjà sur le serveur (version 1) et sur l'appareil. */
function seed() {
  const trip = makeTrip();
  server.rows.set(TRIP, { ...tripToRow(trip), user_id: ME, version: 1, updated_at: '2026-10-01T10:00:00.000Z' });
  server.members.set(TRIP, { [ME]: 'owner', other: 'editor' });
  db.set(`trip:${TRIP}`, { ...rowToTrip(server.rows.get(TRIP)) });
  return trip;
}
const local = async () => (await loadTrip(TRIP)).trip;
const serverTrip = () => migrate(rowToTrip(server.rows.get(TRIP))).trip;
const step = (t, id) => t.days[0].steps.find((s) => s.id === id);
/** Modification faite par un autre appareil, directement sur le serveur. */
async function otherDevice(ops) {
  await applyBatch({ store, userId: 'other', tripId: TRIP, ops, rules });
}

beforeEach(() => {
  db.clear();
  prefs.clear();
  server.rows.clear();
  server.members.clear();
  server.applied.clear();
  server.calls = 0;
  vi.stubGlobal('navigator', { onLine: true });
});

describe('synchronisation par opérations', () => {
  it('modification locale : appliquée tout de suite, mise en file, envoyée, puis remplacée par la version du serveur', async () => {
    const trip = seed();
    const saved = await updateTrip(setStepStatus(trip, 0, 'culture', 'done', '11:20'), trip);
    expect(step(saved, 'culture').status).toBe('done');
    expect(await getQueue(TRIP)).toHaveLength(1);
    await syncNow();
    expect(await getQueue(TRIP)).toEqual([]);
    expect(step(serverTrip(), 'culture').status).toBe('done');
    expect((await local()).version).toBe(2);
  });

  it('deux appareils, deux étapes différentes au même moment : les deux modifications sont conservées', async () => {
    const trip = seed();
    // Cet appareil (hors ligne) remplace le lieu du musée ; l'autre a validé le déjeuner entre-temps.
    await updateTrip(replaceStepPlace(trip, 0, 0, near, rules), trip);
    await otherDevice([{ opId: crypto.randomUUID(), type: 'setStepDone', params: { stepId: 'lunch', status: 'done', completedAt: '13:40' } }]);
    await syncNow();
    for (const t of [serverTrip(), await local()]) {
      expect(step(t, 'culture').place.id).toBe('near');
      expect(step(t, 'lunch').status).toBe('done');
    }
    expect((await local()).version).toBe(3);
  });

  it('même étape modifiée par les deux : la dernière reçue par le serveur l’emporte, et chacun la voit', async () => {
    const trip = seed();
    await otherDevice([{ opId: crypto.randomUUID(), type: 'setStepTime', params: { stepId: 'culture', start: '09:00', end: '10:30' } }]);
    const day = { ...trip.days[0], steps: trip.days[0].steps.map((s) => (s.id === 'culture' ? { ...s, start: '10:15', end: '11:45' } : s)) };
    await updateTrip({ ...trip, days: [recomputeTravel(day, trip, rules)] }, trip);
    await syncNow();
    expect(step(serverTrip(), 'culture').start).toBe('10:15');
    expect(step(await local(), 'culture').start).toBe('10:15');
  });

  it('modification reçue d’un autre appareil, opérations locales réappliquées par-dessus', async () => {
    const trip = seed();
    await otherDevice([{ opId: crypto.randomUUID(), type: 'removeStep', params: { stepId: 'relax' } }]);
    server.failAfterApply = false;
    const queued = await updateTrip(setStepStatus(trip, 0, 'outdoor', 'skipped', '15:00'), trip);
    expect(step(queued, 'relax')).toBeDefined();
    await syncNow();
    const t = await local();
    expect(step(t, 'relax')).toBeUndefined();
    expect(step(t, 'outdoor').status).toBe('skipped');
  });

  it('réponse perdue après application : le renvoi ne duplique rien (même opId)', async () => {
    const trip = seed();
    await updateTrip(setStepStatus(trip, 0, 'culture', 'done', '11:20'), trip);
    server.failAfterApply = true;
    await syncNow();
    expect(await getQueue(TRIP)).toHaveLength(1);
    expect(server.rows.get(TRIP).version).toBe(2);
    await syncNow();
    expect(await getQueue(TRIP)).toEqual([]);
    expect(server.rows.get(TRIP).version).toBe(2);
    expect((await local()).version).toBe(2);
  });

  it('séjour créé sur l’appareil : envoyé par createTrip, puis modifié par opérations', async () => {
    const trip = makeTrip();
    db.set(`trip:${TRIP}`, trip);
    await syncNow();
    expect(server.rows.get(TRIP).version).toBe(1);
    expect((await local()).version).toBe(1);
    await updateTrip({ ...trip, title: 'Beaujolais' }, await local());
    await syncNow();
    expect(server.rows.get(TRIP).title).toBe('Beaujolais');
  });

  it('copie d’avant la mise à jour : modifications non envoyées reprises en opérations ; copie à jour : version du serveur', async () => {
    const trip = seed();
    const { version: _v, ...old } = rowToTrip(server.rows.get(TRIP));
    // Copie locale sans version, modifiée hors ligne après la dernière synchronisation (ancien état syncState).
    db.set(`trip:${TRIP}`, { ...setStepStatus(old, 0, 'culture', 'done', '11:00'), updatedAt: '2026-10-02T09:00:00.000Z' });
    prefs.set('syncState', { lastPullAt: null, synced: { [TRIP]: '2026-10-01T10:00:00.000Z' } });
    await otherDevice([{ opId: crypto.randomUUID(), type: 'setStepDone', params: { stepId: 'lunch', status: 'done', completedAt: '13:00' } }]);
    await syncNow();
    // Sans version de référence, la copie modifiée l'emporte sur ce qu'elle a de différent (comme
    // l'ancienne synchronisation) : sa validation du musée est envoyée, le déjeuner revient à son état.
    expect(step(serverTrip(), 'culture').status).toBe('done');
    expect(step(serverTrip(), 'lunch').status).toBe('planned');
    expect(prefs.has('syncState')).toBe(false);
    expect((await local()).version).toBe(3);

    // Copie sans modification depuis la dernière synchronisation : la version du serveur est reprise telle quelle.
    db.set(`trip:${TRIP}`, { ...old, updatedAt: '2026-10-01T10:00:00.000Z' });
    prefs.set('syncState', { synced: { [TRIP]: '2026-10-01T10:00:00.000Z' } });
    await otherDevice([{ opId: crypto.randomUUID(), type: 'setStepDone', params: { stepId: 'lunch', status: 'done', completedAt: '13:00' } }]);
    await syncNow();
    expect(step(await local(), 'lunch').status).toBe('done');
    expect(step(await local(), 'culture').status).toBe('done');
    expect(trip.id).toBe(TRIP);
  });

  it('suppression par l’owner : masqué tout de suite, supprimé sur le serveur puis effacé de l’appareil', async () => {
    seed();
    await deleteTrip(TRIP);
    expect(await loadTrip(TRIP)).toBeNull();
    await syncNow();
    expect(server.rows.get(TRIP).deleted).toBe(true);
    expect(db.has(`trip:${TRIP}`)).toBe(false);
  });

  it('séjour plus accessible (retiré du partage) : effacé de l’appareil', async () => {
    seed();
    server.members.set(TRIP, { other: 'owner' });
    await syncNow();
    expect(db.has(`trip:${TRIP}`)).toBe(false);
  });

  it('aucune écriture du séjour entier : seules des opérations sont envoyées', async () => {
    const trip = seed();
    const spy = vi.spyOn(tripsRemote, 'applyOps');
    await updateTrip(setStepStatus(trip, 0, 'culture', 'done', '11:20'), trip);
    await syncNow();
    expect(spy.mock.calls[0][0].ops.map((o) => o.type)).toEqual(['setStepDone']);
    spy.mockRestore();
    // Le résultat local est bien celui d'applyOps sur la version du serveur.
    expect(await local()).toEqual({ ...applyOps(serverTrip(), [], { rules }).trip, version: 2 });
  });
});
