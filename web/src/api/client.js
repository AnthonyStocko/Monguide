const TOKEN_KEY = 'monguide_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || 'Erreur inconnue.');
    this.status = status;
    this.code = body?.error;
  }
}

/**
 * Appelle l'API JSON sous /api. Ajoute le jeton s'il existe, et prevdefinit
 * un ApiError { status, code, message } exploitable par l'UI.
 */
export async function apiFetch(path, { method = 'GET', body, headers } = {}) {
  const token = getToken();
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (response.status === 204) return null;

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (response.status === 401) setToken(null);
    throw new ApiError(response.status, data);
  }
  return data;
}

export { ApiError };
