import { useEffect, useState } from 'react';
import { BadgeCheck, CalendarDays, ChevronRight, CircleCheck, CloudRain, Heart, Info, Landmark, Plus, Trash2, TriangleAlert, Trees } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import css from '../index.css?raw';
import { CONTRAST_PAIRS, evaluatePairs, parseThemeColors } from '../components/debug/theme/contrastPairs.js';
import Page from '../components/layout/Page.jsx';
import ReduceMotionSwitch from '../components/settings/ReduceMotionSwitch.jsx';
import Badge from '../components/ui/Badge.jsx';
import BottomSheet from '../components/ui/BottomSheet.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import ChoiceGroup from '../components/ui/ChoiceGroup.jsx';
import Chip from '../components/ui/Chip.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import ImageCard from '../components/ui/ImageCard.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import Switch from '../components/ui/Switch.jsx';
import Toast from '../components/ui/Toast.jsx';

const COLORS = parseThemeColors(css);
const RESULTS = evaluatePairs(COLORS, CONTRAST_PAIRS);

/** Fausses photos embarquées (aucun réseau) : les pires cas pour le texte blanc. */
const svgPhoto = (body) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">${body}</svg>`)}`;
const SAMPLE_CREDIT = {
  author: 'Exemple Auteur',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  sourceUrl: 'https://commons.wikimedia.org/wiki/Main_Page'
};
const PHOTOS = {
  white: { thumbUrl: svgPhoto('<rect width="640" height="360" fill="#ffffff"/>'), width: 640, height: 360, credit: SAMPLE_CREDIT },
  yellow: { thumbUrl: svgPhoto('<rect width="640" height="360" fill="#ffe600"/>'), width: 640, height: 360, credit: SAMPLE_CREDIT },
  scene: {
    thumbUrl: svgPhoto(
      '<defs><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#fef9c3"/></linearGradient></defs><rect width="640" height="360" fill="url(#s)"/><path d="M0 250 L160 120 L300 230 L420 140 L640 260 V360 H0Z" fill="#a8a29e"/><path d="M0 300 C200 260 420 320 640 280 V360 H0Z" fill="#65a30d"/>'
    ),
    width: 640,
    height: 360,
    credit: { ...SAMPLE_CREDIT, author: '' }
  },
  broken: { thumbUrl: 'https://upload.wikimedia.org/__exemple_introuvable__.jpg', width: 640, height: 360, credit: SAMPLE_CREDIT },
  forbidden: { thumbUrl: 'https://example.org/photo.jpg', width: 640, height: 360, credit: SAMPLE_CREDIT }
};

function Section({ title, children }) {
  return (
    <Card as="section" className="space-y-4">
      <h2 className="text-2xl">{title}</h2>
      {children}
    </Card>
  );
}

function Row({ label, children }) {
  return (
    <div className="space-y-2">
      <h3 className="text-lg">{label}</h3>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Vitrine du design system (/debug/theme) : polices, couleurs, contrastes
 * calculés depuis index.css, et chaque composant dans ses états. Tout est
 * embarqué : la page s'affiche à l'identique en mode avion.
 */
export default function ThemeDebugPage() {
  const { t } = useTranslation();
  const [chips, setChips] = useState({ culture: true, nature: false });
  const [switchOn, setSwitchOn] = useState(true);
  const [choice, setChoice] = useState('walk');
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [toast, setToast] = useState(false);
  const [toastKey, setToastKey] = useState(0);


  // Toast flottant : disparaît seul au bout de 5 s.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(false), 5000);
    return () => clearTimeout(timer);
  }, [toast, toastKey]);

  const failures = RESULTS.filter((r) => !r.pass).length;
  const sample = t('debugTheme.sampleText');

  return (
    <Page>
      <Card className="space-y-2">
        <p className="text-ink-muted">{t('debugTheme.intro')}</p>
        <ReduceMotionSwitch id="theme-reduce-motion" />
      </Card>

      <Section title={t('debugTheme.typography')}>
        <h1 className="text-3xl">{t('debugTheme.h1')}</h1>
        <h2 className="text-2xl">{t('debugTheme.h2')}</h2>
        <h3 className="text-xl">{t('debugTheme.h3')}</h3>
        <h4 className="text-lg">{t('debugTheme.h4')}</h4>
        <p>{sample}</p>
        <p className="font-semibold">{t('debugTheme.bold')}</p>
        <p className="text-ink-muted">{t('debugTheme.muted')}</p>
        <p className="text-credit text-ink-muted">{t('debugTheme.credit')}</p>
        <p className="text-accent-rust">{t('debugTheme.accent')}</p>
      </Section>

      <Section title={t('debugTheme.colors')}>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(COLORS).map(([name, hex]) => (
            <li key={name} className="flex items-center gap-2">
              <span aria-hidden="true" className="size-10 shrink-0 rounded-lg border border-line" style={{ background: hex }} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{name}</span>
                <span className="text-credit text-ink-muted">{hex}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('debugTheme.contrast')}>
        <p role="status" className={failures ? 'font-semibold text-danger-on-soft' : 'font-semibold text-primary-strong'}>
          {failures ? t('debugTheme.contrastFail', { count: failures }) : t('debugTheme.contrastOk', { count: RESULTS.length })}
        </p>
        <ul className="space-y-2">
          {RESULTS.map((r) => (
            <li key={`${r.fg}-${r.bg}-${r.over ?? ''}`} className="flex flex-wrap items-center gap-3 border-b border-line pb-2 last:border-b-0">
              <span
                aria-hidden="true"
                className="inline-flex min-h-12 min-w-24 items-center justify-center rounded-lg px-3 font-semibold"
                style={{
                  color: r.fgHex,
                  background: r.over
                    ? `linear-gradient(rgb(15 23 42 / ${r.alpha ?? 0.72}), rgb(15 23 42 / ${r.alpha ?? 0.72})), ${r.over}`
                    : r.bgHex
                }}
              >
                {r.nonText ? '■ ─' : 'Aa'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">{r.usage}</span>
                <span className="text-credit text-ink-muted">
                  {r.fg} / {r.bg}
                  {r.over ? ` + ${r.over}` : ''}
                </span>
              </span>
              <Badge tone={r.pass ? 'primary' : 'danger'}>
                {r.ratio.toFixed(2)}:1 {r.pass ? '≥' : '<'} {r.min}
              </Badge>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('debugTheme.buttons')}>
        {['primary', 'secondary', 'ghost'].map((variant) => (
          <Row key={variant} label={t(`debugTheme.variants.${variant}`)}>
            <Button variant={variant}>{t('debugTheme.action')}</Button>
            <Button variant={variant} icon={Plus}>
              {t('debugTheme.withIcon')}
            </Button>
            <Button variant={variant} icon={Heart} aria-label={t('debugTheme.iconOnly')} />
            <Button variant={variant} disabled>
              {t('debugTheme.disabled')}
            </Button>
          </Row>
        ))}
        <p className="text-ink-muted">{t('debugTheme.pressHint')}</p>
      </Section>

      <Section title={t('debugTheme.chipsBadges')}>
        <Row label={t('debugTheme.chips')}>
          <Chip selected={chips.culture} onChange={(v) => setChips((c) => ({ ...c, culture: v }))} icon={Landmark}>
            {t('categories.museum')}
          </Chip>
          <Chip selected={chips.nature} onChange={(v) => setChips((c) => ({ ...c, nature: v }))} icon={Trees}>
            {t('categories.park')}
          </Chip>
          <Chip selected={false} onChange={() => {}} disabled>
            {t('debugTheme.disabled')}
          </Chip>
        </Row>
        <Row label={t('debugTheme.badges')}>
          <Badge>{t('categories.monument')}</Badge>
          <Badge tone="accent" icon={BadgeCheck}>
            {t('debugTheme.certified')}
          </Badge>
          <Badge tone="secondary" icon={CloudRain}>
            {t('planning.rain', { pct: 40 })}
          </Badge>
          <Badge tone="primary" icon={CircleCheck}>
            {t('tracking.status.done')}
          </Badge>
          <Badge tone="warning">{t('tracking.status.skipped')}</Badge>
          <Badge tone="danger" icon={TriangleAlert}>
            {t('planning.conflict')}
          </Badge>
        </Row>
      </Section>

      <Section title={t('debugTheme.cards')}>
        <Card>
          <h3 className="text-xl">{t('debugTheme.plainCard')}</h3>
          <p className="text-ink-muted">{sample}</p>
        </Card>
        <ImageCard image={PHOTOS.scene} illustration="viewpoint" credit="inline" title={t('debugTheme.photoTop')} subtitle={t('debugTheme.noAuthor')}>
          <p>{sample}</p>
        </ImageCard>
        <ImageCard image={PHOTOS.white} illustration="museum" overlay title={t('debugTheme.overlayWhite')} subtitle={t('debugTheme.worstCase')} />
        <ImageCard image={PHOTOS.yellow} illustration="museum" overlay title={t('debugTheme.overlayYellow')} subtitle={t('debugTheme.worstCase')} />
        <ImageCard image={null} illustration="smallHeritage" overlay title={t('debugTheme.noPhoto')} subtitle={t('debugTheme.illustrationShown')} />
        <ImageCard image={PHOTOS.broken} illustration="restaurant" title={t('debugTheme.brokenPhoto')}>
          <p className="text-ink-muted">{t('debugTheme.illustrationShown')}</p>
        </ImageCard>
        <ImageCard image={PHOTOS.forbidden} illustration="lodging" layout="thumb" title={t('debugTheme.forbiddenPhoto')} subtitle={t('debugTheme.illustrationShown')} />
        <ImageCard image={PHOTOS.scene} illustration="viewpoint" layout="thumb" title={t('debugTheme.thumb')} subtitle={t('categories.viewpoint')} />
      </Section>

      <Card className="p-0">
        <Link to="/debug/illustrations" className="flex min-h-12 items-center gap-3 rounded-2xl px-4 py-3 font-semibold hover:bg-subtle">
          <span className="flex-1">{t('debugTheme.illustrationsLink')}</span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
        </Link>
      </Card>

      <Section title={t('debugTheme.feedback')}>
        <Row label={t('debugTheme.skeleton')}>
          <div className="w-full space-y-2">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        </Row>
        <Row label={t('debugTheme.toasts')}>
          <div className="w-full space-y-2">
            <Toast inline icon={Info} message={t('debugTheme.toastInfo')} onClose={() => {}} />
            <Toast inline tone="success" icon={CircleCheck} message={t('debugTheme.toastSuccess')} />
            <Toast inline tone="warning" icon={TriangleAlert} message={t('debugTheme.toastUndo')} action={{ label: t('replan.undo'), onClick: () => {} }} />
            <Button
              variant="secondary"
              onClick={() => {
                setToastKey((k) => k + 1);
                setToast(true);
              }}
            >
              {t('debugTheme.showToast')}
            </Button>
          </div>
        </Row>
        <Row label={t('debugTheme.modals')}>
          <Button variant="secondary" onClick={() => setSheet(true)}>
            {t('debugTheme.openSheet')}
          </Button>
          <Button variant="secondary" onClick={() => setDialog(true)}>
            {t('debugTheme.openDialog')}
          </Button>
        </Row>
      </Section>

      <Section title={t('debugTheme.forms')}>
        <Switch id="theme-switch" label={t('debugTheme.switchLabel')} checked={switchOn} onChange={setSwitchOn} />
        <ChoiceGroup
          name="theme-choice"
          legend={t('debugTheme.choiceLegend')}
          value={choice}
          onChange={setChoice}
          options={[
            { value: 'walk', label: t('debugTheme.choiceA') },
            { value: 'car', label: t('debugTheme.choiceB'), description: t('debugTheme.choiceHint') }
          ]}
        />
        <ChoiceGroup
          name="theme-choice-error"
          legend={t('debugTheme.choiceError')}
          value={null}
          onChange={() => {}}
          error={t('debugTheme.errorText')}
          layout="row"
          options={[
            { value: 1, label: '1' },
            { value: 2, label: '2' },
            { value: 3, label: '3' }
          ]}
        />
      </Section>

      <Section title={t('debugTheme.states')}>
        <EmptyState
          illustration="noTrips"
          title={t('debugTheme.emptyTitle')}
          description={t('debugTheme.emptyText')}
          action={<Button icon={Plus}>{t('debugTheme.action')}</Button>}
        />
        <EmptyState icon={CalendarDays} title={t('debugTheme.emptyIconTitle')} description={t('debugTheme.emptyText')} />
        <ErrorState message={t('debugTheme.errorText')} onRetry={() => {}} />
      </Section>

      <p className="text-ink-muted">{t('debugTheme.navHint')}</p>

      {toast && <Toast key={toastKey} icon={CircleCheck} tone="success" message={t('debugTheme.toastSuccess')} onClose={() => setToast(false)} />}
      {sheet && (
        <BottomSheet
          title={t('debugTheme.sheetTitle')}
          onClose={() => setSheet(false)}
          footer={
            <>
              <Button onClick={() => setSheet(false)}>{t('debugTheme.action')}</Button>
              <Button variant="secondary" icon={Trash2} onClick={() => setSheet(false)}>
                {t('common.cancel')}
              </Button>
            </>
          }
        >
          <ImageCard image={PHOTOS.scene} illustration="viewpoint" layout="thumb" title={t('debugTheme.thumb')} subtitle={t('categories.viewpoint')} as="div" />
          <p>{sample}</p>
        </BottomSheet>
      )}
      {dialog && (
        <Dialog title={t('debugTheme.dialogTitle')} onClose={() => setDialog(false)} footer={<Button onClick={() => setDialog(false)}>{t('common.close')}</Button>}>
          <p>{sample}</p>
        </Dialog>
      )}
    </Page>
  );
}
