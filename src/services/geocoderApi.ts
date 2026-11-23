import { GeoLocation } from '../types/charging';

export interface GeocodedPlace {
  label: string;
  city: string;
  postcode: string;
  context: string;
  lat: number;
  lon: number;
}

export const QUICK_CITIES: GeoLocation[] = [
  { lat: 45.764043, lon: 4.835659, label: 'Lyon', source: 'city' },
  { lat: 48.856614, lon: 2.352222, label: 'Paris', source: 'city' },
  { lat: 43.296482, lon: 5.36978, label: 'Marseille', source: 'city' },
  { lat: 44.837789, lon: -0.57918, label: 'Bordeaux', source: 'city' },
  { lat: 43.604652, lon: 1.444209, label: 'Toulouse', source: 'city' },
  { lat: 47.218371, lon: -1.553621, label: 'Nantes', source: 'city' },
  { lat: 50.62925, lon: 3.057256, label: 'Lille', source: 'city' },
  { lat: 48.117266, lon: -1.677793, label: 'Rennes', source: 'city' },
  { lat: 48.573405, lon: 7.752111, label: 'Strasbourg', source: 'city' },
];

interface GeoPfFeature {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    label?: string;
    city?: string;
    postcode?: string;
    context?: string;
  };
}

export async function searchFrenchPlaces(
  query: string,
  signal?: AbortSignal
): Promise<GeocodedPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(trimmed)}&limit=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Erreur géocodage (${res.status})`);
  }
  const data = (await res.json()) as { features?: GeoPfFeature[] };
  if (!Array.isArray(data.features)) return [];

  return data.features
    .filter(
      (f) =>
        Array.isArray(f.geometry?.coordinates) &&
        f.geometry!.coordinates!.length >= 2 &&
        typeof f.properties?.label === 'string'
    )
    .map((f) => {
      const [lon, lat] = f.geometry!.coordinates!;
      const props = f.properties!;
      return {
        label: props.label || 'Lieu',
        city: props.city || props.label || '',
        postcode: props.postcode || '',
        context: props.context || '',
        lat,
        lon,
      };
    });
}

export async function reverseGeocodeFrenchPlace(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const url = `https://data.geopf.fr/geocodage/reverse?lon=${lon.toFixed(6)}&lat=${lat.toFixed(6)}&limit=1`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: GeoPfFeature[] };
    const first = Array.isArray(data.features) ? data.features[0] : undefined;
    const props = first?.properties;
    return props?.city || props?.label || null;
  } catch {
    return null;
  }
}
