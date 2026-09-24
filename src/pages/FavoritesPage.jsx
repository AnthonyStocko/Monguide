import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Page from '../components/layout/Page.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

export default function FavoritesPage() {
  const { t } = useTranslation();
  return (
    <Page>
      <Card>
        <EmptyState icon={Heart} title={t('favorites.emptyTitle')} description={t('favorites.emptyText')} />
      </Card>
    </Page>
  );
}
