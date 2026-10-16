import Avatar from './Avatar.jsx';

/**
 * Modification d'un autre participant, en bas de l'écran (« Paul a déplacé
 * « Dîner » à 20:00 »), même place et même style que les autres messages
 * (ui/Toast.jsx), au-dessus de la barre « Annuler » si elle est affichée.
 * Région aria-live toujours présente : chaque nouveau message est annoncé
 * par les lecteurs d'écran, sans déplacer le focus. Durée gérée par l'appelant.
 * @param {{ toast: { name: string, color: string | null, userId: string | null, text: string } | null, raised?: boolean }} props
 */
export default function LiveToast({ toast, raised = false }) {
  const bottom = raised ? 'bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+5rem)] sm:bottom-24' : 'bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+0.75rem)] sm:bottom-6';
  return (
    <div role="status" aria-live="polite" className={`pointer-events-none fixed inset-x-app-4 z-[1100] ${bottom}`}>
      {toast && (
        <p className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-xl motion-ok:animate-rise-in">
          <Avatar name={toast.name} color={toast.color} userId={toast.userId ?? ''} size="sm" />
          <span className="flex-1">{toast.text}</span>
        </p>
      )}
    </div>
  );
}
