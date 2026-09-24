import { EU_MEMBERS } from '@domain/config/countries.js';
import { sourcesFor } from '@domain/config/dataSources.js';
import { formatDate, formatNumber } from '../../i18n/format.js';

/**
 * Contenu de l'export PDF d'un séjour (fonction pure, sans jsPDF) : titre,
 * dates, planning jour par jour (étapes personnelles et hébergements
 * compris), bilan carbone, sources des données. Les adresses personnelles
 * (hébergements, lieux des étapes personnelles) sont masquées sauf si
 * includeAddresses est vrai. Textes dans la langue de l'interface.
 *
 * Blocs : { kind: 'title' | 'subtitle' | 'heading' | 'text' | 'muted', text }
 * et { kind: 'step', time, title, details: string[] }.
 *
 * @param {import('@domain/model.js').Trip} trip
 * @param {{ t: Function, locale: string, includeAddresses: boolean, generatedAt: Date }} options
 * @returns {{ title: string, blocks: object[] }}
 */
export function buildTripDocument(trip, { t, locale, includeAddresses, generatedAt }) {
  const blocks = [];
  const push = (kind, text) => blocks.push({ kind, text });
  const day = (date, style) => formatDate(`${date}T12:00:00Z`, locale, { ...style, timeZone: 'UTC' });
  const number = (value, digits) => formatNumber(value, locale, { maximumFractionDigits: digits });
  const travel = (minutes) => `≈ ${t('planning.travelDuration', { minutes, mode: t(`planning.modeSuffix.${trip.mode}`) })}`;
  const lodgingLabel = (l) => {
    if (includeAddresses) return l.name ? `${l.name} (${l.address})` : l.address;
    return l.name ?? t('export.lodging');
  };
  const lodging = (id) => trip.lodgings?.find((l) => l.id === id) ?? null;

  push('title', trip.title);
  push('subtitle', `${day(trip.startDate, { dateStyle: 'long' })} – ${day(trip.endDate, { dateStyle: 'long' })}`);
  push('subtitle', t('export.meta', { destination: trip.destination.name, count: trip.travelers, mode: t(`modes.${trip.mode}`) }));
  if (!includeAddresses && (trip.lodgings?.length || trip.days.some((d) => d.steps.some((s) => s.type === 'personal' && s.place)))) push('muted', t('export.addressesHidden'));

  for (const d of trip.days) {
    const heading = day(d.date, { weekday: 'long', day: 'numeric', month: 'long' });
    push('heading', heading.charAt(0).toLocaleUpperCase(locale) + heading.slice(1));
    if (d.holiday) push('muted', t('planning.holiday', { name: d.holiday }));
    const start = lodging(d.startLodgingId);
    const end = lodging(d.endLodgingId);
    if (start && d.departure) push('text', `${t('planning.departure', { place: lodgingLabel(start), time: d.departure.time })} ${travel(d.departure.travelMin)}`);

    d.steps.forEach((s, i) => {
      const personal = s.type === 'personal';
      const details = [];
      if (s.travelFromPreviousMin > 0 && (i > 0 || start)) details.push(`${t('planning.fromPrevious')} ${travel(s.travelFromPreviousMin)}`);
      details.push(personal ? t('categories.personal') : s.place ? t(`categories.${s.place.category}`) : t(`generation.stepTypes.${s.type}`));
      if (s.status && s.status !== 'planned') details.push(t(`tracking.status.${s.status}`));
      if (personal && s.place && includeAddresses) details.push([s.place.name !== s.title ? s.place.name : null, s.place.address].filter(Boolean).join(', '));
      if (personal && !s.place) details.push(t('personal.travelUnknown'));
      if (s.customTime && !personal) details.push(t('planning.customTime'));
      if (s.specialties?.length) details.push(t('generation.specialties', { list: s.specialties.join(', ') }));
      if (s.note) details.push(s.note);
      blocks.push({ kind: 'step', time: `${s.start} – ${s.end}`, title: personal ? s.title : (s.place?.name ?? t('generation.freeTime')), details });
    });
    if (end && d.returnTravelMin !== undefined) push('text', `${t('planning.return', { place: lodgingLabel(end) })} ${travel(d.returnTravelMin)}`);
  }

  if (trip.carbon) {
    push('heading', t('generation.carbonTitle'));
    push('text', t('generation.carbonTotal', { value: number(trip.carbon.totalKgCo2e, 2), km: number(trip.carbon.distanceKm, 1) }));
    push('text', ['walk', 'bike', 'transit', 'car'].map((m) => `${t(`modes.${m}`)} : ${t('generation.kg', { value: number(trip.carbon.byMode[m], 2) })}`).join(' · '));
    if (trip.fuelCost) {
      push(
        'text',
        t('generation.fuelCost', {
          amount: formatNumber(trip.fuelCost.amount, locale, { style: 'currency', currency: trip.fuelCost.currency }),
          consumption: number(trip.fuelConsumption, 1)
        })
      );
    }
    push('muted', t('generation.estimates'));
  }

  push('heading', t('export.sourcesTitle'));
  for (const s of sourcesFor(trip.destination.countryCode, trip.mode, EU_MEMBERS)) {
    push('text', `${s.name} — ${t(`export.sourceUses.${s.id}`)} (${s.holder}, ${s.license})`);
  }
  push('muted', t('export.generated', { date: formatDate(generatedAt, locale, { dateStyle: 'long', timeStyle: 'short' }) }));

  return { title: trip.title, blocks };
}

/** Nom de fichier : mon-guide-<titre>-<date de début>.pdf (sans accents ni espaces). */
export function exportFileName(trip) {
  const slug = trip.title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `mon-guide-${slug || 'sejour'}-${trip.startDate}.pdf`;
}
