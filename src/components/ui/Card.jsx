/** Conteneur blanc bordé. `as` permet d'utiliser section, article, li… */
export default function Card({ as: Tag = 'div', className = '', children, ...props }) {
  return (
    <Tag className={`rounded-2xl border border-line bg-surface p-4 shadow-sm ${className}`} {...props}>
      {children}
    </Tag>
  );
}
