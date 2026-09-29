import { Check } from 'lucide-react';

/**
 * Puce interactive (filtre à cocher) : bouton bascule de 48 px, état lu par
 * les lecteurs d'écran (aria-pressed), signalé aussi par une coche et non par
 * la seule couleur.
 * @param {{ selected: boolean, onChange: (selected: boolean) => void, icon?: import('react').ComponentType<any>, disabled?: boolean }} props
 */
export default function Chip({ selected, onChange, icon: Icon, disabled, className = '', children }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onChange(!selected)}
      className={`inline-flex min-h-12 items-center gap-2 rounded-full border-2 px-4 font-medium disabled:cursor-not-allowed disabled:opacity-60 motion-ok:transition-transform motion-ok:duration-150 motion-ok:enabled:active:scale-[0.97] ${
        selected ? 'border-primary-strong bg-primary-soft text-primary-on-soft' : 'border-line-strong bg-surface text-ink hover:bg-subtle'
      } ${className}`}
    >
      {selected ? <Check aria-hidden="true" className="size-5 shrink-0" /> : Icon && <Icon aria-hidden="true" className="size-5 shrink-0" />}
      {children}
    </button>
  );
}
