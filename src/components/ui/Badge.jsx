const TONES = {
  neutral: 'bg-subtle text-ink-muted',
  primary: 'bg-primary-soft text-primary-on-soft',
  secondary: 'bg-secondary-soft text-secondary-on-soft',
  accent: 'bg-accent-soft text-accent-on-soft',
  warning: 'bg-warning-soft text-warning-on-soft',
  danger: 'bg-danger-soft text-danger-on-soft'
};

/**
 * Étiquette courte, non interactive (catégorie, statut, météo…). Tons :
 * neutral, primary, secondary, accent (certification), warning, danger.
 * @param {{ tone?: keyof typeof TONES, icon?: import('react').ComponentType<any> }} props
 */
export default function Badge({ tone = 'neutral', icon: Icon, className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-base font-medium ${TONES[tone]} ${className}`}
    >
      {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
      {children}
    </span>
  );
}
