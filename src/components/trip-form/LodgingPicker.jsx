import { useState } from 'react';
import { BedDouble, LocateFixed, Map as MapIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { geocode } from '../../services/dataApi.js';
import { currentPosition } from '../../services/geolocation.js';
import MapPicker from '../map/MapPicker.jsx';
import Button from '../ui/Button.jsx';
import PlaceSearch from './PlaceSearch.jsx';

/** Adresse lisible d'une position (recherche inverse) ; coordonnées à défaut. */
async function addressAt(point, lang) {
  try {
    const { results } = await geocode({ kind: 'address', lat: point.lat, lon: point.lon }, lang);
    if (results[0]) return results[0].address;
  } catch {
    // adresse introuvable : on garde les coordonnées
  }
  return `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
}

/**
 * Saisie d'un hébergement : recherche d'adresse (favorisant la destination),
 * "Utiliser ma position" ou "Choisir sur la carte", et nom facultatif.
 * @param {{
 *   idPrefix: string,
 *   value: import('@domain/tripDraft.js').LodgingPlace | null,
 *   onChange: (place: import('@domain/tripDraft.js').LodgingPlace | null) => void,
 *   destination: { lat: number, lon: number },
 *   error?: string,
 *   searchLabel?: string
 * }} props
 */
export default function LodgingPicker({ idPrefix, value, onChange, destination, error, searchLabel }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const [showMap, setShowMap] = useState(false);
  const [busy, setBusy] = useState({ status: 'idle' });

  const setPoint = async (point, source) => {
    setBusy({ status: 'loading', source });
    const address = await addressAt(point, lang);
    // Nouveau lieu : l'ancien nom (ex. hébergement de la veille) ne s'applique plus.
    onChange({ address, lat: point.lat, lon: point.lon });
    setBusy({ status: 'idle' });
  };

  const useMyPosition = async () => {
    setBusy({ status: 'loading', source: 'position' });
    try {
      await setPoint(await currentPosition(), 'position');
    } catch (err) {
      setBusy({ status: 'error', messageKey: err.messageKey ?? 'errors.unknown' });
    }
  };

  return (
    <div className="space-y-3">
      {value && (
        <div className="flex items-start gap-3 rounded-xl bg-primary-soft px-3 py-2" aria-live="polite">
          <BedDouble aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary-strong" />
          <p>
            <span className="block text-ink-muted">{t('tripForm.lodging.selected')}</span>
            {value.name && <span className="block font-semibold">{value.name}</span>}
            <span className={value.name ? '' : 'font-semibold'}>{value.address}</span>
          </p>
        </div>
      )}
      <PlaceSearch
        label={searchLabel ?? t('tripForm.lodging.search')}
        hint={t('tripForm.lodging.searchHint')}
        kind="address"
        bias={destination}
        placeholder={t('tripForm.lodging.placeholder')}
        onSelect={(r) => onChange({ ...(r.name ? { name: r.name } : {}), address: r.address, lat: r.lat, lon: r.lon })}
        error={error}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" icon={LocateFixed} onClick={useMyPosition} disabled={busy.status === 'loading'}>
          {t('tripForm.useMyPosition')}
        </Button>
        <Button variant="secondary" icon={MapIcon} onClick={() => setShowMap((v) => !v)} aria-expanded={showMap} aria-controls={`${idPrefix}-map`}>
          {t('tripForm.lodging.chooseOnMap')}
        </Button>
      </div>
      <div role="status" aria-live="polite">
        {busy.status === 'loading' && <p className="text-ink-muted">{t(busy.source === 'position' ? 'tripForm.locating' : 'placeSearch.loading')}</p>}
        {busy.status === 'error' && <p className="font-medium text-danger-on-soft">{t(busy.messageKey)}</p>}
      </div>
      <div id={`${idPrefix}-map`} hidden={!showMap}>
        {showMap && <MapPicker center={value ?? destination} value={value} onPick={(p) => setPoint(p, 'map')} />}
      </div>
      {value && (
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-name`} className="block font-medium">
            {t('tripForm.lodging.name')}
          </label>
          <input
            id={`${idPrefix}-name`}
            type="text"
            value={value.name ?? ''}
            placeholder={t('tripForm.lodging.namePlaceholder')}
            onChange={(e) => {
              const { name: _old, ...rest } = value;
              onChange(e.target.value.trim() ? { ...rest, name: e.target.value } : rest);
            }}
            className="min-h-12 w-full rounded-xl border-2 border-ink-muted bg-surface px-3 text-base"
          />
        </div>
      )}
    </div>
  );
}
