import { TileLayer } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import { TILE_COPYRIGHT_URL, TILE_MAX_ZOOM, TILE_URL } from '../../config/map.js';

/** Fond de carte, avec l'attribution traduite (recréé au changement de langue). */
export default function OsmTileLayer() {
  const { t, i18n } = useTranslation();
  const attribution = `&copy; <a href="${TILE_COPYRIGHT_URL}">${t('map.attribution')}</a>`;
  return <TileLayer key={i18n.resolvedLanguage} url={TILE_URL} attribution={attribution} maxZoom={TILE_MAX_ZOOM} />;
}
