import { describe, expect, it } from 'vitest';
import { clusterStationsByGrid } from './mapCluster';
import { ChargingStation } from '../types/charging';

function makeStation(id: string, lat: number, lon: number, price: number | null): ChargingStation {
  return {
    id,
    name: `Station ${id}`,
    brand: 'Test',
    operator: 'Test',
    address: '',
    city: 'Lyon',
    lat,
    lon,
    distanceKm: 1,
    pointCount: 2,
    maxPowerKw: 150,
    minPowerKw: 150,
    connectors: ['CCS'],
    hasCcs: true,
    hasType2: false,
    hasChademo: false,
    paymentCb: true,
    paymentActe: true,
    isFree: price === 0,
    is247: true,
    horaires: '24/7',
    conditionAcces: 'Accès libre',
    dateMaj: null,
    rawTariff: null,
    tariffUrl: null,
    pdcIds: [],
    tiers: [],
    resolvedPrice: {
      pricePerKwh: price,
      pricePerMin: null,
      fixedFeeEur: null,
      source: price === null ? 'unknown' : 'network',
      sourceLabel: 'Test',
      tier: price === null ? 'unknown' : price <= 0.35 ? 'cheap' : 'medium',
    },
  };
}

describe('clusterStationsByGrid', () => {
  it('clusters nearby dense stations at zoom < 13 and reports minimum price', () => {
    const stations: ChargingStation[] = [];
    for (let i = 0; i < 30; i++) {
      // Cluster 25 stations very close together in central Lyon, and 5 further out
      const lat = i < 25 ? 45.764 + i * 0.0001 : 45.85 + i * 0.01;
      const lon = i < 25 ? 4.835 + i * 0.0001 : 4.95 + i * 0.01;
      const price = i === 3 ? 0.25 : 0.49;
      stations.push(makeStation(`S${i}`, lat, lon, price));
    }

    const items = clusterStationsByGrid(stations, 11, 0.25, null, 58);
    const clusters = items.filter((item) => item.type === 'cluster');
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    const cheapestCluster = clusters.find((c) => c.isCheapest);
    expect(cheapestCluster).toBeDefined();
    expect(cheapestCluster?.minPrice).toBe(0.25);
    expect(cheapestCluster?.count).toBeGreaterThanOrEqual(2);
  });

  it('does not cluster at zoom >= 13', () => {
    const stations = Array.from({ length: 30 }, (_, i) =>
      makeStation(`S${i}`, 45.764 + i * 0.0001, 4.835, 0.39)
    );
    const items = clusterStationsByGrid(stations, 13, 0.39);
    expect(items.every((item) => item.type === 'station')).toBe(true);
    expect(items.length).toBe(30);
  });
});
