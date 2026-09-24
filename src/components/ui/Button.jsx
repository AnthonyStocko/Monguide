const VARIANTS = {
  primary: 'bg-primary-strong text-white hover:bg-primary-hover',
  secondary: 'border-2 border-secondary-strong bg-surface text-secondary-strong hover:bg-secondary-soft',
  ghost: 'text-ink hover:bg-subtle'
};

/**
 * Bouton de 48 x 48 px minimum. Sans texte (icône seule), fournir aria-label.
 * @param {{ variant?: 'primary' | 'secondary' | 'ghost', icon?: import('react').ComponentType<any> }} props
 */
export default function Button({
  variant = 'primary',
  icon: Icon,
  type = 'button',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-xl text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${children ? 'px-5' : 'p-3'} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {Icon && <Icon aria-hidden="true" className="size-6 shrink-0" />}
      {children}
    </button>
  );
}
