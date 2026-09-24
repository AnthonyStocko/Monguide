import { useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isSupportedCountry } from '@domain/config/countries.js';
import { geocode } from '../../services/dataApi.js';
import { currentPosition } from '../../services/geolocation.js';
import Button from '../ui/Button.jsx';
import ChoiceGroup from '../ui/ChoiceGroup.jsx';
import PlaceSearch from './PlaceSearch.jsx';

/**
 * Étape 1 : destination (commune d'un pays pris en charge) et rayon
 * d'exploration.
 * @param {{ draft: object, update: (patch: object) => void, errors: Record<string, string>, rules: any }} props
 */
export default function DestinationStep({ draft, update, errors, rules }) {
  const { t, i18n } = useTranslation();
  const [locating, setLocating] = useState({ status: 'idle' });

  const choose = (r) => {
    const destination = { name: r.name, country: r.country, countryCode: r.countryCode, lat: r.lat, lon: r.lon, timezone: r.timezone };
    if (r.region) destination.region = r.region;
    // Changer de destination efface les hébergements saisis pour l'ancienne.
    update({ destination, lodging: null, nightLodgings: [] });
  };

  const useMyPosition = async () => {
    setLocating({ status: 'loading' });
    try {
      const position = await currentPosition();
      const { results } = await geocode({ lat: position.lat, lon: position.lon }, i18n.resolvedLanguage);
      const found = results[0];
      if (!found) setLocating({ status: 'error', messageKey: 'tripForm.destination.notFound' });
      else if (!isSupportedCountry(found.countryCode) || !found.timezone) setLocating({ status: 'error', messageKey: 'destination.unsupported' });
      else {
        choose(found);
        setLocating({ status: 'idle' });
      }
    } catch (err) {
      setLocating({ status: 'error', messageKey: err.messageKey ?? 'errors.unknown' });
    }
  };

  const d = draft.destination;
  return (
    <div className="space-y-5">
      {d && (
        <div className="flex items-center gap-3 rounded-xl bg-primary-soft px-3 py-2" aria-live="polite">
          <MapPin aria-hidden="true" className="size-6 shrink-0 text-primary-strong" />
          <p>
            <span className="block text-ink-muted">{t('tripForm.destination.selected')}</span>
            <span className="font-semibold">{d.name}</span>
            <span className="block">{[d.region, d.country].filter(Boolean).join(', ')}</span>
          </p>
        </div>
      )}
      <PlaceSearch
        label={d ? t('tripForm.destination.change') : t('tripForm.destination.label')}
        hint={t('tripForm.destination.hint')}
        kind="city"
        placeholder={t('tripForm.destination.placeholder')}
        onSelect={choose}
        error={errors.destination && t(`tripForm.errors.${errors.destination}`)}
      />
      <div className="space-y-1">
        <Button variant="secondary" icon={LocateFixed} onClick={useMyPosition} disabled={locating.status === 'loading'} className="w-full">
          {t('tripForm.useMyPosition')}
        </Button>
        <div role="status" aria-live="polite">
          {locating.status === 'loading' && <p className="text-ink-muted">{t('tripForm.locating')}</p>}
          {locating.status === 'error' && <p className="font-medium text-danger-on-soft">{t(locating.messageKey)}</p>}
        </div>
      </div>
      <ChoiceGroup
        name="radiusKm"
        legend={t('tripForm.destination.radius')}
        hint={t('tripForm.destination.radiusHint')}
        layout="row"
        options={rules.trip.radiusOptionsKm.map((km) => ({ value: km, label: t('tripForm.km', { km }) }))}
        value={draft.radiusKm}
        onChange={(radiusKm) => update({ radiusKm })}
        error={errors.radiusKm && t(`tripForm.errors.${errors.radiusKm}`)}
      />
    </div>
  );
}
