import { useTranslation } from 'react-i18next';
import Page from '../components/layout/Page.jsx';
import Card from '../components/ui/Card.jsx';
import { useConfig } from '../hooks/useConfig.js';

const SECTIONS = ['data', 'server', 'purpose', 'hosting', 'retention', 'rights', 'contact'];

/** Confidentialité : données collectées, traitement, hébergement, droits. */
export default function PrivacyPage() {
  const { t } = useTranslation();
  const { contact } = useConfig().config;
  return (
    <Page>
      {SECTIONS.map((s) => (
        <Card as="section" key={s} aria-labelledby={`privacy-${s}`} className="space-y-2">
          <h2 id={`privacy-${s}`} className="text-xl font-semibold">
            {t(`privacy.${s}.title`)}
          </h2>
          {t(`privacy.${s}.text`, { returnObjects: true }).map((p) => (
            <p key={p}>{p}</p>
          ))}
          {s === 'contact' &&
            (contact ? (
              <p>
                <a href={contact.includes('@') ? `mailto:${contact}` : contact} className="inline-flex min-h-12 items-center font-medium text-primary-strong underline">
                  {contact}
                </a>
              </p>
            ) : (
              <p className="text-ink-muted">{t('privacy.contactUnknown')}</p>
            ))}
        </Card>
      ))}
    </Page>
  );
}
