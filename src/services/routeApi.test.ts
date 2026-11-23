import { describe, expect, it } from 'vitest';
import { projectStationOntoRoute, sampleRouteQueryCenters } from './routeApi';

describe('projectStationOntoRoute', () => {
  const polyline: [number, number][] = [
    [48.1173, -1.6778], // Rennes
    [47.65, -1.62],     // Midpoint
    [47.2184, -1.5536], // Nantes
  ];

  it('computes small detourKm when a station sits close to the corridor', () => {
    // Near midpoint ~47.65, -1.61 (~0.75 km off route)
    const proj = projectStationOntoRoute(47.65, -1.61, polyline);
    expect(proj.detourKm).toBeLessThan(1.5);
    expect(proj.alongRouteKm).toBeGreaterThan(45);
    expect(proj.alongRouteKm).toBeLessThan(60);
  });

  it('computes larger detourKm when a station is far from the route', () => {
    // 25+ km east of midpoint
    const proj = projectStationOntoRoute(47.65, -1.25, polyline);
    expect(proj.detourKm).toBeGreaterThan(20);
  });
});

describe('sampleRouteQueryCenters', () => {
  it('samples route endpoints and intermediate points without exceeding maxCenters', () => {
    const line: [number, number][] = [
      [48.1173, -1.6778],
      [48.3, 0.2],
      [48.8566, 2.3522],
    ];
    const centers = sampleRouteQueryCenters(line, 36, 10);
    expect(centers.length).toBeGreaterThanOrEqual(2);
    expect(centers.length).toBeLessThanOrEqual(10);
    expect(centers[0].lat).toBeCloseTo(48.1173, 3);
    expect(centers[centers.length - 1].lat).toBeCloseTo(48.8566, 3);
  });
});
