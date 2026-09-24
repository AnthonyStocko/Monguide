import { ChevronRight, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import DeleteAccountSection from '../components/account/DeleteAccountSection.jsx';
import Page from '../components/layout/Page.jsx';
import Card from '../components/ui/Card.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { setLanguage } from '../i18n/index.js';
import { SUPPORTED_LANGUAGES } from '../i18n/language.js';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();

  const link = (to, Icon, label) => (
    <Link to={to} className="flex min-h-12 items-center gap-3 rounded-xl px-3 hover:bg-subtle">
      <Icon aria-hidden="true" className="size-6 text-secondary" />
      <span className="flex-1">{label}</span>
      <ChevronRight aria-hidden="true" className="size-6 text-ink-muted" />
    </Link>
  );

  return (
    <Page>
      <Card as="section">
        <fieldset className="space-y-2">
          <legend className="text-xl font-semibold">{t('settings.language')}</legend>
          <p className="text-ink-muted">{t('settings.languageHint')}</p>
          {SUPPORTED_LANGUAGES.map((lng) => (
            <label
              key={lng}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 hover:bg-subtle has-[:checked]:bg-primary-soft"
            >
              <input
                type="radio"
                name="language"
                value={lng}
                checked={i18n.resolvedLanguage === lng}
                onChange={() => setLanguage(lng)}
                className="size-6 accent-primary-strong"
              />
              <span lang={lng}>{t(`languages.${lng}`)}</span>
            </label>
          ))}
        </fieldset>
      </Card>

      <Card as="section" className="space-y-1 p-2">
        {link('/account', UserRound, session ? t('auth.myAccount') : t('auth.title'))}
        {link('/privacy', ShieldCheck, t('privacy.title'))}
        {link('/debug', Stethoscope, t('debug.title'))}
      </Card>

      <DeleteAccountSection />
    </Page>
  );
}
