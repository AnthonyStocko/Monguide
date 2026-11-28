import { countRawInstagramPlaces, parseInstagramPlaces } from '../domain/instagramPlaces.js';
import { fetchExternalJson } from '../http.js';
import { log } from '../log.js';

/**
 * Liste en lecture seule des lieux commentés par l'agent Instagram
 * (GET <INSTAGRAM_AGENT_URL>/lieux-commentes, clé d'API dans l'en-tête
 * x-api-key ; contrat dans docs/api.md). Les deux secrets sont des secrets
 * Supabase du projet de Mon guide, jamais dans le dépôt ni dans
 * l'application. Une panne, une réponse illisible ou une configuration absente
 * ne lève jamais d'erreur : liste vide, journalisée.
 *
 * @returns {Promise<{ places: import('../domain/instagramPlaces.js').InstagramPlace[], ok: boolean }>}
 *   ok : false si l'agent n'a pas répondu (la liste vide ne doit alors pas rester longtemps en cache)
 */
export async function fetchInstagramPlaces() {
  const base = globalThis.Deno?.env.get('INSTAGRAM_AGENT_URL');
  const apiKey = globalThis.Deno?.env.get('INSTAGRAM_AGENT_API_KEY');
  if (!base || !apiKey) {
    // Cause la plus probable d'un lien absent : secrets Supabase non renseignés (on journalise lesquels, jamais leur valeur).
    log('warn', 'instagram_agent_not_configured', { missing: [!base && 'INSTAGRAM_AGENT_URL', !apiKey && 'INSTAGRAM_AGENT_API_KEY'].filter(Boolean) });
    return { places: [], ok: false };
  }
  try {
    const url = `${base.replace(/\/+$/, '')}/lieux-commentes`;
    const json = await fetchExternalJson(url, {
      source: 'instagram-agent',
      headers: { 'x-api-key': apiKey },
      timeoutMs: 5000,
      maxAttempts: 1
    });
    const places = parseInstagramPlaces(json);
    const received = countRawInstagramPlaces(json);
    // Réponse reçue mais illisible (format inattendu, adresses de posts refusées) : on le journalise
    // et on ne garde pas la liste vide 4 h en cache (ok: false = nouvel essai dans 5 min).
    if (received > places.length) log('warn', 'instagram_agent_entries_ignored', { received, kept: places.length });
    if (received > 0 && places.length === 0) return { places, ok: false };
    if (received === 0 && !Array.isArray(json?.places)) log('warn', 'instagram_agent_unreadable_response', {});
    return { places, ok: true };
  } catch (err) {
    log('warn', 'instagram_agent_unavailable', { message: String(err?.message ?? err) });
    return { places: [], ok: false };
  }
}
