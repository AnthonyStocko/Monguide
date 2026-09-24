import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, CirclePlus, CloudOff, FileDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { applyChanges } from '@domain/applyChanges.js';
import { checkDayInvariants } from '@domain/checkDayInvariants.js';
import { clearResolvedConflicts } from '@domain/conflicts.js';
import { recomputeTravel } from '@domain/dayEdits.js';
import { reevaluatePlanning, setStepStatus } from '@domain/reevaluatePlanning.js';
import { insertWithoutReplan, removePersonalStep, replanDay } from '@domain/replanDay.js';
import { replanLodgings } from '@domain/replanLodgings.js';
import { replaceStepPlace } from '@domain/replaceStep.js';
import { fromMinutes, nowInZone, toMinutes } from '@domain/time.js';
import { dayWeather } from '@domain/weatherArbitration.js';
import Page from '../components/layout/Page.jsx';
import DayView from '../components/planning/DayView.jsx';
import ExportDialog from '../components/planning/ExportDialog.jsx';
import LodgingEditor from '../components/planning/LodgingEditor.jsx';
import PersonalStepForm from '../components/planning/PersonalStepForm.jsx';
import ReplanPanel from '../components/planning/ReplanPanel.jsx';
import ReplaceStepDialog from '../components/planning/ReplaceStepDialog.jsx';
import TimeEditorDialog from '../components/planning/TimeEditorDialog.jsx';
import UndoBar from '../components/planning/UndoBar.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useConfig } from '../hooks/useConfig.js';
import { useCurrentTrip } from '../hooks/useCurrentTrip.js';
import { useFormat } from '../i18n/useFormat.js';
import { getWeather } from '../services/dataApi.js';

/** En développement : invariants vérifiés après chaque recalcul, sur les journées recalculées (console). */
function devCheck(before, after, mode, rules) {
  if (!import.meta.env.DEV) return;
  after.days.forEach((d, i) => {
    if (d === before.days[i]) return;
    const violations = checkDayInvariants(d, { before: before.days[i], trip: after, mode }, rules);
    if (violations.length) console.warn('checkDayInvariants', d.date, violations);
  });
}

export default function PlanningPage() {
  const { t } = useTranslation();
  const { tripId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const format = useFormat();
  const { rules } = useConfig().config;
  const { status, trip, readOnly, save } = useCurrentTrip(tripId);
  const [dayIndex, setDayIndex] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [undo, setUndo] = useState(null);
  const [notice, setNotice] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const tabRefs = useRef([]);
  const stepRefs = useRef({});

  // Appui sur une notification : ?day=YYYY-MM-DD&step=<id> ouvre le bon jour et le bon créneau.
  const wantedDay = searchParams.get('day');
  const wantedStep = searchParams.get('step');
  useEffect(() => {
    if (status !== 'ready' || !wantedDay) return;
    const index = trip.days.findIndex((d) => d.date === wantedDay);
    if (index >= 0) setDayIndex(index);
    setHighlightId(wantedStep);
    setSearchParams({}, { replace: true });
  }, [status, trip, wantedDay, wantedStep, setSearchParams]);
  useEffect(() => {
    if (!highlightId) return;
    const el = stepRefs.current[highlightId];
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  }, [highlightId, dayIndex]);

  const expireUndo = useCallback(() => setUndo(null), []);

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
  const current = trip.days[day];
  const here = nowInZone(trip.timezone);
  const isToday = current.date === here.date;
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
    const days = trip.days.map((d, i) => (i === day ? clearResolvedConflicts(recomputeTravel(newDay, trip, rules), trip.mode, rules) : d));
    await save({ ...trip, days });
    setDialog(null);
  };

  /**
   * Applique un réajustement ; "Annuler" (retour à previous) reste proposé
   * rules.ui.undoDelaySec secondes.
   */
  const applyProposal = async (base, result, choices, message, previous = base, { check = true } = {}) => {
    const next = applyChanges(base, result, choices, rules);
    // "Ajouter sans réorganiser" garde volontairement les chevauchements (badge "Conflit d'horaire").
    if (check) devCheck(base, next, trip.mode, rules);
    await save(next);
    setProposal(null);
    setDialog(null);
    setUndo({ previous, message });
  };

  // --- Suivi en temps réel : valider ou passer une étape du jour en cours ---
  const track = async (stepIndex, stepStatus) => {
    const step = current.steps[stepIndex];
    const now = nowInZone(trip.timezone);
    let next = await save(setStepStatus(trip, day, step.id, stepStatus, now.time));
    // Météo : seulement en ligne, via la fonction weather (met aussi à jour Day.weather).
    let online = navigator.onLine;
    if (online) {
      try {
        const res = await getWeather({ lat: trip.destination.lat, lon: trip.destination.lon, timezone: trip.timezone, startDate: current.date, endDate: current.date });
        const w = res.data.days?.find((d) => d.date === current.date);
        if (res.fromCache || !w) online = false;
        else {
          const weather = dayWeather(w);
          next = await save({ ...next, days: next.days.map((d, i) => (i === day ? { ...d, weatherAvailable: Boolean(w.available), ...(weather ? { weather } : {}) } : d)) });
        }
      } catch {
        online = false;
      }
    }
    const result = reevaluatePlanning(next, day, step.id, { now: now.time, online, today: now.date }, rules);
    const doneText = t(stepStatus === 'done' ? 'tracking.doneNotice' : 'tracking.skippedNotice');
    if (result.changes.length) setProposal({ kind: 'tracking', base: next, result });
    else setNotice(result.weatherChecked ? doneText : `${doneText} · ${t('replan.weatherOffline')}`);
  };

  // --- Étapes personnelles ---
  const openPersonal = (afterIndex) => {
    const prev = current.steps[afterIndex];
    const nextStep = current.steps[afterIndex + 1];
    const start = prev ? prev.end : (nextStep?.start ?? rules.dayTemplate.culture);
    const endMin = Math.min(toMinutes(start) + rules.personalStep.defaultDurationMin, 23 * 60 + 55);
    setDialog({ kind: 'personal', defaultStart: start, defaultEnd: fromMinutes(endMin) });
  };
  const submitPersonal = (step) => {
    const result = replanDay(trip, day, step, rules, { today: here.date });
    if (result.error) {
      const other = current.steps.find((s) => s.id === result.error.stepId);
      setDialog((d) => ({ ...d, error: { code: result.error.code, name: other ? (other.title ?? other.place?.name) : '' } }));
      return;
    }
    if (!result.changes.length && !result.warnings.length) {
      applyProposal(trip, result, {}, t('personal.added'));
      return;
    }
    setDialog((d) => ({ ...d, draft: step, error: null }));
    setProposal({ kind: 'personal', base: trip, result, step });
  };
  const deletePersonal = (stepId) => applyProposal(trip, removePersonalStep(trip, day, stepId, rules), {}, t('personal.deleted'));

  // --- Hébergements ---
  const saveLodgings = (lodgings) => {
    const { trip: next, proposal: result } = replanLodgings(trip, lodgings, rules);
    if (!result.changes.length) {
      applyProposal(next, result, {}, t('lodgings.saved'), trip);
      return;
    }
    setProposal({ kind: 'lodging', base: next, result, lodgings });
  };

  const panel = proposal && {
    tracking: {
      dismissLabel: t('replan.keep'),
      onDismiss: () => setProposal(null),
      onApply: (choices) => applyProposal(proposal.base, proposal.result, choices, t('replan.applied'))
    },
    personal: {
      intro: t('personal.replanIntro', { name: proposal.step?.title }),
      dismissLabel: t('personal.addWithoutReplan'),
      onDismiss: () => {
        const result = insertWithoutReplan(trip, day, proposal.step, rules);
        if (!result.error) applyProposal(trip, result, {}, t('personal.added'), trip, { check: false });
      },
      onApply: (choices) => applyProposal(proposal.base, proposal.result, choices, t('personal.added'))
    },
    lodging: {
      dismissLabel: t('replan.keep'),
      // Garder le planning : nouveaux hébergements, trajets recalculés, sans remplacement de lieu.
      onDismiss: () => {
        const keep = replanLodgings(trip, proposal.lodgings, { ...rules, travel: { ...rules.travel, maxTravelMin: Number.POSITIVE_INFINITY } });
        applyProposal(keep.trip, keep.proposal, {}, t('lodgings.saved'), trip);
      },
      onApply: (choices) => applyProposal(proposal.base, proposal.result, choices, t('lodgings.saved'), trip)
    }
  }[proposal.kind];

  const editing = dialog?.kind === 'personal' && dialog.stepIndex !== undefined ? current.steps[dialog.stepIndex] : null;

  return (
    <Page>
      <header className="space-y-2">
        <h2 className="text-2xl font-bold">{trip.title}</h2>
        <p className="text-ink-muted">
          {format.date(`${trip.startDate}T12:00:00Z`, { dateStyle: 'long', timeZone: 'UTC' })} – {format.date(`${trip.endDate}T12:00:00Z`, { dateStyle: 'long', timeZone: 'UTC' })}
        </p>
        <Button variant="secondary" icon={FileDown} onClick={() => setDialog({ kind: 'export' })}>
          {t('export.button')}
        </Button>
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

      <div role="status" aria-live="polite">
        {notice && (
          <p className="flex items-center gap-2 rounded-xl bg-subtle px-3 py-2">
            {notice.includes(t('replan.weatherOffline')) && <CloudOff aria-hidden="true" className="size-5 shrink-0" />}
            {notice}
          </p>
        )}
      </div>

      <section role="tabpanel" id={`panel-${day}`} aria-labelledby={`tab-${day}`} tabIndex={0}>
        <DayView
          trip={trip}
          dayIndex={day}
          rules={rules}
          isToday={isToday}
          readOnly={readOnly}
          highlightId={highlightId}
          stepRefs={stepRefs}
          onEditTime={(i) => !readOnly && setDialog({ kind: 'time', stepIndex: i })}
          onReplace={(i) => !readOnly && setDialog({ kind: 'replace', stepIndex: i })}
          onLodging={() => !readOnly && setDialog({ kind: 'lodging' })}
          onAddStep={(afterIndex) => !readOnly && openPersonal(afterIndex)}
          onEditPersonal={(i) => !readOnly && setDialog({ kind: 'personal', stepIndex: i })}
          onTrack={(i, s) => !readOnly && track(i, s)}
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
      {dialog?.kind === 'export' && <ExportDialog trip={trip} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'lodging' && <LodgingEditor trip={trip} onSave={saveLodgings} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'personal' && !proposal && (
        <PersonalStepForm
          trip={trip}
          dayIndex={day}
          rules={rules}
          step={editing}
          draft={dialog.draft}
          defaultStart={dialog.defaultStart}
          defaultEnd={dialog.defaultEnd}
          blockingError={dialog.error}
          onSubmit={submitPersonal}
          onDelete={editing ? () => deletePersonal(editing.id) : undefined}
          onClose={() => setDialog(null)}
        />
      )}
      {proposal && panel && (
        <ReplanPanel
          proposal={{ ...proposal.result, weatherChecked: proposal.kind === 'tracking' ? proposal.result.weatherChecked : undefined }}
          intro={panel.intro}
          dismissLabel={panel.dismissLabel}
          onDismiss={panel.onDismiss}
          onApply={panel.onApply}
          onClose={() => setProposal(null)}
        />
      )}
      {undo && (
        <UndoBar
          key={undo.message + undo.previous.updatedAt}
          message={undo.message}
          seconds={rules.ui.undoDelaySec}
          onUndo={async () => {
            await save(undo.previous);
            setUndo(null);
          }}
          onExpire={expireUndo}
        />
      )}
    </Page>
  );
}
