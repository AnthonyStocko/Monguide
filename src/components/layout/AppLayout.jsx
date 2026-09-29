import { useRef } from 'react';
import { m } from 'motion/react';
import { Outlet, useLocation } from 'react-router';
import { EASE, useMotionAllowed } from '../../ui/motion.js';
import BottomNav from './BottomNav.jsx';
import TopBar from './TopBar.jsx';

/** Ordre des onglets : sens du glissement (vers la droite si l'onglet suivant est plus loin). */
const TAB_ORDER = ['', 'create', 'planning', 'map', 'favorites'];

export default function AppLayout() {
  const location = useLocation();
  const allowed = useMotionAllowed();
  const section = location.pathname.split('/')[1] ?? '';
  const index = TAB_ORDER.indexOf(section);
  // Onglet affiché, sens de la dernière transition, et premier affichage de l'application (aucune transition).
  const shown = useRef({ section, index, direction: 1, first: true });
  if (shown.current.section !== section) {
    const direction = index >= 0 && shown.current.index >= 0 && index < shown.current.index ? -1 : 1;
    shown.current = { section, index, direction, first: false };
  }
  const { direction } = shown.current;
  const animate = allowed && !shown.current.first;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="flex flex-1 flex-col pb-nav">
        {/* Changement d'onglet : fondu et léger glissement (200 ms). */}
        <m.div
          key={section}
          className="flex flex-1 flex-col"
          initial={animate ? { opacity: 0, x: 16 * direction } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: EASE.standard }}
        >
          <Outlet />
        </m.div>
      </main>
      <BottomNav />
    </div>
  );
}
