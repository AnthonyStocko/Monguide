// Séjours de référence (Prompt 10.0) : génère des séjours aux paramètres fixes avec les fonctions
// de production (geocode, generate, places), comme l'application, puis écrit un diagnostic :
//   node --use-system-ca scripts/quality/reference-trips.js [--only bruxelles,lyon] [--local] [--tag phaseB]
// --local : génération par le code de ce dépôt (sources réelles, lieux OSM de production), pour
// valider un changement avant de le déployer ; résultats dans results/<date>-local/.
// Adresse et clé publique lues dans .env. Écrit scripts/quality/results/<date>/<séjour>.json
// (séjour généré, réserve de lieux, diagnostic, critères de validation comparés aux séjours de
// référence de BASELINE) et report.md.
// Diagnostic par étape : source, catégorie, identifiant Wikidata, nombre d'articles Wikipédia
// (sitelinks), libellé affiché et sa langue, durée ; par journée, les temps morts (écarts de plus
// de 30 min sans étape ni trajet). Bruxelles : présence et rang des grands lieux attendus.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activityType } from '../../supabase/functions/_shared/domain/activity.js';
import { displayName } from '../../supabase/functions/_shared/domain/displayName.js';
import { distanceKm, roundCoord } from '../../supabase/functions/_shared/domain/geo.js';
import { scorePlace } from '../../supabase/functions/_shared/domain/scorePlace.js';
import { effectiveRadiusKm } from '../../supabase/functions/_shared/domain/travel.js';
import { toMinutes } from '../../supabase/functions/_shared/domain/time.js';
import { RULES } from '../../supabase/functions/_shared/domain/config/rules.js';
import { countryInfo } from '../../supabase/functions/_shared/domain/config/countries.js';
import { API_VERSION } from '../../supabase/functions/_shared/domain/version.js';
import { dedupePlaces } from '../../supabase/functions/_shared/domain/dedupePlaces.js';
import { generateTrip } from '../../supabase/functions/_shared/domain/generateTrip.js';
import { isPlace } from '../../supabase/functions/_shared/domain/model.js';
import { applyPlaceQuality, isGenericLabel } from '../../supabase/functions/_shared/domain/scoring/exclusions.js';
import { getProvider } from '../../supabase/functions/_shared/providers/index.js';
import { labelLanguages } from '../../supabase/functions/_shared/services/wikidata.js';
import { addSignals, notablePlacesSource } from '../../supabase/functions/_shared/services/wikidataSignals.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;

/** Séjours de référence d'avant le Prompt 10.0 (comparaison des critères). */
const BASELINE = '2026-10-30';
/** Écart sans étape ni trajet signalé comme temps mort (minutes). */
const DEAD_TIME_MIN = 30;
const LANG = 'fr';
const UA = { 'User-Agent': 'MonGuide-quality/1.0 (monguide.app@outlook.com)', 'Api-User-Agent': 'MonGuide-quality/1.0' };

/**
 * Séjours de référence. Paramètres non précisés par le cahier : formulaire par défaut
 * (rayon 10 km, profil équilibré, déjeuner « les deux », dîner au restaurant, 2 voyageurs),
 * à pied en ville, en voiture à Villefranche-sur-Saône (petite ville, lieux dispersés).
 */
export const REFERENCE_TRIPS = [
  {
    id: 'bruxelles',
    query: 'Bruxelles',
    countryCode: 'BE',
    // 2e week-end de décembre 2026 : vendredi 11 au dimanche 13.
    startDate: '2026-12-11',
    endDate: '2026-12-13',
    travelers: 6,
    mode: 'walk',
    // Place de la Bourse (Beursplein), coordonnées OSM.
    lodging: { address: 'Place de la Bourse, 1000 Bruxelles', lat: 50.8483, lon: 4.3498 }
  },
  { id: 'lyon', query: 'Lyon', countryCode: 'FR', startDate: '2027-05-14', endDate: '2027-05-15', travelers: 2, mode: 'walk' },
  { id: 'villefranche', query: 'Villefranche-sur-Saône', countryCode: 'FR', startDate: '2027-10-09', endDate: '2027-10-10', travelers: 2, mode: 'car', fuelType: 'diesel' },
  { id: 'colmar', query: 'Colmar', countryCode: 'FR', startDate: '2026-12-05', endDate: '2026-12-06', travelers: 2, mode: 'walk' },
  { id: 'barcelone', query: 'Barcelone', countryCode: 'ES', startDate: '2027-07-09', endDate: '2027-07-11', travelers: 2, mode: 'walk' }
];

/** Grands lieux attendus à Bruxelles (identifiants vérifiés par wbsearchentities le 2026-10-30). */
const BRUSSELS_EXPECTED = {
  Q215429: 'Grand-Place',
  Q1491935: 'Galeries Royales Saint-Hubert',
  Q152072: 'Manneken-Pis',
  Q1865794: 'Mont des Arts',
  // Jardin du Mont des Arts : parc OSM (leisure=park) portant cet identifiant.
  Q23783446: 'Jardin du Mont des Arts'
};
/** Lieux douteux relevés à Bruxelles (recherchés par nom dans la réserve). */
const BRUSSELS_SUSPECTS = [/jardin d'enfants/i, /arri[eè]re[- ]maison/i];

const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^\w+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const apiHeaders = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
  'x-monguide-api': String(API_VERSION),
  'x-monguide-app': pkg.version
};

async function callFunction(name, { method = 'GET', query = '', body } = {}) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/${name}${query}`, {
    method,
    headers: { ...apiHeaders, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000)
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${name} : HTTP ${res.status} ${JSON.stringify(json)}`);
  return json;
}

/** Règles effectives en production (fonction config), sinon les règles par défaut. */
async function productionRules() {
  try {
    return { rules: (await callFunction('config')).rules, source: 'app_config (production)' };
  } catch (err) {
    return { rules: RULES, source: `règles par défaut (${err.message})` };
  }
}

/** Demande de génération telle que buildTrip (domain/tripDraft.js) la construit. */
async function tripRequest(f, rules) {
  const { results } = await callFunction('geocode', { query: `?kind=city&lang=${LANG}&q=${encodeURIComponent(f.query)}` });
  const d = results.find((r) => r.countryCode === f.countryCode);
  if (!d) throw new Error(`${f.query} : destination introuvable`);
  const nights = [];
  for (let t = Date.parse(`${f.startDate}T00:00:00Z`); t < Date.parse(`${f.endDate}T00:00:00Z`); t += 86400000) nights.push(new Date(t).toISOString().slice(0, 10));
  const trip = {
    schemaVersion: 3,
    id: `reference-${f.id}`,
    title: d.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deleted: false,
    destination: { name: d.name, countryCode: d.countryCode, lat: d.lat, lon: d.lon, radiusKm: rules.trip.defaultRadiusKm },
    timezone: d.timezone,
    currency: countryInfo(d.countryCode).currency,
    startDate: f.startDate,
    endDate: f.endDate,
    travelers: f.travelers,
    mode: f.mode,
    profile: 'balanced',
    lunch: 'both',
    dinner: 'restaurant',
    prefs: { vegetarian: false, wheelchair: false },
    lodgings: f.lodging ? [{ id: `lodging-${f.id}`, address: f.lodging.address, lat: f.lodging.lat, lon: f.lodging.lon, nights }] : [],
    days: [],
    candidates: []
  };
  if (f.fuelType) trip.fuelType = f.fuelType;
  return trip;
}

/** Fiches Wikidata (articles, libellés, nature, désignation patrimoniale), par lots de 50. */
async function wikidataEntities(ids, languages) {
  const out = {};
  const list = [...new Set(ids)].filter((q) => /^Q\d+$/.test(q));
  for (let i = 0; i < list.length; i += 50) {
    const params = new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: list.slice(i, i + 50).join('|'), props: 'sitelinks|labels|claims', languages: languages.join('|') });
    const res = await fetch(`https://www.wikidata.org/w/api.php?${params}`, { headers: UA, signal: AbortSignal.timeout(30000) });
    const json = await res.json();
    for (const [id, e] of Object.entries(json.entities ?? {})) {
      const claim = (p) => (e.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
      out[id] = {
        sitelinks: wikipediaCount(e.sitelinks ?? {}),
        labels: Object.fromEntries(Object.entries(e.labels ?? {}).map(([l, v]) => [l, v.value])),
        instanceOf: claim('P31'),
        heritage: claim('P1435'),
        coord: e.claims?.P625?.[0]?.mainsnak?.datavalue?.value ?? null
      };
    }
  }
  return out;
}

/** Projets Wikimedia en *wiki qui ne sont pas des Wikipédia. */
const NOT_WIKIPEDIA = new Set(['commonswiki', 'specieswiki', 'metawiki', 'mediawikiwiki', 'wikidatawiki', 'sourceswiki', 'wikimaniawiki', 'outreachwiki', 'incubatorwiki', 'wikifunctionswiki', 'foundationwiki', 'testwiki']);
const wikipediaCount = (sitelinks) => Object.keys(sitelinks).filter((k) => /^[a-z_]+wiki$/.test(k) && !NOT_WIKIPEDIA.has(k)).length;

/** Libellés français des classes (nature, désignation). */
async function classLabels(ids) {
  const out = {};
  const list = [...new Set(ids)];
  for (let i = 0; i < list.length; i += 50) {
    const params = new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: list.slice(i, i + 50).join('|'), props: 'labels', languages: 'fr|en' });
    const json = await (await fetch(`https://www.wikidata.org/w/api.php?${params}`, { headers: UA })).json();
    for (const [id, e] of Object.entries(json.entities ?? {})) out[id] = e.labels?.fr?.value ?? e.labels?.en?.value ?? id;
  }
  return out;
}

async function sparql(query) {
  const res = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { ...UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query }).toString(),
    signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) throw new Error(`SPARQL HTTP ${res.status}`);
  return (await res.json()).results.bindings;
}

/** Libellé affiché (displayName, interface en français) et sa langue. */
function labelInfo(place, entity, languages) {
  const shown = displayName(place, LANG);
  if (place.unnamed) return { label: shown, labelLang: `générique (${LANG})` };
  if (place.source === 'wikidata') {
    const lang = languages.find((l) => entity?.labels?.[l] === place.name);
    return { label: shown, labelLang: lang ?? '?' };
  }
  if (place.names?.[LANG] === shown) return { label: shown, labelLang: LANG };
  const variant = Object.entries(place.names ?? {}).find(([, v]) => v === shown)?.[0];
  if (variant) return { label: shown, labelLang: variant };
  if (place.source === 'osm') {
    const same = entity && Object.entries(entity.labels).filter(([, v]) => v === shown).map(([l]) => l);
    return { label: shown, labelLang: same?.length ? `name (= ${same.join('/')})` : 'name (local)' };
  }
  return { label: shown, labelLang: LANG };
}

/** Étapes et temps morts d'une journée. */
function describeDay(day, entities, languages, classes) {
  const steps = day.steps.map((s) => {
    const p = s.place;
    const e = p?.wikidata ? entities[p.wikidata] : null;
    return {
      type: s.type,
      start: s.start,
      end: s.end,
      durationMin: toMinutes(s.end) - toMinutes(s.start),
      travelFromPreviousMin: s.travelFromPreviousMin ?? null,
      badges: s.badges,
      ...(p
        ? {
            placeId: p.id,
            source: p.source,
            category: p.category,
            activityType: activityType(p),
            certification: p.certification ?? null,
            wikidata: p.wikidata ?? null,
            sitelinks: e ? e.sitelinks : null,
            notoriety: p.notoriety ?? null,
            instanceOf: e ? e.instanceOf.map((q) => `${q} ${classes[q] ?? ''}`.trim()) : [],
            heritage: e ? e.heritage.map((q) => `${q} ${classes[q] ?? ''}`.trim()) : [],
            ...labelInfo(p, e, languages)
          }
        : { label: s.type === 'dinner' && !s.badges.includes('free_time') ? 'Soirée libre' : 'Temps libre (aucun lieu)' })
    };
  });
  // Temps mort : fin d'une étape -> début du trajet vers la suivante, au-delà de DEAD_TIME_MIN.
  // Un « temps libre » sans lieu compte comme un trou (créneau non rempli).
  const deadTimes = [];
  const busy = day.steps.filter((s) => s.place || (s.type === 'dinner' && !s.badges.includes('free_time')));
  for (let i = 1; i < busy.length; i++) {
    const from = toMinutes(busy[i - 1].end);
    const to = toMinutes(busy[i].start) - (busy[i].travelFromPreviousMin ?? 0);
    if (to - from > DEAD_TIME_MIN) deadTimes.push({ from: busy[i - 1].end, to: hhmm(to), minutes: to - from, after: busy[i - 1].type, before: busy[i].type });
  }
  return { date: day.date, departure: day.departure ?? null, returnTravelMin: day.returnTravelMin ?? null, steps, deadTimes, freeSlots: steps.filter((s) => s.badges.includes('free_time')).length };
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Bruxelles : pourquoi les grands lieux attendus manquent, et d'où viennent les lieux douteux. */
async function diagnoseBrussels({ trip, pool, entities, classes, rules, languages }) {
  const used = new Set(trip.days.flatMap((d) => d.steps.map((s) => s.place?.id).filter(Boolean)));
  const candidateIds = new Set(trip.candidates.map((p) => p.id));
  const center = { lat: trip.destination.lat, lon: trip.destination.lon };
  const lodging = trip.lodgings[0];
  const radius = effectiveRadiusKm(trip.mode, trip.destination.radiusKm, rules);
  const point = { lat: Math.round(center.lat * 100) / 100, lon: Math.round(center.lon * 100) / 100 };

  // Sélection de la requête des monuments (P1435, les plus proches d'abord), sans LIMIT : rang de chaque lieu.
  const query =
    `SELECT DISTINCT ?item ?dist WHERE { SERVICE wikibase:around { ?item wdt:P625 ?c . ` +
    `bd:serviceParam wikibase:center "Point(${point.lon} ${point.lat})"^^geo:wktLiteral ; wikibase:radius "${trip.destination.radiusKm}" ; wikibase:distance ?dist . } ` +
    `?item wdt:P1435 [] . } ORDER BY ?dist`;
  const ranked = [];
  const distances = {};
  let sparqlError = null;
  try {
    for (const b of await sparql(query)) {
      const q = b.item.value.split('/').pop();
      if (!(q in distances)) {
        distances[q] = Number(b.dist?.value);
        ranked.push(q);
      }
    }
  } catch (err) {
    sparqlError = err.message;
  }
  // Les sparql() ne trient pas toujours la requête externe : tri par distance.
  ranked.sort((a, b) => distances[a] - distances[b]);
  const limit = rules.wikidata.limit;
  Object.assign(entities, await wikidataEntities(ranked.slice(0, limit).filter((q) => !entities[q]), languages));
  const lastKeptKm = ranked.length >= limit ? distances[ranked[limit - 1]] : null;

  const scoreOf = (p) => scorePlace(p, { distanceKm: distanceKm(lodging ?? center, p), effectiveRadiusKm: radius, categoryUses: 0 }, rules);
  const expected = await Promise.all(
    Object.entries(BRUSSELS_EXPECTED).map(async ([qid, name]) => {
      const e = entities[qid];
      const inPool = pool.filter((p) => p.wikidata === qid || p.id === `wikidata:${qid}`);
      const pos = e?.coord ? { lat: e.coord.latitude, lon: e.coord.longitude } : null;
      return {
        qid,
        name,
        sitelinks: e?.sitelinks ?? null,
        instanceOf: (e?.instanceOf ?? []).map((q) => `${q} ${classes[q] ?? ''}`.trim()),
        heritageP1435: (e?.heritage ?? []).map((q) => `${q} ${classes[q] ?? ''}`.trim()),
        distanceFromQueryCenterKm: pos ? round2(distanceKm(point, pos)) : null,
        monumentsQueryRank: ranked.length ? (ranked.indexOf(qid) >= 0 ? ranked.indexOf(qid) + 1 : 'absent (pas de P1435 ou hors rayon)') : sparqlError,
        inPlacesPool: inPool.map((p) => ({ id: p.id, source: p.source, category: p.category, certified: p.certified, indoor: p.indoor, name: p.name, scoreFromLodging: scoreOf(p) })),
        usedInTrip: inPool.some((p) => used.has(p.id)),
        inCandidates: inPool.some((p) => candidateIds.has(p.id))
      };
    })
  );
  const suspects = pool
    .filter((p) => BRUSSELS_SUSPECTS.some((re) => re.test(p.name) || Object.values(p.names ?? {}).some((n) => re.test(n))))
    .map((p) => {
      const e = p.wikidata ? entities[p.wikidata] : null;
      return {
        id: p.id,
        name: p.name,
        source: p.source,
        category: p.category,
        certified: p.certified,
        certification: p.certification ?? null,
        wikidata: p.wikidata ?? null,
        sitelinks: e?.sitelinks ?? null,
        labels: e?.labels ?? null,
        instanceOf: (e?.instanceOf ?? []).map((q) => `${q} ${classes[q] ?? ''}`.trim()),
        heritageP1435: (e?.heritage ?? []).map((q) => `${q} ${classes[q] ?? ''}`.trim()),
        monumentsQueryRank: ranked.indexOf(p.wikidata) + 1 || null,
        distanceFromLodgingKm: round2(distanceKm(lodging ?? center, p)),
        scoreFromLodging: scoreOf(p),
        usedInTrip: used.has(p.id)
      };
    });
  // Désignations patrimoniales des 300 monuments retenus par la production.
  const designations = {};
  for (const q of ranked.slice(0, limit)) for (const h of entities[q]?.heritage ?? []) designations[h] = (designations[h] ?? 0) + 1;
  const sitelinksOfKept = ranked.slice(0, limit).map((q) => entities[q]?.sitelinks ?? 0);
  return {
    queryCenter: point,
    monumentsInRadius: ranked.length || null,
    productionLimit: limit,
    lastKeptDistanceKm: lastKeptKm === null ? null : round2(lastKeptKm),
    keptWithoutWikipedia: sitelinksOfKept.filter((n) => n === 0).length,
    designationsOfKept: Object.entries(designations).sort((a, b) => b[1] - a[1]).map(([q, n]) => ({ designation: `${q} ${classes[q] ?? ''}`.trim(), count: n })),
    expected,
    suspects,
    ...(sparqlError ? { sparqlError } : {})
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

function markdown(results, meta) {
  const lines = [`# Séjours de référence — ${meta.date}`, '', `Règles : ${meta.rulesSource}. Temps mort : écart de plus de ${DEAD_TIME_MIN} min sans étape ni trajet.`, ''];
  for (const r of results) {
    if (r.error) {
      lines.push(`## ${r.id}`, '', `Échec : ${r.error}`, '');
      continue;
    }
    const t = r.trip;
    lines.push(
      `## ${t.destination.name} (${r.id})`,
      '',
      `${t.startDate} → ${t.endDate}, ${t.travelers} voyageurs, ${t.mode}, profil ${t.profile}, rayon ${t.destination.radiusKm} km${t.lodgings.length ? `, logement : ${t.lodgings[0].address}` : ''}.`,
      `Réserve (places) : ${r.poolSummary.total} lieux — ${Object.entries(r.poolSummary.bySource).map(([k, v]) => `${k} ${v}`).join(', ')}. Alertes : ${r.warnings.map((w) => w.code + (w.source ? `:${w.source}` : '')).join(', ') || 'aucune'}.`,
      ''
    );
    for (const d of r.days) {
      lines.push(`### ${d.date}${d.departure ? ` — départ ${d.departure.time}` : ''}`, '', '| Heure | Type | Lieu (libellé, langue) | Source | Catégorie | Wikidata | Articles | Notoriété | Durée | Badges |', '|---|---|---|---|---|---|---|---|---|---|');
      for (const s of d.steps) {
        lines.push(
          `| ${s.start}–${s.end} | ${s.type} | ${s.label}${s.labelLang ? ` (${s.labelLang})` : ''} | ${s.source ?? '—'} | ${s.category ?? '—'}${s.activityType && s.activityType !== s.category ? ` / ${s.activityType}` : ''} | ${s.wikidata ?? '—'} | ${s.sitelinks ?? '—'} | ${s.notoriety ?? '—'} | ${s.durationMin} min${s.travelFromPreviousMin ? ` (+${s.travelFromPreviousMin} trajet)` : ''} | ${s.badges.join(', ')} |`
        );
      }
      lines.push('', d.deadTimes.length ? `Temps morts : ${d.deadTimes.map((g) => `${g.from}–${g.to} (${g.minutes} min, ${g.after} → ${g.before})`).join(' ; ')}` : 'Temps morts : aucun', '');
    }
    if (r.checks) {
      const c = r.checks;
      lines.push(
        'Critères :',
        '',
        `- visites : ${c.visits}${c.visitsBefore !== undefined ? ` (avant : ${c.visitsBefore})` : ''}`,
        `- libellés génériques : ${c.genericLabels.length ? c.genericLabels.join(', ') : 'aucun'}`,
        `- incontournables : ${c.mustSee.join(', ') || 'aucun'}`,
        `- coups d'œil : ${c.glances.join(', ') || 'aucun'}`,
        ...(c.expected ? Object.entries(c.expected).map(([k, v]) => `- ${k} : ${v}`) : []),
        ...(r.excluded ? [`- lieux écartés : ${r.excluded.count} (${Object.entries(r.excluded.reasons).map(([k, v]) => `${k} ${v}`).join(', ')})`] : []),
        ''
      );
    }
    lines.push('Lieux les plus connus de la réserve non retenus (articles Wikipédia) :', '');
    for (const p of r.notableUnused) lines.push(`- ${p.name} — ${p.sitelinks} articles, ${p.source}/${p.category}, ${p.distanceKm} km`);
    lines.push('');
  }
  return lines.join('\n');
}


/** Cache en mémoire (mode --local) : même interface que le cache partagé. */
function memoryCache() {
  const map = new Map();
  return {
    lookup: async (key) => (map.has(key) ? { value: map.get(key), fresh: true } : undefined),
    set: async (key, _source, value) => void map.set(key, value)
  };
}

/** Séjour généré par la fonction generate de production, et réserve de la fonction places. */
async function generateRemote(request) {
  const generated = await callFunction('generate', { method: 'POST', body: { tripRequest: request, lang: LANG, review: { consent: false } } });
  const d = request.destination;
  const { places: pool, sources: poolSources } = await callFunction('places', {
    method: 'POST',
    body: { lat: d.lat, lon: d.lon, radiusKm: d.radiusKm, countryCode: d.countryCode, profile: request.profile, lunch: request.lunch, lang: LANG }
  });
  return { trip: generated.trip, warnings: generated.warnings, sources: generated.sources, pool, poolSources };
}

/**
 * Mode --local : le code de ce dépôt (collecte comme collectPlaces, puis generateTrip) avec
 * les sources réelles (Wikidata, data.gouv.fr), sauf les lieux OpenStreetMap, lus dans la
 * réponse de la fonction places de production (tuiles du bucket privé, inaccessibles ici).
 * Ni météo ni jours fériés (séjours à plus de 16 jours).
 */
async function generateLocal(request) {
  const d = request.destination;
  const ctx = { rules: RULES, lang: LANG, countryCode: d.countryCode, cache: memoryCache() };
  const provider = getProvider(d.countryCode);
  const point = { lat: roundCoord(d.lat), lon: roundCoord(d.lon) };
  const [heritage, terroir, notable, remote, co2] = await Promise.all([
    provider.heritage(point, d.radiusKm, ctx),
    provider.terroir(point, ctx),
    notablePlacesSource(point, d.radiusKm, ctx),
    callFunction('places', { method: 'POST', body: { lat: d.lat, lon: d.lon, radiusKm: d.radiusKm, countryCode: d.countryCode, profile: request.profile, lunch: request.lunch, lang: LANG } }),
    provider.co2Factors(d.countryCode)
  ]);
  // Lieux OSM de production (format antérieur) : signaux OSM perdus, identifiant Wikidata gardé.
  const osm = remote.places.filter((p) => p.source === 'osm').map(({ notoriety: _n, notable: _b, glance: _g, sitelinks: _s, ...p }) => p);
  const collected = [...heritage.flatMap((o) => o.data ?? []), ...osm, ...(notable.data ?? [])].filter(isPlace);
  const { places: kept, excluded } = applyPlaceQuality(await addSignals(collected, point, d.radiusKm, ctx), RULES, { today: new Date().toISOString().slice(0, 10) });
  const pool = dedupePlaces(kept, RULES.places.dedupDistanceM);
  let seq = 0;
  const { trip, warnings } = generateTrip({ trip: request, places: pool, appellations: terroir.data ?? [], co2Factors: co2, makeId: () => `local-${(seq += 1)}` }, RULES);
  const sources = [...heritage, terroir, notable, { name: 'osm', status: 'ok', message: `production (${osm.length} lieux)` }].map(({ data: _d, query: _q, ...x }) => x);
  return { trip, warnings, sources, pool, poolSources: sources, excluded };
}

/** Critères de validation (Prompt 10.0, Phase A). */
function checks(result, baseline) {
  const steps = result.trip.days.flatMap((d) => d.steps);
  const labels = result.days.flatMap((d) => d.steps.filter((s) => s.placeId).map((s) => s.label));
  const out = { genericLabels: labels.filter((l) => isGenericLabel(l)) };
  const visits = (t) => t.days.flatMap((d) => d.steps).filter((s) => s.place && ['culture', 'outdoor', 'relax'].includes(s.type)).length;
  out.visits = visits(result.trip);
  if (baseline) out.visitsBefore = visits(baseline.trip);
  out.mustSee = steps.filter((s) => s.badges.includes('must_see')).map((s) => displayName(s.place, LANG));
  out.glances = steps.filter((s) => s.badges.includes('glance')).map((s) => displayName(s.place, LANG));
  if (result.id === 'bruxelles') {
    out.expected = Object.fromEntries(
      Object.entries(BRUSSELS_EXPECTED).map(([qid, name]) => {
        const step = steps.find((s) => s.place?.wikidata === qid || s.place?.id === `wikidata:${qid}`);
        return [name, step ? `${step.start}–${step.end} ${step.type}${step.badges.length ? ` [${step.badges.join(', ')}]` : ''}` : 'absent'];
      })
    );
  }
  return out;
}

const local = args.includes('--local');
const { rules: remoteRules, source: remoteSource } = await productionRules();
const rules = local ? RULES : remoteRules;
const rulesSource = local ? 'règles de ce dépôt (mode --local ; lieux OSM de production)' : remoteSource;
const date = new Date().toISOString().slice(0, 10);
const tag = args.includes('--tag') ? `-${args[args.indexOf('--tag') + 1]}` : '';
const outDir = join(root, 'scripts', 'quality', 'results', `${date}${local ? '-local' : ''}${tag}`);
const baselineDir = join(root, 'scripts', 'quality', 'results', BASELINE);
mkdirSync(outDir, { recursive: true });
const results = [];

for (const f of REFERENCE_TRIPS.filter((t) => !only || only.includes(t.id))) {
  console.log(`${f.id} : génération${local ? ' locale' : ''}…`);
  try {
    const request = await tripRequest(f, rules);
    const started = Date.now();
    const { trip, warnings, sources, pool, poolSources, excluded } = local ? await generateLocal(request) : await generateRemote(request);
    const generateMs = Date.now() - started;
    const d = request.destination;
    const languages = labelLanguages(LANG, countryInfo(d.countryCode)?.languages ?? []);
    const stepPlaces = trip.days.flatMap((day) => day.steps.map((s) => s.place).filter(Boolean));
    const ids = [...stepPlaces, ...trip.candidates, ...pool].map((p) => p.wikidata).filter(Boolean);
    if (f.id === 'bruxelles') ids.push(...Object.keys(BRUSSELS_EXPECTED));
    const entities = await wikidataEntities(ids, languages);
    const classes = await classLabels(Object.values(entities).flatMap((e) => [...e.instanceOf, ...e.heritage]));

    const days = trip.days.map((day) => describeDay(day, entities, languages, classes));
    const used = new Set(stepPlaces.map((p) => p.id));
    const notableUnused = pool
      .filter((p) => !used.has(p.id) && p.category !== 'restaurant' && p.wikidata && entities[p.wikidata])
      .map((p) => ({ name: displayName(p, LANG), id: p.id, source: p.source, category: p.category, sitelinks: entities[p.wikidata].sitelinks, distanceKm: round2(distanceKm(trip.lodgings[0] ?? d, p)) }))
      .sort((a, b) => b.sitelinks - a.sitelinks)
      .slice(0, 12);
    const bySource = {};
    for (const p of pool) bySource[`${p.source}/${p.category}`] = (bySource[`${p.source}/${p.category}`] ?? 0) + 1;
    const result = {
      id: f.id,
      params: f,
      generateMs,
      warnings,
      sources,
      poolSources,
      poolSummary: { total: pool.length, bySource: Object.fromEntries(Object.entries(bySource).sort()) },
      days,
      notableUnused,
      trip,
      pool
    };
    if (excluded) {
      const reasons = {};
      for (const x of excluded) reasons[x.reason] = (reasons[x.reason] ?? 0) + 1;
      result.excluded = { count: excluded.length, reasons, sample: excluded.slice(0, 40) };
    }
    let baseline = null;
    try {
      baseline = JSON.parse(readFileSync(join(baselineDir, `${f.id}.json`), 'utf8'));
    } catch {
      // Pas de séjour de référence antérieur.
    }
    result.checks = checks(result, baseline);
    if (f.id === 'bruxelles' && !local) result.brussels = await diagnoseBrussels({ trip, pool, entities, classes, rules, languages });
    writeFileSync(join(outDir, `${f.id}.json`), JSON.stringify(result, null, 2));
    results.push(result);
    console.log(`${f.id} : ${days.reduce((n, x) => n + x.steps.length, 0)} étapes, ${pool.length} lieux en réserve (${generateMs} ms)`);
  } catch (err) {
    console.log(`${f.id} : échec (${err.stack ?? err.message})`);
    results.push({ id: f.id, error: err.message });
  }
}

writeFileSync(join(outDir, 'report.md'), markdown(results, { date, rulesSource }));
console.log(`Résultats : ${outDir}`);
