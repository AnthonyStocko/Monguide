import { getAdminClient } from '../supabaseAdmin.js';

/**
 * Compteurs quotidiens des appels à l'IA (table ai_usage, migration
 * 20260930100000_ai_usage.sql), par client et au total (client "*").
 * @type {import('./types.js').AiUsageStore}
 */
export const supabaseUsageStore = {
  async reserve({ day, client, userLimit, globalLimit }) {
    const { data, error } = await getAdminClient().rpc('ai_usage_reserve', {
      p_day: day,
      p_client: client,
      p_user_limit: userLimit,
      p_global_limit: globalLimit
    });
    if (error) throw new Error(`ai_usage_reserve: ${error.code}`);
    return data === true;
  },
  async addTokens({ day, client, tokens }) {
    const { error } = await getAdminClient().rpc('ai_usage_add_tokens', { p_day: day, p_client: client, p_tokens: tokens });
    if (error) throw new Error(`ai_usage_add_tokens: ${error.code}`);
  }
};
