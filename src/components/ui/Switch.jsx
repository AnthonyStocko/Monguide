/**
 * Interrupteur accessible (role="switch"), zone tactile de 48 px.
 * @param {{ id: string, label: string, checked: boolean, onChange: (checked: boolean) => void }} props
 */
export default function Switch({ id, label, checked, onChange }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <label htmlFor={id} className="flex-1 cursor-pointer">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-12 w-20 shrink-0 items-center rounded-full border-2 transition-colors ${
          checked ? 'border-primary-strong bg-primary-strong' : 'border-ink-muted bg-subtle'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block size-8 rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-9' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}
