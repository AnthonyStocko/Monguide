/** Conteneur standard du contenu d'un onglet. */
export default function Page({ className = '', children }) {
  return <div className={`mx-auto w-full max-w-2xl space-y-4 p-4 ${className}`}>{children}</div>;
}
