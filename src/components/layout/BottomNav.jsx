import { CalendarDays, CirclePlus, Heart, House, Map as MapIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

const TABS = [
  { to: '/', label: 'nav.home', icon: House, end: true },
  { to: '/create', label: 'nav.create', icon: CirclePlus },
  { to: '/planning', label: 'nav.planning', icon: CalendarDays },
  { to: '/map', label: 'nav.map', icon: MapIcon },
  { to: '/favorites', label: 'nav.favorites', icon: Heart }
];

/** Barre d'onglets fixe en bas de l'écran, au-dessus de la zone sûre. */
export default function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('nav.label')} className="fixed inset-x-0 bottom-0 z-[1100] border-t border-line bg-surface pb-safe">
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex h-[var(--nav-height)] flex-col items-center justify-center gap-1 px-1 text-base leading-tight ${
                  isActive ? 'bg-primary-soft font-semibold text-primary-strong' : 'text-ink-muted hover:bg-subtle'
                }`
              }
            >
              <Icon aria-hidden="true" className="size-6" />
              <span>{t(label)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
