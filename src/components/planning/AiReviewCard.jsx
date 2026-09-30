import { useId, useState } from 'react';
import { ChevronDown, History, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Dialog from '../ui/Dialog.jsx';

/**
 * « Le mot de l'assistant » en tête du planning relu par l'assistant IA :
 * résumé ; si des changements ont été appliqués, badge « Ajusté par
 * l'assistant IA », nombre de changements, « Voir les changements » (avec
 * leur raison) et « Revenir à la version d'origine » (après confirmation) ;
 * version d'origine affichée : « Revenir à la version relue ». Relecture
 * tentée sans changement : résumé seul, sans badge. Rien sinon.
 * @param {{ trip: object, readOnly?: boolean, onShowOriginal: () => void, onShowReviewed: () => void }} props
 */
export default function AiReviewCard({ trip, readOnly, onShowOriginal, onShowReviewed }) {
  const { t } = useTranslation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const review = trip.review;
  const status = review?.status;
  if (!review || !['applied', 'unchanged', 'reverted'].includes(status)) return null;
  const count = review.appliedOps?.length ?? 0;
  if (status === 'unchanged' && !review.summary) return null;

  const dayLabel = (i) => t('aiReview.day', { n: i + 1 });
  const describe = (op) => {
    if (op.op === 'swap') return t('aiReview.ops.swap', { a: op.nameA ?? '…', b: op.nameB ?? '…' });
    if (op.op === 'replace') return t('aiReview.ops.replace', { from: op.fromName ?? '…', to: op.toName ?? '…' });
    return t('aiReview.ops.shift', { name: op.name ?? '…', from: op.from, to: op.newStart });
  };

  return (
    <Card as="section" aria-labelledby="ai-review-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-review-title" className="flex items-center gap-2 text-xl font-semibold">
          <Sparkles aria-hidden="true" className="size-6 shrink-0 text-primary-strong" />
          {t('aiReview.card.title')}
        </h2>
        {status === 'applied' && (
          <Badge tone="primary" icon={Sparkles}>
            {t('aiReview.card.badge')}
          </Badge>
        )}
      </div>

      {status === 'reverted' ? (
        <p>{t('aiReview.card.originalShown')}</p>
      ) : (
        review.summary && <p>{review.summary}</p>
      )}

      {status === 'applied' && count > 0 && (
        <>
          <p className="text-ink-muted">{t('aiReview.card.changes', { count })}</p>
          <Button variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={listId}>
            <ChevronDown aria-hidden="true" className={`size-5 motion-ok:transition-transform ${open ? 'rotate-180' : ''}`} />
            {open ? t('aiReview.card.hideChanges') : t('aiReview.card.showChanges')}
          </Button>
          <ul id={listId} hidden={!open} className="space-y-2">
            {review.appliedOps.map((op, i) => (
              <li key={i} className="rounded-xl bg-subtle px-3 py-2">
                <p className="font-medium">
                  <span className="text-ink-muted">{dayLabel(op.dayIndex)} · </span>
                  {describe(op)}
                </p>
                {op.reason && <p className="text-ink-muted">{op.reason}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      {!readOnly && status === 'applied' && review.originalDays && (
        <Button variant="secondary" icon={History} onClick={() => setConfirm(true)}>
          {t('aiReview.card.showOriginal')}
        </Button>
      )}
      {!readOnly && status === 'reverted' && (
        <Button variant="secondary" icon={Sparkles} onClick={onShowReviewed}>
          {t('aiReview.card.showReviewed')}
        </Button>
      )}

      {confirm && (
        <Dialog
          title={t('aiReview.confirm.title')}
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => {
                  setConfirm(false);
                  onShowOriginal();
                }}
              >
                {t('aiReview.confirm.action')}
              </Button>
            </>
          }
        >
          <p>{t('aiReview.confirm.text')}</p>
        </Dialog>
      )}
    </Card>
  );
}
