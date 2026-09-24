import { useState } from 'react';
import { CloudOff, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../i18n/useFormat.js';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';

/**
 * Panneau "Planning réajusté" : liste chaque changement proposé avec son
 * type (décalée, raccourcie, remplacée, reportée, supprimée, départ), un
 * horaire personnalisé touché est mentionné explicitement, et pour chaque
 * étape reportée ou supprimée l'utilisateur choisit entre les deux. Rien
 * n'est appliqué sans "Appliquer".
 * @param {{
 *   proposal: { changes: object[], warnings?: object[], weatherChecked?: boolean },
 *   onApply: (choices: Record<string, 'postponed' | 'removed'>) => void,
 *   onDismiss: () => void,
 *   dismissLabel: string,
 *   onClose: () => void,
 *   intro?: string
 * }} props
 */
export default function ReplanPanel({ proposal, onApply, onDismiss, dismissLabel, onClose, intro }) {
  const { t } = useTranslation();
  const format = useFormat();
  const [choices, setChoices] = useState(() => Object.fromEntries(proposal.changes.filter((c) => c.target).map((c) => [c.stepId, c.kind])));
  const dayName = (date) => format.date(`${date}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const name = (c) => c.name ?? t('generation.freeTime');

  const describe = (c) => {
    switch (c.kind) {
      case 'shifted':
        return t('replan.shifted', { name: name(c), start: c.to.start, end: c.to.end });
      case 'shortened':
        return t('replan.shortened', { name: name(c), start: c.to.start, end: c.to.end });
      case 'replaced':
        return t(`replan.replaced.${c.reason}`, { previous: c.previousName, name: c.name, start: c.to?.start, defaultValue: t('replan.replaced.default', { previous: c.previousName, name: c.name }) });
      case 'departure':
        if (!c.to) return t('replan.departureRemoved', { date: dayName(c.date) });
        return t('replan.departure', { date: dayName(c.date), time: c.to, place: c.lodgingName });
      default:
        return null;
    }
  };

  return (
    <Dialog
      title={t('replan.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onDismiss}>
            {dismissLabel}
          </Button>
          <Button onClick={() => onApply(choices)}>{t('replan.apply')}</Button>
        </>
      }
    >
      {intro && <p>{intro}</p>}
      {proposal.weatherChecked === false && (
        <p className="flex items-center gap-2 text-ink-muted">
          <CloudOff aria-hidden="true" className="size-5 shrink-0" />
          {t('replan.weatherOffline')}
        </p>
      )}
      <ul className="space-y-3">
        {proposal.changes.map((c) => (
          <li key={c.stepId} className="space-y-1 rounded-xl border border-line p-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t(`replan.kinds.${c.kind}`)}</p>
            {c.kind === 'postponed' || c.kind === 'removed' ? (
              <fieldset className="space-y-1">
                <legend className="font-medium">
                  {t('replan.dropped', { name: name(c), start: c.from?.start ?? '', reason: t(`replan.reasons.${c.reason}`, { defaultValue: '' }) })}
                </legend>
                {c.target ? (
                  ['postponed', 'removed'].map((kind) => (
                    <label key={kind} className="flex min-h-12 cursor-pointer items-center gap-3">
                      <input
                        type="radio"
                        name={`choice-${c.stepId}`}
                        checked={choices[c.stepId] === kind}
                        onChange={() => setChoices((prev) => ({ ...prev, [c.stepId]: kind }))}
                        className="size-6 accent-primary-strong"
                      />
                      <span>{kind === 'postponed' ? t('replan.postponeTo', { date: dayName(c.target.date), start: c.target.start, end: c.target.end }) : t('replan.remove')}</span>
                    </label>
                  ))
                ) : (
                  <p>{t('replan.willBeRemoved')}</p>
                )}
              </fieldset>
            ) : (
              <p className="font-medium">{describe(c)}</p>
            )}
            {c.customTime && c.from && c.to && (
              <p className="flex items-start gap-2 text-warning-on-soft">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                {c.kind === 'postponed' || c.kind === 'removed'
                  ? t('replan.customTimeDropped', { start: c.from.start })
                  : t('replan.customTime', { from: c.from.start, to: c.to.start })}
              </p>
            )}
          </li>
        ))}
      </ul>
      {proposal.warnings?.length > 0 && (
        <ul className="space-y-2">
          {proposal.warnings.map((w, i) => (
            <li key={`${w.code}-${i}`} className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 font-medium text-warning-on-soft">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              {t(`replan.warnings.${w.code}`, { ...w, date: w.date ? dayName(w.date) : '' })}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
