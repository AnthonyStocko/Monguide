import { createClient } from '@supabase/supabase-js';

let client;

/**
 * Client Supabase avec la clé service_role, fournie automatiquement par
 * Supabase aux Edge Functions (jamais dans le dépôt ni dans GitHub). Il
 * contourne RLS : réservé aux tables internes (api_cache, app_config,
 * rate_limits). À VÉRIFIER : sur un projet sans clés "legacy", la clé secrète
 * peut être exposée sous un autre nom de variable.
 */
export function getAdminClient() {
  if (!client) {
    client = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}
