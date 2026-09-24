import { useTranslation } from 'react-i18next';
import Badge from '../ui/Badge.jsx';

const TONES = { ok: 'primary', cache: 'secondary', failed: 'danger' };

/**
 * État de chaque source d'une réponse places, avec le message prévu pour
 * l'utilisateur en cas d'échec ou de copie expirée.
 * @param {{ sources: { name: string, status: 'ok' | 'cache' | 'failed', message?: string }[] }} props
 */
export default function SourceStatusList({ sources }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-2">
      {sources.map((s) => (
        <li key={s.name} className="rounded-xl bg-subtle px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{t(`sources.${s.name}.name`, { defaultValue: s.name })}</span>
            <Badge tone={TONES[s.status]}>{t(`sources.status.${s.status}`)}</Badge>
          </div>
          {s.status === 'failed' && <p className="mt-1 text-danger-on-soft">{t(`sources.${s.name}.failed`, { defaultValue: t('sources.failed') })}</p>}
          {s.status === 'cache' && s.message === 'stale' && <p className="mt-1 text-ink-muted">{t('sources.stale')}</p>}
        </li>
      ))}
    </ul>
  );
}
