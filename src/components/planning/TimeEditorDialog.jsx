import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { checkSlotTiming } from '@domain/checkSlotTiming.js';
import { applyTiming, checkDay } from '@domain/dayEdits.js';
import { fromMinutes, toMinutes } from '@domain/time.js';
import { travelMinutes } from '@domain/travel.js';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';
import TravelTime from './TravelTime.jsx';

/** Heures proposées : de 06:00 à 23:55 par pas de 5 minutes (plus l'heure actuelle si hors pas). */
function timeOptions(current) {
  const out = [];
  for (let m = 6 * 60; m < 24 * 60; m += 5) out.push(fromMinutes(m));
  if (current && !out.includes(current)) out.push(current);
  return out.sort();
}

export function TimeSelect({ id, label, value, onChange }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-12 w-full rounded-xl border-2 border-ink-muted bg-surface px-3 text-base">
        {timeOptions(value).map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Durée lisible : "40 min", "1 h", "1 h 30". */
export function formatDuration(t, minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return t('timing.minutesOnly', { m });
  return m ? t('timing.hoursMinutes', { h, m: String(m).padStart(2, '0') }) : t('timing.hoursOnly', { h });
}

/** Texte d'un avertissement de checkSlotTiming / checkDay. */
export function useWarningText() {
  const { t } = useTranslation();
  return (w) =>
    t(`timing.${w.code}`, {
      ...w,
      activity: w.activity ? t(`timing.activities.${w.activity}`) : '',
      minimum: w.minimumMin !== undefined ? formatDuration(t, w.minimumMin) : '',
      duration: w.durationMin !== undefined ? formatDuration(t, w.durationMin) : '',
      mode: w.mode ? t(`planning.modeSuffix.${w.mode}`) : ''
    });
}

/**
 * Réglage de l'horaire d'une étape : début et fin (pas de 5 min), durée,
 * trajets voisins, avertissements en direct (non bloquants sauf INVALID),
 * option "Décaler aussi les étapes suivantes".
 * @param {{ trip: object, dayIndex: number, stepIndex: number, rules: any, onSave: (day: object) => void, onClose: () => void }} props
 */
export default function TimeEditorDialog({ trip, dayIndex, stepIndex, rules, onSave, onClose }) {
  const { t } = useTranslation();
  const warningText = useWarningText();
  const day = trip.days[dayIndex];
  const step = day.steps[stepIndex];
  const [start, setStart] = useState(step.start);
  const [end, setEnd] = useState(step.end);
  const [shift, setShift] = useState(false);

  const ctx = { mode: trip.mode, countryCode: trip.destination.countryCode };
  const check = checkSlotTiming({ day, index: stepIndex, start, end, ...ctx }, rules);
  const overlapsNext = check.warnings.some((w) => w.code === 'OVERLAP_NEXT');
  // Avec le décalage : les étapes suivantes sont revérifiées (mêmes avertissements, règle des 19h00).
  const shiftedDay = shift && overlapsNext ? applyTiming(day, stepIndex, { start, end, shiftFollowing: true }) : null;
  const shiftedWarnings = shiftedDay
    ? Object.entries(checkDay(shiftedDay, ctx, rules))
        .filter(([id]) => shiftedDay.steps.findIndex((s) => s.id === id) > stepIndex)
        .flatMap(([id, ws]) => ws.map((w) => ({ ...w, step: shiftedDay.steps.find((s) => s.id === id) })))
    : [];
  const shownWarnings = shiftedDay ? check.warnings.filter((w) => w.code !== 'OVERLAP_NEXT') : check.warnings;
  const hasWarnings = shownWarnings.length + shiftedWarnings.length > 0;

  const prev = day.steps[stepIndex - 1];
  const next = day.steps[stepIndex + 1];
  const travelFromPrev = prev?.place && step.place ? travelMinutes(prev.place, step.place, trip.mode, rules) : null;
  const travelToNext = next?.place && step.place ? travelMinutes(step.place, next.place, trip.mode, rules) : null;

  const save = () => onSave(applyTiming(day, stepIndex, { start, end, shiftFollowing: shift && overlapsNext }));

  return (
    <Dialog
      title={t('timing.title', { name: step.place?.name ?? t('generation.freeTime') })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={check.blocking}>
            {hasWarnings ? t('timing.saveAnyway') : t('timing.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <TimeSelect id="slot-start" label={t('timing.start')} value={start} onChange={setStart} />
        <TimeSelect id="slot-end" label={t('timing.end')} value={end} onChange={setEnd} />
      </div>
      <p aria-live="polite" className="font-medium">
        {check.durationMin > 0 ? t('timing.durationLabel', { duration: formatDuration(t, check.durationMin) }) : null}
        {check.belowRecommended && <span className="block font-normal text-ink-muted">{t('timing.belowRecommended')}</span>}
      </p>
      {(travelFromPrev !== null || travelToNext !== null) && (
        <ul className="space-y-1 text-ink-muted">
          {travelFromPrev !== null && (
            <li>
              <TravelTime minutes={travelFromPrev} mode={trip.mode} label={t('timing.fromPrevious', { end: prev.end })} />
            </li>
          )}
          {travelToNext !== null && (
            <li>
              <TravelTime minutes={travelToNext} mode={trip.mode} label={t('timing.toNext', { start: next.start })} />
            </li>
          )}
        </ul>
      )}
      <div role="status" aria-live="polite" className="space-y-2">
        {shownWarnings.map((w) => (
          <p key={w.code} className={`flex items-start gap-2 rounded-xl px-3 py-2 font-medium ${w.code === 'INVALID' ? 'bg-danger-soft text-danger-on-soft' : 'bg-warning-soft text-warning-on-soft'}`}>
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {warningText(w)}
          </p>
        ))}
        {shiftedWarnings.map((w) => (
          <p key={`${w.step.id}-${w.code}`} className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 font-medium text-warning-on-soft">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {t('timing.forStep', { name: w.step.place?.name ?? t('generation.freeTime'), text: warningText(w) })}
          </p>
        ))}
      </div>
      {overlapsNext && (
        <label className="flex min-h-12 cursor-pointer items-center gap-3">
          <input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} className="size-6 accent-primary-strong" />
          <span>{t('timing.shiftFollowing', { minutes: toMinutes(end) - toMinutes(step.end) })}</span>
        </label>
      )}
    </Dialog>
  );
}
