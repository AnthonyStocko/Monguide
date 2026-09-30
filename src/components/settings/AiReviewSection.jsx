import { useTranslation } from 'react-i18next';
import { useConfig } from '../../hooks/useConfig.js';
import { setAiConsent, useAiConsent, useAiReviewAvailable } from '../../services/aiConsent.js';
import Card from '../ui/Card.jsx';
import Switch from '../ui/Switch.jsx';

/**
 * Réglage « Relecture par l'assistant IA » (consentement, modifiable à tout
 * moment). Masqué si la relecture est désactivée sur le serveur.
 */
export default function AiReviewSection() {
  const { t } = useTranslation();
  const { rules } = useConfig().config;
  const consent = useAiConsent();
  const available = useAiReviewAvailable(rules);
  if (available !== true || consent === undefined) return null;
  return (
    <Card as="section" aria-labelledby="ai-review-settings" className="space-y-2">
      <h2 id="ai-review-settings" className="text-xl">
        {t('aiReview.settings.title')}
      </h2>
      <Switch id="ai-review-consent" label={t('aiReview.settings.switch')} checked={consent === true} onChange={(next) => setAiConsent(next)} />
      <p className="text-ink-muted">{t('aiReview.settings.hint')}</p>
    </Card>
  );
}
