import { ArrowLeft, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import Button from '../ui/Button.jsx';
import OfflineBanner from '../ui/OfflineBanner.jsx';

const TITLES = {
  '/': 'app.name',
  '/create': 'nav.create',
  '/planning': 'nav.planning',
  '/map': 'nav.map',
  '/favorites': 'nav.favorites',
  '/settings': 'nav.settings',
  '/debug': 'debug.title'
};

// Pages secondaires : bouton Retour au lieu du bouton Réglages.
const SUB_PAGES = ['/settings', '/debug'];

export default function TopBar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isSubPage = SUB_PAGES.includes(location.pathname);

  // Entrée directe sur une page secondaire : pas d'historique, on revient à l'accueil.
  const goBack = () => (location.key === 'default' ? navigate('/') : navigate(-1));

  return (
    <header className="sticky top-0 z-[1100] border-b border-line bg-surface pt-safe">
      <div className="flex min-h-14 items-center gap-1 px-2">
        {isSubPage && <Button variant="ghost" icon={ArrowLeft} aria-label={t('common.back')} onClick={goBack} />}
        <h1 className="flex-1 px-2 text-xl font-bold">{t(TITLES[location.pathname] ?? 'app.name')}</h1>
        {!isSubPage && (
          <Button variant="ghost" icon={Settings} aria-label={t('nav.settings')} onClick={() => navigate('/settings')} />
        )}
      </div>
      <OfflineBanner />
    </header>
  );
}
