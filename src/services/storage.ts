import { DEFAULT_VEHICLE_PROFILE } from '../data/networkTariffs';
import {
  ChargeLogEntry,
  FavoriteStation,
  GeoLocation,
  SearchFilters,
  UserPriceOverride,
  VehicleProfile,
} from '../types/charging';

const KEYS = {
  vehicle: 'voltpulse_v1_vehicle',
  overrides: 'voltpulse_v1_overrides',
  favorites: 'voltpulse_v1_favorites',
  logs: 'voltpulse_v1_logs',
  location: 'voltpulse_v1_location',
  filters: 'voltpulse_v1_filters',
  subscriptions: 'voltpulse_v1_subscriptions',
};

export const DEFAULT_LOCATION: GeoLocation = {
  lat: 45.764043,
  lon: 4.835659,
  label: 'Lyon',
};

export const DEFAULT_FILTERS: SearchFilters = {
  powerMode: 'ccs50',
  radiusKm: 15,
  maxPricePerKwh: null,
  cbOnly: false,
  knownPriceOnly: false,
  availableOnly: false,
  publicOnly: true,
  sortBy: 'price',
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore private browsing / quota failures
  }
}

export function loadVehicleProfile(): VehicleProfile {
  const saved = readJson<Partial<VehicleProfile> | null>(KEYS.vehicle, null);
  return { ...DEFAULT_VEHICLE_PROFILE, ...(saved || {}) };
}

export function saveVehicleProfile(profile: VehicleProfile): void {
  writeJson(KEYS.vehicle, profile);
}

export function loadPriceOverrides(): Record<string, UserPriceOverride> {
  return readJson<Record<string, UserPriceOverride>>(KEYS.overrides, {});
}

export function savePriceOverrides(overrides: Record<string, UserPriceOverride>): void {
  writeJson(KEYS.overrides, overrides);
}

export function loadFavorites(): FavoriteStation[] {
  const list = readJson<FavoriteStation[]>(KEYS.favorites, []);
  return Array.isArray(list) ? list : [];
}

export function saveFavorites(favorites: FavoriteStation[]): void {
  writeJson(KEYS.favorites, favorites);
}

export function loadChargeLogs(): ChargeLogEntry[] {
  const list = readJson<ChargeLogEntry[]>(KEYS.logs, []);
  return Array.isArray(list) ? list : [];
}

export function saveChargeLogs(logs: ChargeLogEntry[]): void {
  writeJson(KEYS.logs, logs);
}

export function hasSavedLocation(): boolean {
  try {
    return Boolean(localStorage.getItem(KEYS.location));
  } catch {
    return false;
  }
}

export function loadLastLocation(): GeoLocation {
  const saved = readJson<Partial<GeoLocation> | null>(KEYS.location, null);
  if (
    saved &&
    typeof saved.lat === 'number' &&
    typeof saved.lon === 'number' &&
    typeof saved.label === 'string'
  ) {
    return saved as GeoLocation;
  }
  return DEFAULT_LOCATION;
}

export function saveLastLocation(loc: GeoLocation): void {
  writeJson(KEYS.location, loc);
}

export function loadSearchFilters(): SearchFilters {
  const saved = readJson<Partial<SearchFilters> | null>(KEYS.filters, null);
  return { ...DEFAULT_FILTERS, ...(saved || {}) };
}

export function saveSearchFilters(filters: SearchFilters): void {
  writeJson(KEYS.filters, filters);
}

export function loadActiveSubscriptions(): string[] {
  const list = readJson<string[]>(KEYS.subscriptions, []);
  return Array.isArray(list) ? list : [];
}

export function saveActiveSubscriptions(ids: string[]): void {
  writeJson(KEYS.subscriptions, ids);
}

export interface VoltPulseBackup {
  version: 1;
  exportedAt: string;
  vehicle: VehicleProfile;
  overrides: Record<string, UserPriceOverride>;
  favorites: FavoriteStation[];
  logs: ChargeLogEntry[];
  subscriptions?: string[];
}

export function exportAllDataJson(): string {
  const payload: VoltPulseBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    vehicle: loadVehicleProfile(),
    overrides: loadPriceOverrides(),
    favorites: loadFavorites(),
    logs: loadChargeLogs(),
    subscriptions: loadActiveSubscriptions(),
  };
  return JSON.stringify(payload, null, 2);
}

export function importAllDataJson(jsonStr: string): VoltPulseBackup {
  const parsed = JSON.parse(jsonStr) as Partial<VoltPulseBackup>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Fichier JSON invalide.');
  }
  const vehicle = { ...DEFAULT_VEHICLE_PROFILE, ...(parsed.vehicle || {}) };
  const overrides =
    parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {};
  const favorites = Array.isArray(parsed.favorites) ? parsed.favorites : [];
  const logs = Array.isArray(parsed.logs) ? parsed.logs : [];
  const subscriptions = Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [];

  saveVehicleProfile(vehicle);
  savePriceOverrides(overrides);
  saveFavorites(favorites);
  saveChargeLogs(logs);
  saveActiveSubscriptions(subscriptions);

  return {
    version: 1,
    exportedAt: parsed.exportedAt || new Date().toISOString(),
    vehicle,
    overrides,
    favorites,
    logs,
    subscriptions,
  };
}

export function resetAllLocalData(): void {
  Object.values(KEYS).forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // Ignore
    }
  });
}
