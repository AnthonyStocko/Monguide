import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import OsmTileLayer from '../components/map/OsmTileLayer.jsx';
import { lodgingIcon, placeIcon } from '../components/map/markerIcon.js';
import { CATEGORY_GROUPS, GROUP_COLORS } from '../components/planning/categories.js';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../config/map.js';
import { useCurrentTrip } from '../hooks/useCurrentTrip.js';
import { useFormat } from '../i18n/useFormat.js';

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

export default function MapPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const { status, trip } = useCurrentTrip();
  const [dayIndex, setDayIndex] = useState(0);
  const day = trip?.days[Math.min(dayIndex, trip.days.length - 1)];

  const { stops, start, end } = useMemo(() => {
    if (!day) return { stops: [], start: null, end: null };
    const lodging = (id) => trip.lodgings.find((l) => l.id === id) ?? null;
    return { stops: day.steps.filter((s) => s.place), start: lodging(day.startLodgingId), end: lodging(day.endLodgingId) };
  }, [trip, day]);

  // Ordre de visite : hébergement de départ, étapes, hébergement d'arrivée (lignes droites).
  const line = [...(start ? [start] : []), ...stops.map((s) => s.place), ...(end ? [end] : [])].map((p) => [p.lat, p.lon]);
  const points = line.length ? line : trip ? [[trip.destination.lat, trip.destination.lon]] : [];

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
                className={`min-h-12 shrink-0 rounded-xl px-4 font-semibold first-letter:uppercase ${i === dayIndex ? 'bg-primary-strong text-white' : 'bg-subtle text-ink'}`}
              >
                {format.date(`${d.date}T12:00:00Z`, { weekday: 'short', day: 'numeric', timeZone: 'UTC' })}
              </button>
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t('map.legendTitle')}>
            {['culture', 'food', 'nature', 'heritage', 'lodging'].map((g) => (
              <li key={g} className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block size-4 rounded-full" style={{ background: GROUP_COLORS[g] }} />
                {t(`map.groups.${g}`)}
              </li>
            ))}
          </ul>
          <p className="text-ink-muted">{t('map.orderNotice')}</p>
        </div>
      )}
      {/* Hauteur explicite : sans elle, la carte peut rester vide dans la WebView Android. */}
      <div className="relative min-h-[400px] flex-1">
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="absolute inset-0">
          <OsmTileLayer />
          {points.length > 0 && <FitToPoints points={points} />}
          {line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#0f172a', weight: 3, dashArray: '6 8' }} />}
          {start && (
            <Marker position={[start.lat, start.lon]} icon={lodgingIcon()} title={t('map.lodging')}>
              <Popup>{start.name ?? start.address}</Popup>
            </Marker>
          )}
          {end && end.id !== start?.id && (
            <Marker position={[end.lat, end.lon]} icon={lodgingIcon()} title={t('map.lodging')}>
              <Popup>{end.name ?? end.address}</Popup>
            </Marker>
          )}
          {stops.map((s, i) => (
            <Marker key={s.id} position={[s.place.lat, s.place.lon]} icon={placeIcon(s.place.category, i + 1)} title={s.place.name}>
              <Popup>
                <strong>
                  {i + 1}. {s.place.name}
                </strong>
                <br />
                {s.start} – {s.end} · {t(`map.groups.${CATEGORY_GROUPS[s.place.category]}`)}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
