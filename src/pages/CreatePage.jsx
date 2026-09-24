import { useState } from 'react';
import { CircleCheck, CirclePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Page from '../components/layout/Page.jsx';
import TripStepper from '../components/trip-form/TripStepper.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';

export default function CreatePage() {
  const { t } = useTranslation();
  const [created, setCreated] = useState(null);

  if (created) {
    return (
      <Page>
        <Card as="section" role="status" className="space-y-3 text-center">
          <CircleCheck aria-hidden="true" className="mx-auto size-12 text-primary" />
          <h2 className="text-2xl font-bold">{t('tripForm.created.title')}</h2>
          <p>{t('tripForm.created.text', { destination: created.title })}</p>
          <p className="text-ink-muted">{t('tripForm.created.next')}</p>
          <Button icon={CirclePlus} onClick={() => setCreated(null)}>
            {t('tripForm.created.another')}
          </Button>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <TripStepper onCreated={setCreated} />
    </Page>
  );
}
