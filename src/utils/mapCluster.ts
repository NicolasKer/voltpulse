import { ChargingStation, PriceTier } from '../types/charging';
import { getPriceTier } from './tariffParser';

export interface StationClusterItem {
  type: 'station';
  station: ChargingStation;
}

export interface ClusterGroupItem {
  type: 'cluster';
  id: string;
  lat: number;
  lon: number;
  count: number;
  stations: ChargingStation[];
  minPrice: number | null;
  minPriceTier: PriceTier;
  hasAvailable: boolean;
  isCheapest: boolean;
}

export type MapRenderItem = StationClusterItem | ClusterGroupItem;

function projectLatLonToWorldPx(
  lat: number,
  lon: number,
  zoom: number
): { x: number; y: number } {
  const worldSize = 256 * Math.pow(2, zoom);
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const x = ((lon + 180) / 360) * worldSize;
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
  return { x, y };
}

export function clusterStationsByGrid(
  stations: ChargingStation[],
  zoom: number,
  cheapestPrice: number | null,
  selectedStationId: string | null = null,
  cellPx = 58
): MapRenderItem[] {
  if (zoom >= 13 || stations.length <= 24) {
    return stations.map((station) => ({ type: 'station', station }));
  }

  const buckets = new Map<string, ChargingStation[]>();
  const items: MapRenderItem[] = [];

  for (const st of stations) {
    if (selectedStationId && st.id === selectedStationId) {
      items.push({ type: 'station', station: st });
      continue;
    }
    const { x, y } = projectLatLonToWorldPx(st.lat, st.lon, zoom);
    const cellKey = `${Math.floor(x / cellPx)}_${Math.floor(y / cellPx)}`;
    const list = buckets.get(cellKey);
    if (list) {
      list.push(st);
    } else {
      buckets.set(cellKey, [st]);
    }
  }

  for (const [cellKey, group] of buckets.entries()) {
    if (group.length === 1) {
      items.push({ type: 'station', station: group[0] });
      continue;
    }

    const latSum = group.reduce((s, st) => s + st.lat, 0);
    const lonSum = group.reduce((s, st) => s + st.lon, 0);
    const knownPrices = group
      .map((st) => st.resolvedPrice.pricePerKwh)
      .filter((p): p is number => p !== null);
    const minPrice = knownPrices.length > 0 ? Math.min(...knownPrices) : null;
    const hasAvailable = group.some((st) => st.availability?.status === 'available');
    const isCheapest =
      cheapestPrice !== null &&
      minPrice !== null &&
      Math.abs(minPrice - cheapestPrice) < 0.001;

    items.push({
      type: 'cluster',
      id: `cluster_${zoom}_${cellKey}`,
      lat: latSum / group.length,
      lon: lonSum / group.length,
      count: group.length,
      stations: group,
      minPrice,
      minPriceTier: getPriceTier(minPrice, minPrice === 0),
      hasAvailable,
      isCheapest,
    });
  }

  return items;
}
