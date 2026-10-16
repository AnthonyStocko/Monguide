import { useTranslation } from 'react-i18next';
import Page from '../components/layout/Page.jsx';
import Card from '../components/ui/Card.jsx';
import { usePublicLinks } from '../config/links.js';

const SECTIONS = ['data', 'server', 'ai', 'push', 'sharing', 'purpose', 'hosting', 'retention', 'rights', 'contact'];

/** Confidentialité : données collectées, traitement, hébergement, droits. */
export default function PrivacyPage() {
  const { t } = useTranslation();
  const links = usePublicLinks();
  return (
    <Page>
      <Card as="section" className="space-y-1">
        <p>{t('privacy.online')}</p>
        {[
          [links.privacy, t('about.privacyOnline')],
          [links.accountDeletion, t('about.deleteOnline')],
          [links.legal, t('about.legalOnline')]
        ].map(([href, label]) => (
          <p key={href}>
            <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center font-medium text-primary-strong underline">
              {label}
            </a>
          </p>
        ))}
      </Card>
      {SECTIONS.map((s) => (
        <Card as="section" key={s} aria-labelledby={`privacy-${s}`} className="space-y-2">
          <h2 id={`privacy-${s}`} className="text-xl font-semibold">
            {t(`privacy.${s}.title`)}
          </h2>
          {t(`privacy.${s}.text`, { returnObjects: true }).map((p) => (
            <p key={p}>{p}</p>
          ))}
          {s === 'contact' && (
            <p>
              <a href={`mailto:${links.contactEmail}`} className="inline-flex min-h-12 items-center font-medium text-primary-strong underline">
                {links.contactEmail}
              </a>
            </p>
          )}
        </Card>
      ))}
    </Page>
  );
}
