import { MapContainer } from 'react-leaflet';
import OsmTileLayer from '../components/map/OsmTileLayer.jsx';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../config/map.js';

export default function MapPage() {
  return (
    <div className="relative flex-1">
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="absolute inset-0">
        <OsmTileLayer />
      </MapContainer>
    </div>
  );
}
