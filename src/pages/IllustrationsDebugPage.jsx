import { useTranslation } from 'react-i18next';
import Illustration, { ILLUSTRATIONS } from '../illustrations/index.jsx';
import Page from '../components/layout/Page.jsx';
import ReduceMotionSwitch from '../components/settings/ReduceMotionSwitch.jsx';
import Card from '../components/ui/Card.jsx';

const FORMATS = ['square', 'wide', 'empty', 'onboarding'];
const FRAMES = {
  square: 'aspect-square w-full rounded-2xl',
  wide: 'aspect-[16/9] w-full rounded-2xl',
  empty: 'aspect-[4/3] w-full rounded-2xl',
  onboarding: 'aspect-[4/3] w-full rounded-2xl'
};

/**
 * Toutes les illustrations maison (/debug/illustrations), groupées par format,
 * avec le réglage "Réduire les animations" pour vérifier qu'elles s'immobilisent.
 * Les vignettes carrées sont aussi montrées dans un cadre large, tel que dans
 * une carte à image en tête.
 */
export default function IllustrationsDebugPage() {
  const { t } = useTranslation();
  const names = Object.keys(ILLUSTRATIONS);

  return (
    <Page>
      <Card className="space-y-2">
        <p className="text-ink-muted">{t('debugIllustrations.intro', { count: names.length })}</p>
        <ReduceMotionSwitch id="illustrations-reduce-motion" />
      </Card>

      {FORMATS.map((format) => (
        <Card as="section" key={format} className="space-y-3">
          <h2 className="text-2xl">{t(`debugIllustrations.formats.${format}`)}</h2>
          <ul className={`grid gap-3 ${format === 'square' ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {names
              .filter((name) => ILLUSTRATIONS[name].format === format)
              .map((name) => (
                <li key={name} className="space-y-1">
                  <Illustration name={name} className={FRAMES[format]} />
                  <p>{t(`debugIllustrations.names.${name}`)}</p>
                  <p className="text-credit text-ink-muted">{name}</p>
                </li>
              ))}
          </ul>
          {format === 'square' && (
            <>
              <h3 className="text-lg">{t('debugIllustrations.inWideFrame')}</h3>
              <div className="grid grid-cols-2 gap-3">
                {['monument', 'restaurant'].map((name) => (
                  <Illustration key={name} name={name} className="aspect-[16/9] w-full rounded-2xl" />
                ))}
              </div>
            </>
          )}
        </Card>
      ))}
    </Page>
  );
}
