import { apiFetch } from './client.js';

export const register = (name, email, password) =>
  apiFetch('/auth/register', { method: 'POST', body: { name, email, password } });

export const login = (email, password) =>
  apiFetch('/auth/login', { method: 'POST', body: { email, password } });

/** Supprime définitivement le compte (vérifié par email + mot de passe). */
export const deleteAccount = (email, password) =>
  apiFetch('/auth/delete-account', { method: 'POST', body: { email, password } });
