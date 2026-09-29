import { useTranslation } from 'react-i18next';

const LINK = 'inline-flex min-h-12 items-center underline decoration-line-strong underline-offset-2';

/**
 * Crédit d'une photo en clair : "Photo : Auteur · Licence · Source", avec les
 * liens vers la licence et la page source (Wikimedia Commons), chacun de
 * 48 px de haut. Seul texte à 13 px (text-credit) avec les métadonnées.
 * onDark : sur fond sombre (texte blanc).
 * @param {{ credit: { author?: string, license: string, licenseUrl?: string, sourceUrl?: string }, onDark?: boolean, className?: string }} props
 */
export default function ImageCredit({ credit, onDark = false, className = '' }) {
  const { t } = useTranslation();
  const author = credit.author || t('image.unknownAuthor');
  return (
    <p className={`flex flex-wrap items-center gap-x-1.5 text-credit ${onDark ? 'text-white' : 'text-ink-muted'} ${className}`}>
      <span>{t('image.byAuthor', { author })}</span>
      <span aria-hidden="true">·</span>
      {credit.licenseUrl ? (
        <a href={credit.licenseUrl} target="_blank" rel="noreferrer" aria-label={t('image.licenseLabel', { license: credit.license })} className={LINK}>
          {credit.license}
        </a>
      ) : (
        <span>{credit.license}</span>
      )}
      {credit.sourceUrl && (
        <>
          <span aria-hidden="true">·</span>
          <a href={credit.sourceUrl} target="_blank" rel="noreferrer" aria-label={t('image.sourceLabel')} className={LINK}>
            {t('image.source')}
          </a>
        </>
      )}
    </p>
  );
}
