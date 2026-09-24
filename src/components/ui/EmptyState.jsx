/**
 * État vide : icône, titre, explication et action facultative.
 * @param {{ icon?: import('react').ComponentType<any>, title: string, description?: string, action?: import('react').ReactNode }} props
 */
export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      {Icon && (
        <div className="flex size-16 items-center justify-center rounded-full bg-primary-soft">
          <Icon aria-hidden="true" className="size-8 text-primary" />
        </div>
      )}
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="max-w-md text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
