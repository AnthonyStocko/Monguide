import { useEffect, useState } from 'react';
import { BadgeCheck, Search } from 'lucide-react';
import { m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { distanceKm } from '@domain/geo.js';
import { alternativesFor } from '@domain/replaceStep.js';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';
import { useFormat } from '../../i18n/useFormat.js';
import { usePlaceName } from '../../i18n/usePlaceName.js';
import { getPlaces } from '../../services/dataApi.js';
import { photosForPlaces } from '../../services/tripImages.js';
import Illustration, { illustrationForCategory } from '../../illustrations/index.jsx';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';
import { usePhoto } from '../ui/Photo.jsx';
import { cascadeProps, useFirstShow, useMotionAllowed } from '../../ui/motion.js';

/**
 * Candidat : vignette (photo, crédit derrière le bouton "i" affiché sous la
 * ligne, sinon illustration de sa catégorie) à côté du bouton de choix.
 */
function Candidate({ place, image, label, detail, badge, onPick, index, animate }) {
  const { t } = useTranslation();
  const { media, creditBlock } = usePhoto({ image, illustration: illustrationForCategory(place.category), alt: t('image.alt', { name: label }), className: 'size-20 shrink-0 rounded-xl' });
  return (
    <m.li {...cascadeProps(index, animate)} className="rounded-xl border-2 border-line p-2">
      <div className="flex items-stretch gap-2">
        {media}
        <button
          type="button"
          onClick={onPick}
          className="flex min-h-12 flex-1 items-start gap-3 rounded-lg p-1 text-left hover:bg-primary-soft"
        >
          <span className="flex-1">
            <span className="block font-semibold">{label}</span>
            <span className="block text-ink-muted">{detail}</span>
            {badge}
          </span>
        </button>
      </div>
      {creditBlock}
    </m.li>
  );
}

/**
 * Remplacement d'une étape : les 3 meilleurs candidats de la réserve
 * (trip.candidates, disponible hors ligne), puis "Plus de choix" qui
 * interroge la fonction places quand le réseau est disponible. Photos des
 * candidats demandées à l'affichage (fonction images) ; le lieu choisi garde
 * la sienne.
 * @param {{ trip: object, dayIndex: number, stepIndex: number, onPick: (place: object) => void, onClose: () => void }} props
 */
export default function ReplaceStepDialog({ trip, dayIndex, stepIndex, onPick, onClose }) {
  const { t, i18n } = useTranslation();
  const { placeName, stepName } = usePlaceName();
  const format = useFormat();
  const online = useOnlineStatus();
  const [extra, setExtra] = useState({ status: 'idle', places: [] });
  const step = trip.days[dayIndex].steps[stepIndex];
  const options = alternativesFor(trip, dayIndex, stepIndex, { limit: extra.places.length ? 8 : 3, extraPlaces: extra.places });
  const [images, setImages] = useState({});
  // Résultats en cascade à leur premier affichage (candidats de la réserve, puis "Plus de choix").
  const allowed = useMotionAllowed();
  const firstShow = useFirstShow(`replace:${step.id}:${extra.status === 'ok' ? 'more' : 'reserve'}`);
  const animate = allowed && firstShow;
  const wanted = options.filter((p) => p.wikidata && !p.image && !(p.wikidata in images)).map((p) => p.wikidata).join(',');
  useEffect(() => {
    if (!wanted || !online) return undefined;
    let alive = true;
    photosForPlaces(wanted.split(',').map((wikidata) => ({ wikidata })))
      .then((found) => alive && setImages((current) => ({ ...current, ...found })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [wanted, online]);
  const imageOf = (p) => p.image ?? (p.wikidata ? images[p.wikidata] : null) ?? null;

  const more = async () => {
    setExtra({ status: 'loading', places: [] });
    try {
      const { data } = await getPlaces({
        lat: trip.destination.lat,
        lon: trip.destination.lon,
        radiusKm: trip.destination.radiusKm,
        countryCode: trip.destination.countryCode,
        profile: trip.profile,
        lunch: trip.lunch,
        lang: i18n.resolvedLanguage
      });
      setExtra({ status: 'ok', places: data.places });
    } catch (error) {
      setExtra({ status: 'error', places: [], error });
    }
  };

  return (
    <Dialog title={t('replace.title', { name: stepName(step) ?? t('generation.freeTime') })} onClose={onClose}>
      {options.length === 0 && (
        <div className="flex flex-col items-center gap-2 text-center">
          <Illustration name="noResults" className="aspect-[4/3] w-full max-w-48 rounded-3xl" />
          <p className="text-ink-muted">{t('replace.none')}</p>
        </div>
      )}
      <ul className="space-y-2">
        {options.map((p, i) => {
          const km = step.place ? distanceKm(step.place, p) : null;
          const image = imageOf(p);
          return (
            <Candidate
              key={p.id}
              index={i}
              animate={animate}
              place={p}
              image={image}
              label={placeName(p)}
              detail={`${t(`categories.${p.category}`)}${km !== null ? ` · ${t('replace.distance', { km: format.number(km, { maximumFractionDigits: 1 }) })}` : ''}`}
              badge={
                p.certified &&
                p.certification && (
                  <Badge tone="accent" icon={BadgeCheck} className="mt-1">
                    {t(`certifications.${p.certification}`)}
                  </Badge>
                )
              }
              onPick={() => onPick(image && !p.image ? { ...p, image } : p)}
            />
          );
        })}
      </ul>
      {extra.status !== 'ok' && (
        <Button variant="secondary" icon={Search} onClick={more} disabled={!online || extra.status === 'loading'} className="w-full">
          {extra.status === 'loading' ? t('replace.loading') : t('replace.more')}
        </Button>
      )}
      {!online && <p className="text-ink-muted">{t('replace.offline')}</p>}
      {extra.status === 'error' && <p className="font-medium text-danger-on-soft">{t(extra.error.messageKey ?? 'errors.unknown')}</p>}
    </Dialog>
  );
}
