import { decodeJwtPayload } from '../_shared/auth.js';
import { AppError } from '../_shared/errors.js';
import { fuelPricesEu } from '../_shared/fuelPricesEu.js';
import { fetchExternal } from '../_shared/http.js';
import { log } from '../_shared/log.js';
import { ECB_RATES_URL, WOB_LATEST_URL, parseEcbRates, parseOilBulletin, toFuelRows } from '../_shared/providers/eu/oilBulletin.js';
import { errorResponse, jsonResponse } from '../_shared/respond.js';

/**
 * Tâche planifiée (chaque semaine, pg_cron + pg_net, voir la migration
 * 20260924120100) : télécharge le dernier Bulletin pétrolier et les taux BCE,
 * convertit les prix dans la monnaie de chaque pays et les enregistre dans
 * fuel_prices_eu. En cas d'échec, rien n'est modifié : la dernière version
 * enregistrée reste utilisée.
 *
 * Réservée au rôle service_role (jeton de la tâche planifiée ou lancement
 * manuel par un administrateur) ; aucune version d'application requise.
 */
Deno.serve(async (req) => {
  const started = Date.now();
  let response;
  try {
    if (req.method !== 'POST') throw new AppError(405, 'method_not_allowed', 'Use POST', { Allow: 'POST' });
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (decodeJwtPayload(token)?.role !== 'service_role') throw new AppError(403, 'forbidden', 'service_role required');

    const [wob, ecb] = await Promise.all([
      fetchExternal(WOB_LATEST_URL, { source: 'oil-bulletin', timeoutMs: 20000 }).then((r) => r.arrayBuffer()),
      fetchExternal(ECB_RATES_URL, { source: 'ecb' }).then((r) => r.text())
    ]);
    const bulletin = await parseOilBulletin(new Uint8Array(wob));
    const rates = parseEcbRates(ecb);
    const rows = toFuelRows(bulletin, rates);
    if (!rows.length) throw new AppError(502, 'external_unavailable', 'Empty bulletin');
    await fuelPricesEu.save(rows);

    const summary = { bulletinDate: bulletin.bulletinDate, exchangeRateDate: rates.date, countries: new Set(rows.map((r) => r.country_code)).size, rows: rows.length };
    log('info', 'fuel_eu_refreshed', summary);
    response = jsonResponse(summary);
  } catch (err) {
    log('error', 'fuel_eu_refresh_failed', { message: String(err?.message ?? err) });
    response = errorResponse(err);
  }
  log('info', 'request', { fn: 'fuel-eu-refresh', status: response.status, durationMs: Date.now() - started });
  return response;
});
