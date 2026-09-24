import { MapContainer, TileLayer } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_COPYRIGHT_URL, TILE_MAX_ZOOM, TILE_URL } from '../config/map.js';

export default function MapPage() {
  const { t, i18n } = useTranslation();
  const attribution = `&copy; <a href="${TILE_COPYRIGHT_URL}">${t('map.attribution')}</a>`;

  return (
    <div className="relative flex-1">
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="absolute inset-0">
        {/* key : recrée la couche pour traduire l'attribution au changement de langue. */}
        <TileLayer key={i18n.resolvedLanguage} url={TILE_URL} attribution={attribution} maxZoom={TILE_MAX_ZOOM} />
      </MapContainer>
    </div>
  );
}
