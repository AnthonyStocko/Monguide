import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Page from '../components/layout/Page.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

export default function CreatePage() {
  const { t } = useTranslation();
  return (
    <Page>
      <Card>
        <EmptyState icon={Compass} title={t('create.emptyTitle')} description={t('create.emptyText')} />
      </Card>
    </Page>
  );
}
