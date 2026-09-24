/**
 * Erreurs renvoyées au client sous la forme { error: { code, message } }
 * (docs/api.md). Le message est destiné aux développeurs ; l'application
 * affiche un texte traduit choisi d'après le code.
 */
export class AppError extends Error {
  /**
   * @param {number} status code HTTP
   * @param {string} code identifiant stable (docs/api.md)
   * @param {string} message
   * @param {Record<string, string>} [headers] en-têtes à ajouter à la réponse
   */
  constructor(status, code, message, headers = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

/** Source externe indisponible (réseau, délai dépassé, 5xx, 429…) : 502. */
export class ExternalError extends AppError {
  /**
   * @param {string} source nom de la source (ex. "open-meteo")
   * @param {number | null} upstreamStatus statut HTTP reçu, null si aucune réponse
   * @param {boolean} retryable une nouvelle tentative a-t-elle un sens ?
   */
  constructor(source, upstreamStatus, retryable) {
    super(502, 'external_unavailable', `External source unavailable: ${source}`);
    this.name = 'ExternalError';
    this.source = source;
    this.upstreamStatus = upstreamStatus;
    this.retryable = retryable;
  }
}
