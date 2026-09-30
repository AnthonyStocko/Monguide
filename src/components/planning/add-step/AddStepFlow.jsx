import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { defaultListTime, proposedTimes } from '@domain/addPlaceStep.js';
import { ACTIVITY_TYPE_IDS, ACTIVITY_TYPES } from '@domain/config/activityTypes.js';
import { cuisineOptions, listCandidates, mergePlaces, originFor } from '@domain/listCandidates.js';
import { useOnlineStatus } from '../../../hooks/useOnlineStatus.js';
import { useFormat } from '../../../i18n/useFormat.js';
import Illustration from '../../../illustrations/index.jsx';
import { getPlaces } from '../../../services/dataApi.js';
import { useMotionAllowed, variants } from '../../../ui/motion.js';
import Button from '../../ui/Button.jsx';
import Chip from '../../ui/Chip.jsx';
import Dialog from '../../ui/Dialog.jsx';
import EmptyState from '../../ui/EmptyState.jsx';
import { TimeSelect } from '../TimeEditorDialog.jsx';
import CandidateCard from './CandidateCard.jsx';
import PlaceDetailsSheet from './PlaceDetailsSheet.jsx';

/** Illustration de chaque type proposé (config/activityTypes.js). */
const TYPE_ILLUSTRATIONS = {
  restaurant: 'restaurant',
  museum: 'museum',
  monument: 'monument',
  nature: 'park',
  viewpoint: 'viewpoint',
  market: 'market',
  small_heritage: 'smallHeritage',
  personal: 'personal'
};

/** Distances maximales proposées en puces (km). */
const DISTANCES_KM = [1, 3, 10];

/**
 * Parcours « + Ajouter une étape » (panneau plein écran) :
 *  1. « Que voulez-vous ajouter ? » : une carte par type ;
 *  2. liste des lieux du type (listCandidates, hors ligne d'abord) : heure
 *     de début en tête, filtres en puces, recherche par nom, nombre de
 *     résultats annoncé, « Plus de résultats » en ligne ;
 *  3. fiche du lieu (PlaceDetailsSheet) et ajout.
 * Glissement entre les écrans, cascade de la liste (animations permises
 * seulement). Le type « Étape personnelle » ouvre le formulaire existant
 * (onPersonal). L'étape créée est transmise à onAdd, qui suit le même chemin
 * qu'une étape personnelle (replanDay, panneau « Planning réajusté »).
 * @param {{
 *   trip: object, dayIndex: number, afterIndex: number, rules: any,
 *   blockingError?: { code: string, name?: string } | null,
 *   onAdd: (step: object) => void, onPersonal: () => void, onClose: () => void
 * }} props
 */
export default function AddStepFlow({ trip, dayIndex, afterIndex, rules, blockingError, onAdd, onPersonal, onClose }) {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const online = useOnlineStatus();
  const animateAllowed = useMotionAllowed();
  const day = trip.days[dayIndex];

  const [screen, setScreen] = useState({ name: 'types', dir: 1 });
  const [type, setType] = useState(null);
  const [time, setTime] = useState(() => defaultListTime(day, afterIndex, rules));
  const [filters, setFilters] = useState({});
  const [query, setQuery] = useState('');
  const [extra, setExtra] = useState({ places: [], nextOffset: 0, status: 'idle' });
  const [selected, setSelected] = useState(null);
  const opened = useRef(false);
  useEffect(() => {
    opened.current = true;
  }, []);
  // Nouvel écran (monté après la sortie animée du précédent) : focus sur son titre, pour le
  // clavier et TalkBack. À l'ouverture, le focus va au titre du panneau.
  const headingRef = useCallback((el) => {
    if (el && opened.current) el.focus();
  }, []);

  const dayName = (date) => format.date(`${date}T12:00:00Z`, { weekday: 'long', timeZone: 'UTC' });
  // Point de départ : l'étape après laquelle on ajoute (si elle a un lieu), sinon originFor.
  const prevPlace = day.steps[afterIndex]?.place;
  const origin = useMemo(() => (prevPlace ? { lat: prevPlace.lat, lon: prevPlace.lon } : originFor(trip, dayIndex, time)), [prevPlace, trip, dayIndex, time]);

  const chooseType = (id) => {
    if (id === 'personal') {
      onPersonal();
      return;
    }
    setType(id);
    // Restaurant : « ouvert à l'heure choisie » actif par défaut.
    setFilters(id === 'restaurant' ? { open: true } : {});
    setQuery('');
    setExtra({ places: [], nextOffset: 0, status: 'idle' });
    setScreen({ name: 'list', dir: 1 });
  };
  const backToTypes = () => setScreen({ name: 'types', dir: -1 });

  const all = type ? listCandidates(trip, type, { date: day.date, time, origin, filters: { ...filters, query }, extraPlaces: extra.places }, rules) : null;
  const cuisines = type === 'restaurant' ? cuisineOptions(listCandidates(trip, type, { date: day.date, time, origin, extraPlaces: extra.places }, rules).items) : [];
  const items = all?.items ?? [];

  const loadMore = async () => {
    setExtra((e) => ({ ...e, status: 'loading' }));
    try {
      const { data } = await getPlaces({
        lat: trip.destination.lat,
        lon: trip.destination.lon,
        radiusKm: trip.destination.radiusKm,
        countryCode: trip.destination.countryCode,
        profile: trip.profile,
        lunch: trip.lunch,
        lang: i18n.resolvedLanguage,
        categories: [...ACTIVITY_TYPES[type].categories],
        offset: extra.nextOffset
      });
      setExtra((e) => ({ places: mergePlaces(e.places, data.places ?? []), nextOffset: data.nextOffset ?? null, status: 'idle' }));
    } catch {
      setExtra((e) => ({ ...e, status: 'error' }));
    }
  };

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value || undefined }));
  const slide = {
    variants: variants.slide,
    custom: screen.dir,
    initial: animateAllowed ? 'hidden' : false,
    animate: 'visible',
    exit: animateAllowed ? 'exit' : undefined
  };
  const title = screen.name === 'types' ? t('addStep.title') : t(`addStep.listTitle.${type}`);

  return (
    <Dialog fullScreen title={t('personal.addTitle')} onClose={onClose}>
      <AnimatePresence mode="wait" initial={false} custom={screen.dir}>
        {screen.name === 'types' ? (
          <m.section key="types" {...slide} aria-labelledby="add-step-heading" className="space-y-3">
            <h3 id="add-step-heading" ref={headingRef} tabIndex={-1} className="text-xl font-semibold">
              {title}
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {ACTIVITY_TYPE_IDS.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => chooseType(id)}
                    className="flex w-full items-center gap-3 rounded-3xl border-2 border-line bg-surface p-3 text-left hover:border-line-strong focus-visible:border-primary-strong"
                  >
                    <Illustration name={TYPE_ILLUSTRATIONS[id]} className="size-20 shrink-0 rounded-2xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-semibold">{t(`addStep.types.${id}.label`)}</span>
                      <span className="block text-ink-muted">{t(`addStep.types.${id}.description`)}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-6 shrink-0 text-ink-muted" />
                  </button>
                </li>
              ))}
            </ul>
          </m.section>
        ) : (
          <m.section key={`list-${type}`} {...slide} aria-labelledby="add-step-heading" className="space-y-4">
            <Button variant="ghost" icon={ArrowLeft} onClick={backToTypes}>
              {t('addStep.back')}
            </Button>
            <h3 id="add-step-heading" ref={headingRef} tabIndex={-1} className="text-xl font-semibold">
              {title}
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <TimeSelect id="add-step-time" label={t('addStep.time')} value={time} onChange={setTime} />
              <div className="space-y-1">
                <label htmlFor="add-step-search" className="block font-medium">
                  {t('addStep.search')}
                </label>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-muted" />
                  <input
                    id="add-step-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="min-h-12 w-full rounded-xl border-2 border-ink-muted bg-surface pr-3 pl-10 text-base"
                  />
                </div>
              </div>
            </div>

            {/* Une ligne qui défile horizontalement : la liste reste visible sans défiler. */}
            <div role="group" aria-label={t('addStep.filters')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [&>*]:shrink-0">
              {type === 'restaurant' && (
                <>
                  <Chip selected={Boolean(filters.open)} onChange={(v) => setFilter('open', v)}>
                    {t('addStep.filterOpen', { time })}
                  </Chip>
                  <Chip selected={Boolean(filters.vegetarian)} onChange={(v) => setFilter('vegetarian', v)}>
                    {t('addStep.filterVegetarian')}
                  </Chip>
                  <Chip selected={Boolean(filters.wheelchair)} onChange={(v) => setFilter('wheelchair', v)}>
                    {t('addStep.filterWheelchair')}
                  </Chip>
                  {cuisines.map((c) => (
                    <Chip key={c} selected={filters.cuisine === c} onChange={(v) => setFilter('cuisine', v ? c : undefined)}>
                      {c.replace(/_/g, ' ')}
                    </Chip>
                  ))}
                </>
              )}
              {DISTANCES_KM.map((km) => (
                <Chip key={km} selected={filters.maxDistanceKm === km} onChange={(v) => setFilter('maxDistanceKm', v ? km : undefined)}>
                  {t('addStep.filterWithin', { km })}
                </Chip>
              ))}
            </div>

            <p id="add-step-count" role="status" aria-live="polite" className="font-medium">
              {t('addStep.count', { count: items.length })}
            </p>

            {items.length ? (
              <ul className="space-y-3">
                {items.map((item, index) => (
                  <CandidateCard
                    key={item.place.id}
                    item={item}
                    time={time}
                    mode={trip.mode}
                    dayName={dayName}
                    cascade={{ index, animate: animateAllowed }}
                    onOpen={() => setSelected({ item, times: proposedTimes({ day, afterIndex, place: item.place, type, time, mode: trip.mode }, rules) })}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState illustration="noResults" title={t('addStep.none')} description={t('addStep.noneHint')} />
            )}

            {online ? (
              extra.nextOffset !== null && (
                <div className="space-y-2">
                  <Button variant="secondary" onClick={loadMore} disabled={extra.status === 'loading'}>
                    {extra.status === 'loading' ? t('addStep.moreLoading') : t('addStep.more')}
                  </Button>
                  {extra.status === 'error' && <p role="alert">{t('addStep.moreError')}</p>}
                </div>
              )
            ) : (
              <p className="text-ink-muted">{t('addStep.moreOffline')}</p>
            )}
            {online && extra.nextOffset === null && <p className="text-ink-muted">{t('addStep.moreEnd')}</p>}
          </m.section>
        )}
      </AnimatePresence>

      {selected && (
        <PlaceDetailsSheet
          key={selected.item.place.id}
          trip={trip}
          dayIndex={dayIndex}
          rules={rules}
          type={type}
          item={items.find((i) => i.place.id === selected.item.place.id) ?? selected.item}
          initial={selected.times}
          dayName={dayName}
          blockingError={blockingError}
          onAdd={onAdd}
          onClose={() => setSelected(null)}
        />
      )}
    </Dialog>
  );
}
