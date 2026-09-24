import FieldError from './FieldError.jsx';

/**
 * Choix unique parmi quelques options (boutons radio natifs : navigation au
 * clavier par flèches, lecture par les lecteurs d'écran), présentés en
 * grandes cartes ou en sélecteur segmenté (layout "row").
 * @param {{
 *   name: string,
 *   legend: string,
 *   hint?: string,
 *   options: { value: string | number, label: string, description?: string, icon?: import('react').ComponentType<any> }[],
 *   value: string | number | null,
 *   onChange: (value: any) => void,
 *   error?: string,
 *   layout?: 'stack' | 'row'
 * }} props
 */
export default function ChoiceGroup({ name, legend, hint, options, value, onChange, error, layout = 'stack' }) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset className="space-y-2" aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}>
      <legend className="text-lg font-semibold">{legend}</legend>
      {hint && (
        <p id={hintId} className="text-ink-muted">
          {hint}
        </p>
      )}
      <div className={layout === 'row' ? 'grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-2' : 'space-y-2'}>
        {options.map(({ value: v, label, description, icon: Icon }) => (
          <label
            key={v}
            className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 has-[:checked]:border-primary-strong has-[:checked]:bg-primary-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
              error ? 'border-danger-on-soft' : 'border-line'
            } ${layout === 'row' ? 'justify-center text-center' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              className={layout === 'row' ? 'sr-only' : 'size-6 shrink-0 accent-primary-strong'}
            />
            {Icon && <Icon aria-hidden="true" className="size-6 shrink-0 text-primary-strong" />}
            <span className={layout === 'row' ? 'font-medium' : 'flex-1'}>
              <span className="font-medium">{label}</span>
              {description && <span className="block text-ink-muted">{description}</span>}
            </span>
          </label>
        ))}
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  );
}
