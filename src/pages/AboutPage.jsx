import { ExternalLink, Info, Mail, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DATA_SOURCES } from '@domain/config/dataSources.js';
import Page from '../components/layout/Page.jsx';
import Card from '../components/ui/Card.jsx';
import { APP_VERSION } from '../config/app.js';
import { usePublicLinks } from '../config/links.js';
import { shareLink } from '../platform/shareLink.js';
import { isAndroid, isAndroidBrowser, isNative } from '../platform/target.js';
import { useConfig } from '../hooks/useConfig.js';
import { useFormat } from '../i18n/useFormat.js';
import Logo from '../components/brand/Logo.jsx';
import Button from '../components/ui/Button.jsx';

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
  const { t } = useTranslation();
  const format = useFormat();
  const links = usePublicLinks();
  const osm = useConfig().config.osm;
  const day = (date) => format.date(`${date}T12:00:00Z`, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  // Date des données par pays importé ; sinon (serveur plus ancien) celle de la version en service.
  const osmCountries = Object.entries(osm?.countries ?? {}).sort(([a], [b]) => format.country(a).localeCompare(format.country(b)));
  return (
    <Page>
      <Card as="section" className="space-y-2">
        <h2>
          <Logo className="h-14 w-auto" />
        </h2>
        <p>{t(isNative ? 'about.version' : 'about.versionWeb', { version: APP_VERSION })}</p>
        {isAndroidBrowser && <Link href={links.playStore}>{t('about.playStore')}</Link>}
        {isAndroid && (
          <div className="space-y-1">
            <Link href={links.webApp}>{t('about.webApp')}</Link>
            <Button
              variant="secondary"
              icon={Share2}
              onClick={() => shareLink({ url: links.webApp, title: t('about.shareTitle'), text: t('about.shareText'), dialogTitle: t('about.share') }).catch(() => {})}
            >
              {t('about.share')}
            </Button>
          </div>
        )}
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
              {s.id === 'osm' && osmCountries.length > 0 && (
                <>
                  <p>{t('about.osmCountriesTitle')}</p>
                  <ul className="list-disc pl-5">
                    {osmCountries.map(([code, date]) => (
                      <li key={code}>{t('about.osmCountryDate', { country: format.country(code), date: day(date) })}</li>
                    ))}
                  </ul>
                </>
              )}
              {s.id === 'osm' && osmCountries.length === 0 && osm?.dataDate && <p>{t('about.osmDataDate', { date: day(osm.dataDate) })}</p>}
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
        <a href={`mailto:${links.contactEmail}`} className="inline-flex min-h-12 items-center gap-2 font-medium text-primary-strong underline">
          <Mail aria-hidden="true" className="size-5 shrink-0" />
          {t('about.contact')}
        </a>
        <br />
        <Link href={links.privacy}>{t('about.privacyOnline')}</Link>
        <br />
        <Link href={links.accountDeletion}>{t('about.deleteOnline')}</Link>
        <br />
        <Link href={links.legal}>{t('about.legalOnline')}</Link>
      </Card>
    </Page>
  );
}
