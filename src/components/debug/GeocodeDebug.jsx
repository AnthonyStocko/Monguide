import { useEffect, useState } from 'react';
import { Ban, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isSupportedCountry } from '@domain/config/countries.js';
import { useConfig } from '../../hooks/useConfig.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { geocode } from '../../services/dataApi.js';
import Card from '../ui/Card.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';

/** Villes des critères de validation (phase 2 bis), pour les tester d'un geste. */
const PRESETS = ['Villefranche-sur-Saône', 'Lisboa', 'Barcelona', 'Kraków', 'Edinburgh', 'Istanbul'];

/**
 * Test de la fonction geocode : autocomplétion (3 caractères, 300 ms sans
 * frappe) et choix de la destination utilisée par les autres tests. Les
 * destinations hors des pays pris en charge sont affichées sans pouvoir être
 * choisies.
 * @param {{ selected: object | null, onSelect: (result: object) => void }} props
 */
export default function GeocodeDebug({ selected, onSelect }) {
  const { t, i18n } = useTranslation();
  const { rules } = useConfig().config;
  const [text, setText] = useState('');
  const query = useDebouncedValue(text.trim(), rules.geocode.debounceMs);
  const [state, setState] = useState({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const lang = i18n.resolvedLanguage;

  useEffect(() => {
    if (query.length < rules.geocode.minChars) {
      setState({ status: 'idle' });
      return undefined;
    }
    let active = true;
    setState({ status: 'loading' });
    geocode({ q: query }, lang)
      .then((data) => active && setState({ status: 'ok', results: data.results }))
      .catch((error) => active && setState({ status: 'error', error }));
    return () => {
      active = false;
    };
  }, [query, lang, rules.geocode.minChars, attempt]);

  const results = state.results ?? [];
  const supported = results.filter((r) => isSupportedCountry(r.countryCode) && r.timezone);
  const unsupported = results.filter((r) => !supported.includes(r));

  return (
    <Card as="section" className="space-y-3">
      <h2 className="text-xl font-semibold">{t('debug.geocode.title')}</h2>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((city) => (
          <button
            key={city}
            type="button"
            onClick={() => setText(city)}
            className="min-h-12 rounded-full border-2 border-secondary-strong px-4 text-secondary-strong hover:bg-secondary-soft"
          >
            {city}
          </button>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="text-ink-muted">{t('debug.geocode.label')}</span>
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('debug.geocode.placeholder')}
          className="min-h-12 w-full rounded-xl border-2 border-ink-muted bg-surface px-3 text-base"
        />
      </label>
      <p className="text-ink-muted">{t('debug.geocode.hint', { count: rules.geocode.minChars })}</p>

      {state.status === 'loading' && <Skeleton className="h-12 w-full" />}
      {state.status === 'error' && <ErrorState message={t(state.error.messageKey)} onRetry={() => setAttempt((n) => n + 1)} />}
      {state.status === 'ok' && results.length === 0 && <p>{t('debug.geocode.none')}</p>}
      {state.status === 'ok' && supported.length === 0 && unsupported.length > 0 && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 font-medium text-warning-on-soft">
          <Ban aria-hidden="true" className="size-5 shrink-0" />
          {t('destination.unsupported')}
        </p>
      )}
      {results.length > 0 && (
        <ul className="space-y-1">
          {supported.map((r) => (
            <li key={`${r.name}-${r.lat}-${r.lon}`}>
              <button
                type="button"
                onClick={() => onSelect(r)}
                aria-pressed={selected?.lat === r.lat && selected?.lon === r.lon}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-subtle aria-pressed:bg-primary-soft"
              >
                <MapPin aria-hidden="true" className="size-5 shrink-0 text-primary" />
                <span className="flex-1">
                  <span className="font-medium">{r.name}</span>
                  <span className="block text-ink-muted">
                    {[r.region, r.country].filter(Boolean).join(', ')} · {r.timezone}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {unsupported.map((r) => (
            <li key={`${r.name}-${r.lat}-${r.lon}`} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-ink-muted">
              <Ban aria-hidden="true" className="size-5 shrink-0" />
              <span>
                {r.name}, {r.country} · {t('destination.unsupportedShort')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
