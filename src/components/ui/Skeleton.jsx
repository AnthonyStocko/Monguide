/** Bloc de chargement ; sa taille se règle avec className (ex. "h-6 w-40"). */
export default function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`rounded-lg bg-line motion-safe:animate-pulse ${className}`} />;
}
