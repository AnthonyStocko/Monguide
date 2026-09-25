import { useTranslation } from 'react-i18next';
import { useFormat } from '../../i18n/useFormat.js';
import Badge from '../ui/Badge.jsx';

const TONES = { ok: 'primary', cache: 'secondary', failed: 'danger' };

/**
 * État de chaque source d'une réponse places : message prévu pour
 * l'utilisateur (échec, copie expirée, repli OpenStreetMap, pays sans lieux
 * OSM), durée de l'appel, requête envoyée (SPARQL Wikidata) et, pour OSM,
 * source utilisée, date des données et tuiles lues.
 * @param {{ sources: { name: string, status: 'ok' | 'cache' | 'failed', message?: string, durationMs?: number, query?: string, source?: string, dataDate?: string, tilesRead?: number }[] }} props
 */
export default function SourceStatusList({ sources }) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <ul className="space-y-2">
      {sources.map((s) => (
        <li key={`${s.name}-${s.zone ?? ''}`} className="rounded-xl bg-subtle px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{t(`sources.${s.name}.name`, { defaultValue: s.name })}</span>
            <span className="flex flex-wrap gap-2">
              {s.source && <Badge>{t('sources.via', { source: s.source })}</Badge>}
              {s.dataDate && <Badge>{t('sources.dataDate', { date: format.date(`${s.dataDate}T12:00:00Z`, { dateStyle: 'medium', timeZone: 'UTC' }) })}</Badge>}
              {s.tilesRead !== undefined && <Badge>{t('sources.tilesRead', { count: s.tilesRead })}</Badge>}
              {s.durationMs !== undefined &&
                (s.durationMs < 1000 ? (
                  <Badge>{t('sources.durationMs', { value: format.number(s.durationMs) })}</Badge>
                ) : (
                  <Badge>{t('sources.duration', { value: format.number(s.durationMs / 1000, { maximumFractionDigits: 1 }) })}</Badge>
                ))}
              <Badge tone={TONES[s.status]}>{t(`sources.status.${s.status}`)}</Badge>
            </span>
          </div>
          {s.status === 'failed' && s.message === 'not_covered' && <p className="mt-1 text-warning-on-soft">{t('sources.notCovered')}</p>}
          {s.status === 'failed' && s.message !== 'not_covered' && <p className="mt-1 text-danger-on-soft">{t(`sources.${s.name}.failed`, { defaultValue: t('sources.failed') })}</p>}
          {s.message === 'stale' && <p className="mt-1 text-ink-muted">{t('sources.stale')}</p>}
          {s.message === 'fallback_osm' && <p className="mt-1 text-warning-on-soft">{t('sources.fallbackOsm')}</p>}
          {s.message === 'no_regional_data' && <p className="mt-1 text-ink-muted">{t('sources.noRegionalData')}</p>}
          {s.query && (
            <details className="mt-1">
              <summary className="flex min-h-12 cursor-pointer items-center text-secondary-strong">{t('sources.query')}</summary>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-2 text-base">{s.query}</pre>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
