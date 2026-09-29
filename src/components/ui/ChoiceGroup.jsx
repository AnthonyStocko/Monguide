import { Check } from 'lucide-react';
import FieldError from './FieldError.jsx';

/**
 * Choix unique parmi quelques options (boutons radio natifs : navigation au
 * clavier par flèches, lecture par les lecteurs d'écran), présentés en
 * grandes cartes sélectionnables (icône, libellé, description, coche) ou en
 * sélecteur segmenté (layout "row").
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
        {options.map(({ value: v, label, description, icon: Icon }) =>
          layout === 'row' ? (
            <label
              key={v}
              className={`flex min-h-12 cursor-pointer items-center justify-center gap-3 rounded-xl border-2 px-3 py-2 text-center has-[:checked]:border-primary-strong has-[:checked]:bg-primary-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                error ? 'border-danger-on-soft' : 'border-line-strong'
              }`}
            >
              <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
              {Icon && <Icon aria-hidden="true" className="size-6 shrink-0 text-primary-strong" />}
              <span className="font-medium">{label}</span>
            </label>
          ) : (
            // Grande carte sélectionnable : bouton radio natif (clavier, lecteurs d'écran), état signalé
            // par la bordure, le fond ET une coche (jamais la couleur seule).
            <label
              key={v}
              className={`flex min-h-16 cursor-pointer items-center gap-4 rounded-2xl border-2 bg-surface p-4 shadow-sm has-[:checked]:border-primary-strong has-[:checked]:bg-primary-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus motion-ok:transition-transform motion-ok:duration-150 motion-ok:active:scale-[0.98] ${
                error ? 'border-danger-on-soft' : 'border-line'
              }`}
            >
              <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="peer sr-only" />
              {Icon && (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft">
                  <Icon aria-hidden="true" className="size-7 text-primary-strong" />
                </span>
              )}
              <span className="flex-1">
                <span className="block text-lg font-semibold">{label}</span>
                {description && <span className="block text-ink-muted">{description}</span>}
              </span>
              <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-line-strong text-white peer-checked:border-primary-strong peer-checked:bg-primary-strong">
                <Check className="size-4" strokeWidth={3} />
              </span>
            </label>
          )
        )}
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  );
}
