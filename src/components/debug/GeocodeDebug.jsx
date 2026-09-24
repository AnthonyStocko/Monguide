import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '../../hooks/useConfig.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { geocode } from '../../services/dataApi.js';
import Card from '../ui/Card.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';

/**
 * Test de la fonction geocode : autocomplétion (3 caractères, 300 ms sans
 * frappe) et choix de la destination utilisée par les autres tests.
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

  return (
    <Card as="section" className="space-y-3">
      <h2 className="text-xl font-semibold">{t('debug.geocode.title')}</h2>
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
      {state.status === 'ok' && state.results.length === 0 && <p>{t('debug.geocode.none')}</p>}
      {state.status === 'ok' && state.results.length > 0 && (
        <ul className="space-y-1">
          {state.results.map((r) => (
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
        </ul>
      )}
    </Card>
  );
}
