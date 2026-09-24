import { useEffect, useId, useState } from 'react';
import { Ban, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isSupportedCountry } from '@domain/config/countries.js';
import { useConfig } from '../../hooks/useConfig.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { geocode } from '../../services/dataApi.js';
import FieldError from '../ui/FieldError.jsx';

/**
 * Champ d'autocomplétion accessible (motif ARIA "combobox" + "listbox") :
 * flèches haut/bas, Entrée pour choisir, Échap pour fermer ; nombre de
 * résultats annoncé. Interroge la fonction geocode du serveur (3 caractères,
 * 300 ms sans frappe). Pour une commune, les pays non pris en charge sont
 * listés mais ne peuvent pas être choisis.
 * @param {{
 *   label: string,
 *   kind: 'city' | 'address',
 *   bias?: { lat: number, lon: number } | null,
 *   placeholder?: string,
 *   onSelect: (result: object) => void,
 *   error?: string,
 *   hint?: string
 * }} props
 */
export default function PlaceSearch({ label, kind, bias, placeholder, onSelect, error, hint }) {
  const { t, i18n } = useTranslation();
  const { rules } = useConfig().config;
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const [text, setText] = useState('');
  const query = useDebouncedValue(text.trim(), rules.geocode.debounceMs);
  const [state, setState] = useState({ status: 'idle', results: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const lang = i18n.resolvedLanguage;

  useEffect(() => {
    if (query.length < rules.geocode.minChars) {
      setState({ status: 'idle', results: [] });
      return undefined;
    }
    let alive = true;
    setState((s) => ({ ...s, status: 'loading' }));
    const params = { q: query, kind, ...(bias ? { biasLat: bias.lat, biasLon: bias.lon } : {}) };
    geocode(params, lang)
      .then((data) => {
        if (!alive) return;
        setState({ status: 'ok', results: data.results });
        setOpen(true);
        setActive(-1);
      })
      .catch((err) => alive && setState({ status: 'error', results: [], error: err }));
    return () => {
      alive = false;
    };
  }, [query, kind, bias?.lat, bias?.lon, lang, rules.geocode.minChars]);

  const options = state.results.map((r) => ({ r, disabled: kind === 'city' && !(isSupportedCountry(r.countryCode) && r.timezone) }));
  const onlyUnsupported = kind === 'city' && options.length > 0 && options.every((o) => o.disabled);

  const choose = (option) => {
    if (!option || option.disabled) return;
    onSelect(option.r);
    setText('');
    setOpen(false);
    setState({ status: 'idle', results: [] });
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === 'Enter' && open && options.length) {
      // Liste ouverte : Entrée choisit l'option active, sans jamais valider le formulaire.
      e.preventDefault();
      if (active >= 0) choose(options[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const optionLabel = ({ r, disabled }) =>
    kind === 'city'
      ? { main: r.name, sub: [[r.region, r.country].filter(Boolean).join(', '), disabled ? t('destination.unsupportedShort') : null].filter(Boolean).join(' · ') }
      : { main: r.name ?? r.address, sub: r.name ? r.address : null };

  let status = '';
  if (state.status === 'loading') status = t('placeSearch.loading');
  else if (state.status === 'ok') status = state.results.length ? t('placeSearch.count', { count: state.results.length }) : t('placeSearch.none');

  const describedBy = [hint && `${uid}-hint`, error && `${uid}-error`, `${uid}-status`].filter(Boolean).join(' ');

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block font-medium">
        {label}
      </label>
      {hint && (
        <p id={`${uid}-hint`} className="text-ink-muted">
          {hint}
        </p>
      )}
      <input
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${uid}-opt-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => options.length && setOpen(true)}
        className={`min-h-12 w-full rounded-xl border-2 bg-surface px-3 text-base ${error ? 'border-danger-on-soft' : 'border-ink-muted'}`}
      />
      <p id={`${uid}-status`} role="status" aria-live="polite" className="text-ink-muted">
        {status}
      </p>
      {state.status === 'error' && <p className="font-medium text-danger-on-soft">{t(state.error.messageKey)}</p>}
      {onlyUnsupported && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 font-medium text-warning-on-soft">
          <Ban aria-hidden="true" className="size-5 shrink-0" />
          {t('destination.unsupported')}
        </p>
      )}
      <ul id={listId} role="listbox" aria-label={label} hidden={!open || options.length === 0} className="space-y-1 rounded-xl border border-line bg-surface p-1">
        {options.map((option, i) => {
          const { main, sub } = optionLabel(option);
          const Icon = option.disabled ? Ban : MapPin;
          return (
            <li
              key={`${main}-${option.r.lat}-${option.r.lon}`}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={option.disabled || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
              className={`flex min-h-12 items-center gap-3 rounded-lg px-3 py-1 ${option.disabled ? 'cursor-not-allowed text-ink-muted' : 'cursor-pointer hover:bg-subtle'} ${
                i === active ? 'bg-primary-soft outline outline-2 outline-focus' : ''
              }`}
            >
              <Icon aria-hidden="true" className={`size-5 shrink-0 ${option.disabled ? '' : 'text-primary'}`} />
              <span>
                <span className="font-medium">{main}</span>
                {sub && <span className="block text-ink-muted">{sub}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <FieldError id={`${uid}-error`}>{error}</FieldError>
    </div>
  );
}
