import { apiFetch } from './client.js';

export const getMe = () => apiFetch('/me');
