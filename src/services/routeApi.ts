import { DrivingRoute, GeoLocation } from '../types/charging';
import { haversineKm } from './irveApi';

export function simplifyPolyline(
  coordsLatLon: [number, number][],
  maxPoints = 160
): [number, number][] {
  if (coordsLatLon.length <= maxPoints) return coordsLatLon;
  const result: [number, number][] = [coordsLatLon[0]];
  const step = (coordsLatLon.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(coordsLatLon[Math.round(i * step)]);
  }
  result.push(coordsLatLon[coordsLatLon.length - 1]);
  return result;
}

export async function fetchDrivingRoute(
  start: GeoLocation,
  end: GeoLocation,
  signal?: AbortSignal
): Promise<DrivingRoute> {
  // Primary: IGN Géoplateforme bdtopo-osrm (CORS: *, zero API key)
  try {
    const ignUrl =
      `https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm` +
      `&start=${start.lon.toFixed(6)},${start.lat.toFixed(6)}` +
      `&end=${end.lon.toFixed(6)},${end.lat.toFixed(6)}` +
      `&profile=car&optimization=fastest&geometryFormat=geojson`;
    const res = await fetch(ignUrl, { signal });
    if (res.ok) {
      const data = (await res.json()) as {
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: [number, number][] };
      };
      const rawCoords = data.geometry?.coordinates;
      if (Array.isArray(rawCoords) && rawCoords.length >= 2) {
        const latLon: [number, number][] = rawCoords.map(([lon, lat]) => [lat, lon]);
        return {
          start,
          end,
          distanceKm: Math.round(((data.distance || 0) / 1000) * 10) / 10,
          durationMin: Math.max(1, Math.round((data.duration || 0) / 60)),
          polyline: simplifyPolyline(latLon, 180),
        };
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // Fallback to OSRM below
  }

  // Fallback: public OSRM driving router
  const osrmUrl =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${start.lon.toFixed(6)},${start.lat.toFixed(6)};${end.lon.toFixed(6)},${end.lat.toFixed(6)}` +
    `?overview=simplified&geometries=geojson`;
  const osrmRes = await fetch(osrmUrl, { signal });
  if (!osrmRes.ok) {
    throw new Error(`Impossible de calculer l'itinéraire (${osrmRes.status})`);
  }
  const osrmJson = (await osrmRes.json()) as {
    routes?: Array<{
      distance?: number;
      duration?: number;
      geometry?: { coordinates?: [number, number][] };
    }>;
  };
  const route = osrmJson.routes?.[0];
  const rawCoords = route?.geometry?.coordinates;
  if (!route || !Array.isArray(rawCoords) || rawCoords.length < 2) {
    throw new Error('Aucun itinéraire routier trouvé entre ces deux points.');
  }

  const latLon: [number, number][] = rawCoords.map(([lon, lat]) => [lat, lon]);
  return {
    start,
    end,
    distanceKm: Math.round(((route.distance || 0) / 1000) * 10) / 10,
    durationMin: Math.max(1, Math.round((route.duration || 0) / 60)),
    polyline: simplifyPolyline(latLon, 180),
  };
}

export function projectStationOntoRoute(
  lat: number,
  lon: number,
  polyline: [number, number][]
): { detourKm: number; alongRouteKm: number } {
  if (polyline.length === 0) return { detourKm: 999, alongRouteKm: 0 };
  if (polyline.length === 1) {
    return {
      detourKm: haversineKm(lat, lon, polyline[0][0], polyline[0][1]),
      alongRouteKm: 0,
    };
  }

  let bestDetourKm = Infinity;
  let bestAlongKm = 0;
  let cumulativeKm = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const [aLat, aLon] = polyline[i];
    const [bLat, bLon] = polyline[i + 1];
    const midLatRad = (((aLat + bLat) / 2) * Math.PI) / 180;
    const kx = 111.32 * Math.max(0.2, Math.cos(midLatRad));
    const ky = 111.32;

    const ax = aLon * kx;
    const ay = aLat * ky;
    const bx = bLon * kx;
    const by = bLat * ky;
    const px = lon * kx;
    const py = lat * ky;

    const dx = bx - ax;
    const dy = by - ay;
    const segLenSq = dx * dx + dy * dy;
    const segLenKm = Math.sqrt(segLenSq);

    let t = 0;
    if (segLenSq > 0) {
      t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / segLenSq));
    }

    const projX = ax + t * dx;
    const projY = ay + t * dy;
    const distKm = Math.hypot(px - projX, py - projY);

    if (distKm < bestDetourKm) {
      bestDetourKm = distKm;
      bestAlongKm = cumulativeKm + t * segLenKm;
    }

    cumulativeKm += segLenKm;
  }

  return {
    detourKm: Math.round(bestDetourKm * 10) / 10,
    alongRouteKm: Math.round(bestAlongKm),
  };
}

export function sampleRouteQueryCenters(
  polyline: [number, number][],
  spacingKm = 36,
  maxCenters = 10
): { lat: number; lon: number; radiusKm: number }[] {
  if (polyline.length === 0) return [];
  if (polyline.length === 1) {
    return [{ lat: polyline[0][0], lon: polyline[0][1], radiusKm: 25 }];
  }

  // Compute total polyline length first to adapt spacing for very long routes
  let totalKm = 0;
  const segLengths: number[] = [];
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = haversineKm(
      polyline[i][0],
      polyline[i][1],
      polyline[i + 1][0],
      polyline[i + 1][1]
    );
    segLengths.push(d);
    totalKm += d;
  }

  const effectiveSpacing =
    totalKm > spacingKm * (maxCenters - 1)
      ? totalKm / Math.max(1, maxCenters - 1)
      : spacingKm;
  const queryRadiusKm = Math.min(45, Math.max(22, Math.ceil(effectiveSpacing * 0.72)));

  const centers: { lat: number; lon: number; radiusKm: number }[] = [
    { lat: polyline[0][0], lon: polyline[0][1], radiusKm: queryRadiusKm },
  ];

  let distSinceLast = 0;
  for (let i = 0; i < segLengths.length; i++) {
    distSinceLast += segLengths[i];
    if (distSinceLast >= effectiveSpacing && centers.length < maxCenters - 1) {
      centers.push({
        lat: polyline[i + 1][0],
        lon: polyline[i + 1][1],
        radiusKm: queryRadiusKm,
      });
      distSinceLast = 0;
    }
  }

  const lastPt = polyline[polyline.length - 1];
  const prevCenter = centers[centers.length - 1];
  if (
    haversineKm(prevCenter.lat, prevCenter.lon, lastPt[0], lastPt[1]) > 4 &&
    centers.length < maxCenters
  ) {
    centers.push({ lat: lastPt[0], lon: lastPt[1], radiusKm: queryRadiusKm });
  }

  return centers;
}
