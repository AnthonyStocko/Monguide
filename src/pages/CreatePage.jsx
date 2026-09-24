import { useState } from 'react';
import { CalendarDays, CircleCheck, CirclePlus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { setCurrentTripId } from '../services/tripsStore.js';
import { useTranslation } from 'react-i18next';
import Page from '../components/layout/Page.jsx';
import NotificationsExplainer from '../components/notifications/NotificationsExplainer.jsx';
import TripPreview from '../components/trip/TripPreview.jsx';
import TripStepper from '../components/trip-form/TripStepper.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';

export default function CreatePage() {
  const { t } = useTranslation();
  const [created, setCreated] = useState(null);
  const navigate = useNavigate();
  const openPlanning = async () => {
    await setCurrentTripId(created.trip.id);
    navigate(`/planning/${created.trip.id}`);
  };

  if (created) {
    return (
      <Page>
        <Card as="section" role="status" className="space-y-3 text-center">
          <CircleCheck aria-hidden="true" className="mx-auto size-12 text-primary" />
          <h2 className="text-2xl font-bold">{t('tripForm.created.title')}</h2>
          <p>{t('tripForm.created.text', { destination: created.trip.title })}</p>
          <Button icon={CalendarDays} onClick={openPlanning} className="w-full">
            {t('tripForm.created.viewPlanning')}
          </Button>
        </Card>
        <TripPreview trip={created.trip} warnings={created.warnings} />
        {/* Premier séjour enregistré : explication, puis demande d'autorisation des rappels. */}
        <NotificationsExplainer />
        <Button icon={CirclePlus} onClick={() => setCreated(null)} className="w-full">
          {t('tripForm.created.another')}
        </Button>
      </Page>
    );
  }

  return (
    <Page>
      <TripStepper onCreated={setCreated} />
    </Page>
  );
}
