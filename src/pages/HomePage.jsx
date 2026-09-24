import { CirclePlus, Luggage } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import Page from '../components/layout/Page.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { useFormat } from '../i18n/useFormat.js';

export default function HomePage() {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();

  return (
    <Page>
      <section>
        <h2 className="text-2xl font-bold">{t('home.greeting')}</h2>
        <p className="text-ink-muted">{t('home.today', { date: format.date(new Date(), { dateStyle: 'full' }) })}</p>
      </section>
      <Card>
        <EmptyState
          icon={Luggage}
          title={t('home.emptyTitle')}
          description={t('home.emptyText')}
          action={
            <Button icon={CirclePlus} onClick={() => navigate('/create')}>
              {t('home.createCta')}
            </Button>
          }
        />
      </Card>
    </Page>
  );
}
