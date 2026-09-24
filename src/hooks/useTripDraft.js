import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyDraft } from '@domain/tripDraft.js';
import * as storage from '../services/storage.js';

const DRAFT_KEY = 'draft:new-trip';

/**
 * Brouillon du formulaire de création, conservé dans IndexedDB : la saisie
 * est retrouvée si l'utilisateur change d'onglet ou quitte l'application.
 * @param {any} rules
 * @returns {{ draft: import('@domain/tripDraft.js').TripDraft | null, update: (patch: object | ((d: object) => object)) => void, reset: () => Promise<void> }}
 */
export function useTripDraft(rules) {
  const [draft, setDraft] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    let active = true;
    storage
      .get(DRAFT_KEY)
      .catch(() => null)
      .then((saved) => {
        if (!active) return;
        loaded.current = true;
        setDraft(saved ? { ...emptyDraft(rules), ...saved } : emptyDraft(rules));
      });
    return () => {
      active = false;
    };
    // Chargement unique : les règles ne changent pas le brouillon existant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loaded.current && draft) storage.set(DRAFT_KEY, draft).catch(() => {});
  }, [draft]);

  const update = useCallback((patch) => {
    setDraft((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) }));
  }, []);

  const reset = useCallback(async () => {
    await storage.remove(DRAFT_KEY).catch(() => {});
    setDraft(emptyDraft(rules));
  }, [rules]);

  return { draft, update, reset };
}
