import { avatarColor } from '../../config/avatarColors.js';

/**
 * Pastille d'un participant : initiale sur sa couleur. Décorative : le prénom
 * est toujours écrit à côté (l'information ne repose jamais sur la couleur).
 * @param {{ name: string | null, color?: string | null, userId?: string, size?: 'sm' | 'md' }} props
 */
export default function Avatar({ name, color, userId, size = 'md' }) {
  const dims = size === 'sm' ? 'size-8 text-base' : 'size-10 text-base';
  return (
    <span aria-hidden="true" className={`flex ${dims} shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-surface`} style={{ backgroundColor: avatarColor(color, userId ?? '') }}>
      {(name ?? '?').trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
