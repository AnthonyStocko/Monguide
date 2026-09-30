import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildReviewRequest } from '@domain/buildReviewRequest.js';
import { buildReviewSchema } from '@domain/reviewSchema.js';
import reviewPrompt from '../../../supabase/functions/_shared/ai/prompts/review.v1.md?raw';
import { useConfig } from '../../hooks/useConfig.js';
import { useFormat } from '../../i18n/useFormat.js';
import { listTrips } from '../../services/tripsStore.js';
import Card from '../ui/Card.jsx';

/** Estimation grossière des jetons (≈ 4 caractères par jeton) : ordre de grandeur seulement. */
const tokens = (chars) => Math.round(chars / 4);

/**
 * Relecture par l'IA : taille du résumé envoyé (buildReviewRequest), des
 * instructions et du schéma de réponse, pour un séjour enregistré. Le résumé
 * est anonymisé : il peut être affiché en clair.
 */
export default function AiReviewDebug() {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const { rules } = useConfig().config;
  const [trips, setTrips] = useState([]);
  const [tripId, setTripId] = useState('');

  useEffect(() => {
    listTrips()
      .then((list) => {
        const ready = list.filter((tr) => tr.days?.length);
        setTrips(ready);
        // Par défaut : un séjour de 3 jours s'il y en a un.
        setTripId((ready.find((tr) => tr.days.length === 3) ?? ready[0])?.id ?? '');
      })
      .catch(() => setTrips([]));
  }, []);

  const trip = trips.find((tr) => tr.id === tripId);
  const request = trip ? buildReviewRequest(trip, { language: i18n.resolvedLanguage }, rules) : null;
  const schema = request ? buildReviewSchema(request, rules) : null;
  const schemaChars = schema ? JSON.stringify(schema).length : 0;
  const n = (v) => format.number(v);

  return (
    <Card as="section" className="space-y-3">
      <h2 className="text-xl font-semibold">{t('debug.aiReview.title')}</h2>
      {!trips.length ? (
        <p className="text-ink-muted">{t('debug.aiReview.noTrip')}</p>
      ) : (
        <>
          <div className="space-y-1">
            <label htmlFor="ai-review-trip" className="block font-medium">
              {t('debug.aiReview.trip')}
            </label>
            <select id="ai-review-trip" value={tripId} onChange={(e) => setTripId(e.target.value)} className="min-h-12 w-full rounded-xl border-2 border-ink-muted bg-surface px-3 text-base">
              {trips.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {t('debug.aiReview.tripOption', { title: tr.title, count: tr.days.length })}
                </option>
              ))}
            </select>
          </div>
          {request && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-ink-muted">{t('debug.aiReview.content')}</dt>
              <dd>{t('debug.aiReview.counts', { days: request.stats.days, steps: request.stats.steps, editable: request.editableSteps.length, candidates: request.stats.candidates })}</dd>
              <dt className="text-ink-muted">{t('debug.aiReview.summary')}</dt>
              <dd>{t('debug.aiReview.size', { chars: n(request.stats.chars), bytes: n(request.stats.bytes), tokens: n(tokens(request.stats.chars)) })}</dd>
              <dt className="text-ink-muted">{t('debug.aiReview.prompt')}</dt>
              <dd>{t('debug.aiReview.sizeShort', { chars: n(reviewPrompt.length), tokens: n(tokens(reviewPrompt.length)) })}</dd>
              <dt className="text-ink-muted">{t('debug.aiReview.schema')}</dt>
              <dd>{t('debug.aiReview.sizeShort', { chars: n(schemaChars), tokens: n(tokens(schemaChars)) })}</dd>
            </dl>
          )}
          {request && (
            <details>
              <summary className="min-h-12 cursor-pointer py-3 font-medium">{t('debug.aiReview.show')}</summary>
              <pre className="max-h-96 overflow-auto rounded-xl bg-subtle p-3 text-sm whitespace-pre-wrap">{JSON.stringify(request.payload, null, 2)}</pre>
            </details>
          )}
        </>
      )}
    </Card>
  );
}
