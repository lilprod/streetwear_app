import { useEffect, useRef } from 'react';
import { colors } from '@streetwear/ui-tokens';
import 'leaflet/dist/leaflet.css';
import { fr } from '../../i18n/fr';
import { toLeafletRings } from '../../lib/geojson';
import type { GeoPolygon } from '../../lib/logistics-api';

const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const LOME: [number, number] = [6.1725, 1.2314];

export function ZoneMap({ polygon }: { polygon: GeoPolygon | null }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: () => void = () => undefined;
    void import('leaflet').then((mod) => {
      const L = mod.default ?? mod;
      if (disposed || !el.current) return;
      const map = L.map(el.current, { center: LOME, zoom: 11, attributionControl: true });
      L.tileLayer(OSM_TILES, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
      if (polygon) {
        const layer = L.polygon(toLeafletRings(polygon), {
          color: colors.ink,
          weight: 2,
          fillOpacity: 0.15,
        }).addTo(map);
        map.fitBounds(layer.getBounds(), { padding: [16, 16] });
      }
      cleanup = () => {
        map.remove();
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [polygon]);

  return (
    <div
      ref={el}
      role="img"
      aria-label={fr['zones.map.label']}
      data-testid="zone-map"
      className="h-64 w-full overflow-hidden rounded-admin-lg border border-border"
    />
  );
}
