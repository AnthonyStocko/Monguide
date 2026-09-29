import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { CirclePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import OsmTileLayer from '../components/map/OsmTileLayer.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import PlaceSheet from '../components/map/PlaceSheet.jsx';
import { lodgingIcon, placeIcon } from '../components/map/markerIcon.js';
import { GROUP_COLORS } from '../components/planning/categories.js';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../config/map.js';
import { useCurrentTrip } from '../hooks/useCurrentTrip.js';
import { useFormat } from '../i18n/useFormat.js';
import { usePlaceName } from '../i18n/usePlaceName.js';
import { DURATION, MAX_ANIMATED, useFirstShow, useMotionAllowed } from '../ui/motion.js';

/**
 * Recadre la carte sur les points du jour et appelle invalidateSize : la
 * carte vit dans un onglet et doit être recalculée quand il devient visible
 * (sinon elle reste grise ou mal cadrée).
 */
function FitToPoints({ points }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join(';');
  useEffect(() => {
    const refresh = () => {
      map.invalidateSize();
      if (points.length > 1) map.fitBounds(points, { padding: [48, 48], maxZoom: 16 });
      else if (points.length === 1) map.setView(points[0], 15);
    };
    const timer = setTimeout(refresh, 0);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener('resize', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/**
 * Tracé du jour (lignes droites, pointillés). Au premier affichage de la
 * journée, il se dessine (stroke-dashoffset animé par l'API Web Animations,
 * un seul chemin SVG), puis reprend ses pointillés.
 */
function DayRoute({ positions, animate }) {
  const ref = useRef(null);
  const key = positions.map((p) => p.join(',')).join(';');
  useEffect(() => {
    if (!animate) return undefined;
    let animation;
    // Après le recadrage (FitToPoints) : longueur du tracé à l'échelle affichée.
    const timer = setTimeout(() => {
      const path = ref.current?.getElement?.();
      if (!path?.getTotalLength) return;
      const length = path.getTotalLength();
      path.style.strokeDasharray = `${length}`;
      animation = path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
        duration: DURATION.emphasis * 1000,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
        fill: 'backwards'
      });
      const restore = () => {
        path.style.strokeDasharray = '';
      };
      animation.onfinish = restore;
      animation.oncancel = restore;
    }, 80);
    return () => {
      clearTimeout(timer);
      animation?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, key]);
  return <Polyline ref={ref} positions={positions} pathOptions={{ color: '#0f172a', weight: 3, dashArray: '6 8' }} />;
}

export default function MapPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const { placeName } = usePlaceName();
  const { status, trip } = useCurrentTrip();
  const [dayIndex, setDayIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();
  const day = trip?.days[Math.min(dayIndex, trip.days.length - 1)];

  const { stops, start, end } = useMemo(() => {
    if (!day) return { stops: [], start: null, end: null };
    const lodging = (id) => trip.lodgings.find((l) => l.id === id) ?? null;
    return { stops: day.steps.filter((s) => s.place), start: lodging(day.startLodgingId), end: lodging(day.endLodgingId) };
  }, [trip, day]);

  // Ordre de visite : hébergement de départ, étapes, hébergement d'arrivée (lignes droites).
  const line = [...(start ? [start] : []), ...stops.map((s) => s.place), ...(end ? [end] : [])].map((p) => [p.lat, p.lon]);
  const points = line.length ? line : trip ? [[trip.destination.lat, trip.destination.lon]] : [];

  // Premier affichage de cette journée : marqueurs qui tombent, tracé qui se dessine (jamais en revenant sur l'onglet).
  const allowed = useMotionAllowed();
  const firstShow = useFirstShow(trip && day ? `map:${trip.id}:${day.date}` : 'map:none');
  const animateDay = allowed && firstShow && status === 'ready';
  // Icônes recréées seulement si les étapes changent : sinon Leaflet remplacerait les marqueurs (et les ferait retomber).
  const signature = stops.map((s) => `${s.id}:${s.place.category}`).join('|');
  const offset = start ? 1 : 0;
  const icons = useMemo(
    () => stops.map((s, i) => placeIcon(s.place.category, i + 1, animateDay && i + offset < MAX_ANIMATED ? i + offset : null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature, animateDay, offset]
  );
  const homeIcon = useMemo(() => lodgingIcon(animateDay ? 0 : null), [animateDay]);

  return (
    <div className="flex flex-1 flex-col">
      {status === 'ready' && trip.days.length > 0 && (
        <div className="space-y-2 border-b border-line bg-surface p-3">
          <div role="group" aria-label={t('map.chooseDay')} className="flex gap-2 overflow-x-auto">
            {trip.days.map((d, i) => (
              <button
                key={d.date}
                type="button"
                aria-pressed={i === dayIndex}
                onClick={() => setDayIndex(i)}
                className={`min-h-12 min-w-24 flex-1 shrink-0 rounded-xl border px-4 font-semibold first-letter:uppercase ${i === dayIndex ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:bg-subtle'}`}
              >
                {format.date(`${d.date}T12:00:00Z`, { weekday: 'short', day: 'numeric', timeZone: 'UTC' })}
              </button>
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t('map.legendTitle')}>
            {['culture', 'food', 'nature', 'heritage', 'personal', 'lodging'].map((g) => (
              <li key={g} className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block size-4 rounded-full" style={{ background: GROUP_COLORS[g] }} />
                {t(`map.groups.${g}`)}
              </li>
            ))}
          </ul>
          <p className="text-ink-muted">{t('map.orderNotice')}</p>
        </div>
      )}
      {status === 'empty' && (
        <div className="border-b border-line bg-surface">
          <EmptyState
            illustration="noTrips"
            title={t('map.emptyTitle')}
            description={t('map.emptyText')}
            action={
              <Button icon={CirclePlus} onClick={() => navigate('/create')}>
                {t('home.createCta')}
              </Button>
            }
          />
        </div>
      )}
      {/* Hauteur explicite : sans elle, la carte peut rester vide dans la WebView Android. */}
      <div className="relative min-h-[400px] flex-1">
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="absolute inset-0">
          <OsmTileLayer />
          {points.length > 0 && <FitToPoints points={points} />}
          {line.length > 1 && <DayRoute positions={line} animate={animateDay} />}
          {start && (
            <Marker position={[start.lat, start.lon]} icon={homeIcon} title={t('map.lodging')}>
              <Popup>{start.name ?? start.address}</Popup>
            </Marker>
          )}
          {end && end.id !== start?.id && (
            <Marker position={[end.lat, end.lon]} icon={homeIcon} title={t('map.lodging')}>
              <Popup>{end.name ?? end.address}</Popup>
            </Marker>
          )}
          {stops.map((s, i) => (
            <Marker
              key={s.id}
              position={[s.place.lat, s.place.lon]}
              icon={icons[i]}
              title={t('map.markerLabel', { order: i + 1, name: placeName(s.place) })}
              eventHandlers={{ click: () => setSelected({ step: s, order: i + 1 }) }}
            />
          ))}
        </MapContainer>
      </div>
      {selected && day && <PlaceSheet step={selected.step} order={selected.order} date={day.date} onClose={() => setSelected(null)} />}
    </div>
  );
}
