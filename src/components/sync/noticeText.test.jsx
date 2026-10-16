import { describe, expect, it } from 'vitest';
import fr from '../../i18n/locales/fr.json';
import { noticeText } from './SyncNoticesBar.jsx';

/** t() minimal : clé pointée dans fr.json, variables {{x}} remplacées. */
const t = (key, vars = {}) => key.split('.').reduce((o, k) => o?.[k], fr).replace(/\{\{(\w+)\}\}/g, (_, v) => vars[v]);

describe('messages de la synchronisation', () => {
  it('modification refusée : étape nommée et qui l’a supprimée, sans jargon', () => {
    expect(noticeText({ kind: 'rejected', stepName: 'Musée', by: 'Paul' }, t)).toBe('Votre modification de « Musée » n’a pas pu être appliquée : Paul a supprimé cette étape.');
    expect(noticeText({ kind: 'rejected', stepName: 'Musée', by: null }, t)).toContain('un autre participant a supprimé');
  });

  it('séjour retiré, supprimé par l’owner, mise à jour nécessaire', () => {
    expect(noticeText({ kind: 'removed', tripTitle: 'Lyon' }, t)).toBe('Vous ne participez plus au séjour « Lyon ». Il a été retiré de cet appareil.');
    expect(noticeText({ kind: 'deleted', tripTitle: 'Lyon', by: 'Anthony' }, t)).toBe('Le séjour « Lyon » a été supprimé par Anthony.');
    expect(noticeText({ kind: 'outdated', tripTitle: 'Lyon' }, t)).toContain('Mettez à jour Mon guide');
  });
});
