import { createClient } from '@supabase/supabase-js';
import * as settings from './settings.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Session d'authentification persistée via le service settings
// (@capacitor/preferences), jamais via localStorage directement.
const preferencesStorage = {
  getItem: (key) => settings.get(key),
  setItem: (key, value) => settings.set(key, value),
  removeItem: (key) => settings.remove(key)
};

/**
 * Client Supabase unique, ou null si .env n'est pas renseigné. À n'utiliser
 * que depuis services/api.js (seul point d'accès réseau de l'application).
 */
export const supabase =
  url && publicKey
    ? createClient(url, publicKey, {
        auth: {
          storage: preferencesStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      })
    : null;
