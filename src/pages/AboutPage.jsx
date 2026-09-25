import { ExternalLink, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DATA_SOURCES } from '@domain/config/dataSources.js';
import Page from '../components/layout/Page.jsx';
import Card from '../components/ui/Card.jsx';
import { APP_VERSION } from '../config/app.js';
import { sitePage } from '../config/links.js';
import { useConfig } from '../hooks/useConfig.js';
import { useFormat } from '../i18n/useFormat.js';

/** Autres éléments intégrés à l'application (noms propres, licences). */
const CREDITS = [
  { name: 'DejaVu Sans', license: 'Bitstream Vera / domaine public', url: 'https://dejavu-fonts.github.io' },
  { name: 'Leaflet', license: 'BSD 2-Clause', url: 'https://leafletjs.com' },
  { name: 'Lucide', license: 'ISC', url: 'https://lucide.dev' },
  { name: 'opening_hours.js', license: 'LGPL-3.0', url: 'https://github.com/opening-hours/opening_hours.js' },
  { name: 'jsPDF', license: 'MIT', url: 'https://github.com/parallax/jsPDF' },
  { name: 'Capacitor', license: 'MIT', url: 'https://capacitorjs.com' }
];

function Link({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-1 font-medium text-primary-strong underline">
      {children}
      <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
    </a>
  );
}

/** À propos et sources des données : version, crédits et licences, caractère indicatif des informations. */
export default function AboutPage() {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const osmDataDate = useConfig().config.osm?.dataDate;
  return (
    <Page>
      <Card as="section" className="space-y-2">
        <h2 className="text-2xl font-bold">Mon guide</h2>
        <p>{t('about.version', { version: APP_VERSION })}</p>
        <p className="flex items-start gap-2 rounded-xl bg-secondary-soft px-3 py-2 text-secondary-on-soft">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t('about.indicative')}
        </p>
      </Card>

      <Card as="section" aria-labelledby="about-sources" className="space-y-3">
        <h2 id="about-sources" className="text-xl font-semibold">
          {t('about.sourcesTitle')}
        </h2>
        <ul className="space-y-3">
          {DATA_SOURCES.map((s) => (
            <li key={s.id} className="border-b border-line pb-2 last:border-0">
              <p className="font-semibold">{s.name}</p>
              <p className="text-ink-muted first-letter:uppercase">{t(`export.sourceUses.${s.id}`)}</p>
              <p>
                {s.holder} · {t('about.license', { license: s.license })}
              </p>
              {s.id === 'osm' && osmDataDate && (
                <p>{t('about.osmDataDate', { date: format.date(`${osmDataDate}T12:00:00Z`, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) })}</p>
              )}
              {s.id === 'osm' && <Link href="https://opendatacommons.org/licenses/odbl/1-0/">{t('about.odbl')}</Link>}
              <Link href={s.url}>{t('about.visit', { name: s.name })}</Link>
            </li>
          ))}
        </ul>
        <p className="text-ink-muted">{t('about.mapTiles')}</p>
      </Card>

      <Card as="section" aria-labelledby="about-credits" className="space-y-3">
        <h2 id="about-credits" className="text-xl font-semibold">
          {t('about.creditsTitle')}
        </h2>
        <ul className="space-y-2">
          {CREDITS.map((c) => (
            <li key={c.name}>
              <Link href={c.url}>{c.name}</Link> <span className="text-ink-muted">· {c.license}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card as="section" className="space-y-1">
        <Link href={sitePage('privacy', i18n.resolvedLanguage)}>{t('about.privacyOnline')}</Link>
        <br />
        <Link href={sitePage('deleteAccount', i18n.resolvedLanguage)}>{t('about.deleteOnline')}</Link>
      </Card>
    </Page>
  );
}
