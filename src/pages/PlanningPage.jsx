import { CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Page from '../components/layout/Page.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

export default function PlanningPage() {
  const { t } = useTranslation();
  return (
    <Page>
      <Card>
        <EmptyState icon={CalendarDays} title={t('planning.emptyTitle')} description={t('planning.emptyText')} />
      </Card>
    </Page>
  );
}
