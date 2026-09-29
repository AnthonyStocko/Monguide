/**
 * Bloc de chargement avec reflet qui passe (seule animation en boucle
 * autorisée : c'est un indicateur de chargement ; bloc fixe si les
 * animations sont réduites). Taille réglée par className (ex. "h-6 w-40").
 */
export default function Skeleton({ className = '' }) {
  return (
    <div aria-hidden="true" className={`relative overflow-hidden rounded-lg bg-line ${className}`}>
      <div className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/60 to-transparent motion-ok:animate-shimmer" />
    </div>
  );
}
