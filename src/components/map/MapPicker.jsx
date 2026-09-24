import { CircleMarker, MapContainer, useMapEvents } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import OsmTileLayer from './OsmTileLayer.jsx';

function ClickHandler({ onPick, longPress }) {
  const pick = (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng });
  // Appui long : événement contextmenu (clic droit sur ordinateur).
  useMapEvents(longPress ? { contextmenu: pick } : { click: pick });
  return null;
}

/**
 * Choix d'un point sur la carte (toucher ou clic). Alternative visuelle à la
 * recherche d'adresse et à "Utiliser ma position", qui restent utilisables au
 * clavier et au lecteur d'écran.
 * longPress : choix par appui long (la carte reste déplaçable au toucher).
 * @param {{ center: { lat: number, lon: number }, value: { lat: number, lon: number } | null, onPick: (p: { lat: number, lon: number }) => void, longPress?: boolean, hint?: string, label?: string }} props
 */
export default function MapPicker({ center, value, onPick, longPress = false, hint, label }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <p className="text-ink-muted">{hint ?? t('tripForm.lodging.mapHint')}</p>
      <div className="relative h-72 overflow-hidden rounded-xl border border-line" role="application" aria-label={label ?? t('tripForm.lodging.mapLabel')}>
        <MapContainer center={[center.lat, center.lon]} zoom={13} tapHold={longPress} className="absolute inset-0">
          <OsmTileLayer />
          <ClickHandler onPick={onPick} longPress={longPress} />
          {value && <CircleMarker center={[value.lat, value.lon]} radius={10} pathOptions={{ color: '#047857', fillOpacity: 0.6 }} />}
        </MapContainer>
      </div>
    </div>
  );
}
