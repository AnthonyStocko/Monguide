/** Version du serveur, reprise dans l'en-tête User-Agent des appels externes. */
export const SERVER_VERSION = '0.1.0';

/**
 * User-Agent des appels externes : "MonGuide/<version> (contact)". Le contact
 * (URL ou adresse de l'équipe, pas d'un utilisateur) vient du secret
 * MONGUIDE_CONTACT, exigé par plusieurs API publiques (Nominatim, etc.).
 */
export function userAgent() {
  const contact = globalThis.Deno?.env.get('MONGUIDE_CONTACT');
  return contact ? `MonGuide/${SERVER_VERSION} (${contact})` : `MonGuide/${SERVER_VERSION}`;
}
