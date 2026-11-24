import { beforeEach, describe, expect, it, vi } from 'vitest';
import fr from '../i18n/locales/fr.json';

// Appareil : IndexedDB et réglages en mémoire.
const db = new Map();
const prefs = new Map();
const deletedPhotos = [];
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
vi.mock('./offlineImages.js', () => ({
  deleteTripPhotos: async (id) => void deletedPhotos.push(id),
  deleteAllTripPhotos: async () => {}
}));

const { resolveTripDeletion } = await import('./tripDeletion.js');
const { deleteTrip, getCurrentTripId, getQueue, listTrips, setCurrentTripId } = await import('./tripsStore.js');

const trip = (id, extra = {}) => ({ id, title: `Séjour ${id}`, createdAt: `2026-11-0${id}T10:00:00.000Z`, days: [], ...extra });
const seed = (...trips) => trips.forEach((t) => db.set(`trip:${t.id}`, t));

beforeEach(() => {
  db.clear();
  prefs.clear();
  deletedPhotos.length = 0;
});

describe('suppression d’un séjour avec confirmation', () => {
  it('annulation : rien n’est supprimé', async () => {
    seed(trip('1'));
    const remove = vi.fn(deleteTrip);
    expect(await resolveTripDeletion('cancel', { id: '1', title: 'Séjour 1' }, remove)).toEqual({ status: 'cancelled', title: 'Séjour 1' });
    expect(remove).not.toHaveBeenCalled();
    expect((await listTrips()).map((t) => t.id)).toEqual(['1']);
  });

  it('confirmation : le séjour local et ses données disparaissent, les autres restent', async () => {
    seed(trip('1', { days: [{ steps: [{ id: 's', note: 'ma note' }] }] }), trip('2'));
    db.set('tripimgcheck:1', 1);
    await setCurrentTripId('1');
    expect(await resolveTripDeletion('confirm', { id: '1', title: 'Séjour 1' })).toEqual({ status: 'deleted', title: 'Séjour 1' });
    expect([...db.keys()].filter((k) => k.endsWith(':1'))).toEqual([]);
    expect((await listTrips()).map((t) => t.id)).toEqual(['2']);
    expect(await getCurrentTripId()).toBeNull();
    expect(deletedPhotos).toEqual(['1']);
  });

  it('séjour synchronisé : masqué tout de suite et suppression mise en file pour le serveur', async () => {
    seed(trip('1', { version: 3 }));
    expect((await resolveTripDeletion('confirm', { id: '1', title: 'Séjour 1' })).status).toBe('deleted');
    expect(await listTrips()).toEqual([]);
    expect((await getQueue('1')).map((o) => o.type)).toEqual(['deleteTrip']);
  });

  it('échec : le séjour est conservé et l’erreur est signalée', async () => {
    seed(trip('1'));
    const remove = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await resolveTripDeletion('confirm', { id: '1', title: 'Séjour 1' }, remove)).toEqual({ status: 'error', title: 'Séjour 1' });
    expect((await listTrips()).map((t) => t.id)).toEqual(['1']);
  });

  it('messages : confirmation explicite et définitive, succès et erreur clairs', () => {
    expect(fr.trips.confirmText).toContain('définitivement');
    expect(fr.trips.confirmText).toContain('irréversible');
    expect(fr.trips.confirm).toBe('Supprimer définitivement');
    expect(fr.trips.deleted).toContain('supprimé');
    expect(fr.trips.deleteFailed).toContain('n’a pas pu être supprimé');
    expect(fr.trips.deleteTrip).toBe('Supprimer le séjour');
  });
});
