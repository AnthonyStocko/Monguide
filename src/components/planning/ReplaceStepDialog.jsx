import { useState } from 'react';
import { BadgeCheck, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { distanceKm } from '@domain/geo.js';
import { alternativesFor } from '@domain/replaceStep.js';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';
import { useFormat } from '../../i18n/useFormat.js';
import { getPlaces } from '../../services/dataApi.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';
import { CATEGORY_ICONS } from './categories.js';

/**
 * Remplacement d'une étape : les 3 meilleurs candidats de la réserve
 * (trip.candidates, disponible hors ligne), puis "Plus de choix" qui
 * interroge la fonction places quand le réseau est disponible.
 * @param {{ trip: object, dayIndex: number, stepIndex: number, onPick: (place: object) => void, onClose: () => void }} props
 */
export default function ReplaceStepDialog({ trip, dayIndex, stepIndex, onPick, onClose }) {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const online = useOnlineStatus();
  const [extra, setExtra] = useState({ status: 'idle', places: [] });
  const step = trip.days[dayIndex].steps[stepIndex];
  const options = alternativesFor(trip, dayIndex, stepIndex, { limit: extra.places.length ? 8 : 3, extraPlaces: extra.places });

  const more = async () => {
    setExtra({ status: 'loading', places: [] });
    try {
      const { data } = await getPlaces({
        lat: trip.destination.lat,
        lon: trip.destination.lon,
        radiusKm: trip.destination.radiusKm,
        countryCode: trip.destination.countryCode,
        profile: trip.profile,
        lunch: trip.lunch,
        lang: i18n.resolvedLanguage
      });
      setExtra({ status: 'ok', places: data.places });
    } catch (error) {
      setExtra({ status: 'error', places: [], error });
    }
  };

  return (
    <Dialog title={t('replace.title', { name: step.place?.name ?? t('generation.freeTime') })} onClose={onClose}>
      {options.length === 0 && <p className="text-ink-muted">{t('replace.none')}</p>}
      <ul className="space-y-2">
        {options.map((p) => {
          const Icon = CATEGORY_ICONS[p.category];
          const km = step.place ? distanceKm(step.place, p) : null;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex min-h-12 w-full items-start gap-3 rounded-xl border-2 border-line p-3 text-left hover:border-primary-strong hover:bg-primary-soft"
              >
                <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary-strong" />
                <span className="flex-1">
                  <span className="block font-semibold">{p.name}</span>
                  <span className="block text-ink-muted">
                    {t(`categories.${p.category}`)}
                    {km !== null && ` · ${t('replace.distance', { km: format.number(km, { maximumFractionDigits: 1 }) })}`}
                  </span>
                  {p.certified && p.certification && (
                    <Badge tone="secondary" icon={BadgeCheck} className="mt-1">
                      {t(`certifications.${p.certification}`)}
                    </Badge>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {extra.status !== 'ok' && (
        <Button variant="secondary" icon={Search} onClick={more} disabled={!online || extra.status === 'loading'} className="w-full">
          {extra.status === 'loading' ? t('replace.loading') : t('replace.more')}
        </Button>
      )}
      {!online && <p className="text-ink-muted">{t('replace.offline')}</p>}
      {extra.status === 'error' && <p className="font-medium text-danger-on-soft">{t(extra.error.messageKey ?? 'errors.unknown')}</p>}
    </Dialog>
  );
}
