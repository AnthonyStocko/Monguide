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
const server = { rows: new Map(), members: new Map(), applied: new Set(), calls: 0, failAfterApply: false, minShared: 1, removedBy: {} };
const store = {
  loadTrip: async (id) => (server.rows.has(id) ? structuredClone(server.rows.get(id)) : null),
  membership: async (id, user) => (server.members.get(id)?.[user] ? { role: server.members.get(id)[user], memberCount: Object.keys(server.members.get(id)).length } : null),
  appliedOpIds: async (ids) => new Set(ids.filter((i) => server.applied.has(i))),
  whoRemoved: async (_trip, stepId) => server.removedBy[stepId] ?? null,
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
  applyOps: async ({ tripId, ops, schemaVersion }) => {
    server.calls += 1;
    const res = await applyBatch({ store, userId: ME, tripId, ops, rules, schemaVersion, minSharedSchemaVersion: server.minShared });
    if (server.failAfterApply) {
      server.failAfterApply = false;
      throw Object.assign(new Error('network'), { code: 'network' });
    }
    return structuredClone(res);
  }
};
vi.mock('./api.js', () => ({ authApi: { getSession: async () => ({ user: { id: 'aaaaaaaa-0000-4000-8000-00000000000a' } }), signOut: async () => {}, onChange: () => () => {} }, tripsRemote }));

const { refreshTrip, syncNow } = await import('./sync.js');
const { syncNotices } = await import('./syncNotices.js');
const { getQueue, loadTrip, onTripsChanged, updateTrip, deleteTrip } = await import('./tripsStore.js');

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
  server.minShared = 1;
  server.removedBy = {};
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

  it('modification reçue en direct (refreshTrip) : copie remplacée, prévenue comme distante (rappels reprogrammés)', async () => {
    const trip = seed();
    // Cet appareil a une opération en attente ; l'autre change l'horaire du déjeuner.
    await updateTrip(setStepStatus(trip, 0, 'culture', 'done', '11:00'), trip);
    await otherDevice([{ opId: crypto.randomUUID(), type: 'setStepTime', params: { stepId: 'lunch', start: '13:00', end: '14:00' } }]);
    const events = [];
    const off = onTripsChanged((id, { remote }) => events.push({ id, remote }));
    await refreshTrip(TRIP);
    off();
    const t = await local();
    expect(step(t, 'lunch').start).toBe('13:00');
    expect(step(t, 'culture').status).toBe('done');
    expect(t.version).toBe(2);
    // notifications.js reprogramme les rappels de cet appareil à chaque modification, distante comprise.
    expect(events).toEqual([{ id: TRIP, remote: true }]);
    // Déjà à jour : rien.
    await refreshTrip(TRIP);
    expect((await local()).version).toBe(2);
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

describe('hors ligne (Bloc E)', () => {
  const offline = () => vi.stubGlobal('navigator', { onLine: false });
  const online = () => vi.stubGlobal('navigator', { onLine: true });
  const allIds = (t) => t.days.flatMap((d) => d.steps.map((st) => st.id));

  it('mode avion sur A, trois modifications ; B modifie d\u2019autres étapes ; A se reconnecte : les quatre partout, sans doublon', async () => {
    const trip = seed();
    offline();
    let t = await updateTrip(setStepStatus(trip, 0, 'culture', 'done', '11:20'), trip);
    t = await updateTrip(replaceStepPlace(t, 0, 3, near, rules), t);
    const day = { ...t.days[0], steps: t.days[0].steps.map((st) => (st.id === 'outdoor' ? { ...st, start: '14:45', end: '16:15' } : st)) };
    await updateTrip({ ...t, days: [recomputeTravel(day, t, rules)] }, t);
    await syncNow();
    expect(server.calls).toBe(0);
    // Trois actions à l'écran : plusieurs opérations (lieu remplacé = étape + réserve).
    expect((await getQueue(TRIP)).length).toBeGreaterThanOrEqual(3);

    await otherDevice([{ opId: crypto.randomUUID(), type: 'setStepDone', params: { stepId: 'lunch', status: 'done', completedAt: '13:30' } }]);
    online();
    await syncNow();
    await syncNow();
    for (const result of [serverTrip(), await local()]) {
      expect(step(result, 'culture').status).toBe('done');
      expect(step(result, 'relax').place.id).toBe('near');
      expect(step(result, 'outdoor').start).toBe('14:45');
      expect(step(result, 'lunch').status).toBe('done');
      expect(new Set(allIds(result)).size).toBe(allIds(result).length);
    }
    expect(await getQueue(TRIP)).toEqual([]);
    // Version 1 + B + un seul lot de A : rien n'a été appliqué deux fois.
    expect(server.rows.get(TRIP).version).toBe(3);
    expect(await syncNotices()).toEqual([]);
  });

  it('A supprime une étape pendant que B (hors ligne) change son horaire : message prévu, rien d\u2019autre n\u2019est perdu', async () => {
    const trip = seed();
    offline();
    const day = { ...trip.days[0], steps: trip.days[0].steps.map((st) => (st.id === 'outdoor' ? { ...st, start: '15:00', end: '16:30' } : st)) };
    let t = await updateTrip({ ...trip, days: [recomputeTravel(day, trip, rules)] }, trip);
    await updateTrip(setStepStatus(t, 0, 'culture', 'done', '11:00'), t);
    await otherDevice([{ opId: crypto.randomUUID(), type: 'removeStep', params: { stepId: 'outdoor' } }]);
    server.removedBy.outdoor = 'Paul';
    online();
    await syncNow();
    t = await local();
    expect(step(t, 'outdoor')).toBeUndefined();
    expect(step(t, 'culture').status).toBe('done');
    expect(await syncNotices()).toEqual([expect.objectContaining({ kind: 'rejected', tripId: TRIP, stepName: 'Parc Vermorel', by: 'Paul' })]);
  });

  it('accès retiré pendant l\u2019absence de réseau : file abandonnée, séjour retiré, utilisateur prévenu', async () => {
    const trip = seed();
    offline();
    await updateTrip(setStepStatus(trip, 0, 'culture', 'done', '11:00'), trip);
    server.members.set(TRIP, { other: 'owner' });
    online();
    await syncNow();
    expect(db.has(`trip:${TRIP}`)).toBe(false);
    expect(await getQueue(TRIP)).toEqual([]);
    expect(await syncNotices()).toEqual([expect.objectContaining({ kind: 'removed', tripId: TRIP, tripTitle: 'Villefranche' })]);
  });

  it('séjour supprimé par l\u2019owner : retiré de l\u2019appareil, « supprimé par Anthony »', async () => {
    const trip = seed();
    db.set(`trip:${TRIP}`, { ...db.get(`trip:${TRIP}`), ownerId: 'owner-anthony' });
    prefs.set(`members:${TRIP}`, [{ userId: 'owner-anthony', name: 'Anthony', role: 'owner' }, { userId: ME, name: 'Moi', role: 'editor' }]);
    offline();
    await updateTrip(setStepStatus(trip, 0, 'culture', 'done', '11:00'), trip);
    server.rows.set(TRIP, { ...server.rows.get(TRIP), deleted: true, planning: [], version: 2 });
    online();
    await syncNow();
    expect(db.has(`trip:${TRIP}`)).toBe(false);
    expect(await syncNotices()).toEqual([expect.objectContaining({ kind: 'deleted', tripId: TRIP, by: 'Anthony' })]);
  });

  it('supprimé par moi-même sur un autre appareil : pas de message', async () => {
    seed();
    db.set(`trip:${TRIP}`, { ...db.get(`trip:${TRIP}`), ownerId: ME });
    server.rows.set(TRIP, { ...server.rows.get(TRIP), deleted: true, planning: [], version: 2 });
    await syncNow();
    expect(db.has(`trip:${TRIP}`)).toBe(false);
    expect(await syncNotices()).toEqual([]);
  });

  it('application trop ancienne pour un séjour partagé : modifications gardées, message de mise à jour', async () => {
    const trip = seed();
    server.minShared = 99;
    await updateTrip(setStepStatus(trip, 0, 'culture', 'done', '11:00'), trip);
    await syncNow();
    expect(await getQueue(TRIP)).toHaveLength(1);
    expect(step(await local(), 'culture').status).toBe('done');
    expect(await syncNotices()).toEqual([expect.objectContaining({ kind: 'outdated', tripId: TRIP })]);
  });
});
