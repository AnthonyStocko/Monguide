import { useRef, useState } from 'react';
import { CalendarDays, CirclePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { replaceStepPlace } from '@domain/replaceStep.js';
import { recomputeTravel } from '@domain/dayEdits.js';
import Page from '../components/layout/Page.jsx';
import DayView from '../components/planning/DayView.jsx';
import ReplaceStepDialog from '../components/planning/ReplaceStepDialog.jsx';
import TimeEditorDialog from '../components/planning/TimeEditorDialog.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useConfig } from '../hooks/useConfig.js';
import { useCurrentTrip } from '../hooks/useCurrentTrip.js';
import { useFormat } from '../i18n/useFormat.js';

export default function PlanningPage() {
  const { t } = useTranslation();
  const { tripId } = useParams();
  const navigate = useNavigate();
  const format = useFormat();
  const { rules } = useConfig().config;
  const { status, trip, readOnly, save } = useCurrentTrip(tripId);
  const [dayIndex, setDayIndex] = useState(0);
  const [dialog, setDialog] = useState(null);
  const tabRefs = useRef([]);

  if (status === 'loading') {
    return (
      <Page>
        <Skeleton className="h-12 w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </Page>
    );
  }
  if (status === 'empty') {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={CalendarDays}
            title={t('planning.emptyTitle')}
            description={t('planning.emptyText')}
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

  const day = Math.min(dayIndex, trip.days.length - 1);
  const tabLabel = (d) => format.date(`${d.date}T12:00:00Z`, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const onTabKey = (e, i) => {
    const n = trip.days.length;
    const target = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (target === null) return;
    e.preventDefault();
    setDayIndex(target);
    tabRefs.current[target]?.focus();
  };

  const saveDay = async (newDay) => {
    const days = trip.days.map((d, i) => (i === day ? recomputeTravel(newDay, trip, rules) : d));
    await save({ ...trip, days });
    setDialog(null);
  };

  return (
    <Page>
      <header className="space-y-1">
        <h2 className="text-2xl font-bold">{trip.title}</h2>
        <p className="text-ink-muted">
          {format.date(`${trip.startDate}T12:00:00Z`, { dateStyle: 'long', timeZone: 'UTC' })} – {format.date(`${trip.endDate}T12:00:00Z`, { dateStyle: 'long', timeZone: 'UTC' })}
        </p>
      </header>

      {readOnly && (
        <p role="status" className="rounded-xl bg-warning-soft px-3 py-2 font-medium text-warning-on-soft">
          {t('planning.readOnly')}
        </p>
      )}

      <div role="tablist" aria-label={t('planning.days')} className="flex gap-2 overflow-x-auto pb-1">
        {trip.days.map((d, i) => (
          <button
            key={d.date}
            ref={(el) => (tabRefs.current[i] = el)}
            type="button"
            role="tab"
            id={`tab-${i}`}
            aria-selected={i === day}
            aria-controls={`panel-${i}`}
            tabIndex={i === day ? 0 : -1}
            onClick={() => setDayIndex(i)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={`min-h-12 shrink-0 rounded-xl px-4 font-semibold first-letter:uppercase ${i === day ? 'bg-primary-strong text-white' : 'bg-subtle text-ink hover:bg-line'}`}
          >
            {tabLabel(d)}
          </button>
        ))}
      </div>

      <section role="tabpanel" id={`panel-${day}`} aria-labelledby={`tab-${day}`} tabIndex={0}>
        <DayView
          trip={trip}
          dayIndex={day}
          rules={rules}
          onEditTime={(i) => !readOnly && setDialog({ kind: 'time', stepIndex: i })}
          onReplace={(i) => !readOnly && setDialog({ kind: 'replace', stepIndex: i })}
          onLodging={() => !readOnly && setDialog({ kind: 'lodging' })}
        />
      </section>

      {dialog?.kind === 'time' && (
        <TimeEditorDialog trip={trip} dayIndex={day} stepIndex={dialog.stepIndex} rules={rules} onSave={saveDay} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'replace' && (
        <ReplaceStepDialog
          trip={trip}
          dayIndex={day}
          stepIndex={dialog.stepIndex}
          onPick={async (place) => {
            await save(replaceStepPlace(trip, day, dialog.stepIndex, place, rules));
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'lodging' && (
        <Dialog title={t('planning.lodgingTitle')} onClose={() => setDialog(null)}>
          <p>{t('planning.lodgingLater')}</p>
        </Dialog>
      )}
    </Page>
  );
}
