import { corsHeaders as supabaseCorsHeaders } from '@supabase/supabase-js/cors';

/** Origines autorisées : application Android, iOS (plus tard), développement. */
export const ALLOWED_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost:5173'];

// En-têtes envoyés par le SDK Supabase (liste tenue à jour par le SDK) + ceux de Mon guide.
const ALLOWED_HEADERS = `${supabaseCorsHeaders['Access-Control-Allow-Headers']}, x-monguide-api, x-monguide-app`;

/**
 * En-têtes CORS pour la requête ; Access-Control-Allow-Origin n'est présent
 * que pour une origine autorisée.
 * @param {Request} req
 * @returns {Record<string, string>}
 */
export function corsHeaders(req) {
  const headers = {
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  const origin = req.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

/**
 * Réponse à une requête OPTIONS (pré-vérification CORS).
 * @param {Request} req
 */
export function preflightResponse(req) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
