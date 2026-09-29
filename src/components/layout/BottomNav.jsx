import { CalendarDays, CirclePlus, Heart, House, Map as MapIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router';

const TABS = [
  { to: '/', label: 'nav.home', icon: House, end: true },
  { to: '/create', label: 'nav.create', icon: CirclePlus },
  { to: '/planning', label: 'nav.planning', icon: CalendarDays },
  { to: '/map', label: 'nav.map', icon: MapIcon },
  { to: '/favorites', label: 'nav.favorites', icon: Heart }
];

/**
 * Barre d'onglets fixe en bas de l'écran, au-dessus de la zone sûre. Onglet
 * actif : pastille colorée derrière l'icône, libellé en vert et en gras
 * (jamais la couleur seule), aria-current posé par NavLink.
 */
export default function BottomNav() {
  const { t } = useTranslation();
  const listRef = useRef(null);
  // Hauteur réelle de la barre (elle grandit avec le texte) : espace réservé sous le contenu (pb-nav).
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty('--nav-height', `${el.offsetHeight}px`));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <nav aria-label={t('nav.label')} className="fixed inset-x-0 bottom-0 z-[1100] border-t border-line bg-surface pb-safe">
      <ul ref={listRef} className="mx-auto flex max-w-2xl">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="min-w-0 flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `group flex min-h-[4.5rem] flex-col items-center justify-center gap-1 px-0.5 py-1 text-base leading-tight ${
                  isActive ? 'font-semibold text-primary-strong' : 'text-ink-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative flex h-8 w-full max-w-16 items-center justify-center">
                    {isActive ? (
                      <span aria-hidden="true" className="absolute inset-0 rounded-full bg-primary-soft motion-ok:animate-pop-in" />
                    ) : (
                      <span aria-hidden="true" className="absolute inset-0 rounded-full group-hover:bg-subtle" />
                    )}
                    <Icon aria-hidden="true" className="relative size-6" />
                  </span>
                  {/* Texte agrandi (130 % et plus) : le libellé passe à la ligne (césure), jamais coupé. */}
                  <span className="max-w-full text-center break-words hyphens-auto">{t(label)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
