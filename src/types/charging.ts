export type ConnectorType = 'CCS' | 'Type 2' | 'CHAdeMO' | 'EF';

export type PriceSource =
  | 'user'
  | 'subscription'
  | 'ocpi'
  | 'irve'
  | 'network'
  | 'unknown';

export type PriceTier = 'free' | 'cheap' | 'good' | 'medium' | 'expensive' | 'unknown';

export type PowerMode = 'ccs50' | 'ccs150' | 'ac' | 'all';

export type SortBy = 'price' | 'total_cost' | 'distance' | 'power' | 'route_order';

export type AvailabilityStatus = 'available' | 'occupied' | 'out_of_service' | 'unknown';

export interface PdcDynamicStatus {
  idPdc: string;
  etatPdc: string;
  occupationPdc: string;
  horodatage: string | null;
  classified: AvailabilityStatus;
}

export interface StationAvailability {
  status: AvailabilityStatus;
  availableCount: number;
  occupiedCount: number;
  outOfServiceCount: number;
  knownCount: number;
  totalCount: number;
  latestTimestamp: string | null;
}

export interface RawIrveRecord {
  id_station_itinerance?: string | null;
  id_station_local?: string | null;
  id_pdc_itinerance?: string | null;
  nom_station?: string | null;
  nom_operateur?: string | null;
  nom_enseigne?: string | null;
  adresse_station?: string | null;
  consolidated_commune?: string | null;
  consolidated_code_postal?: string | number | null;
  consolidated_latitude?: number | null;
  consolidated_longitude?: number | null;
  puissance_nominale?: number | null;
  tarification?: string | null;
  gratuit?: string | boolean | null;
  paiement_cb?: string | boolean | null;
  paiement_acte?: string | boolean | null;
  prise_type_combo_ccs?: string | boolean | null;
  prise_type_2?: string | boolean | null;
  prise_type_chademo?: string | boolean | null;
  prise_type_ef?: string | boolean | null;
  horaires?: string | null;
  condition_acces?: string | null;
  date_maj?: string | null;
}

export interface ResolvedPrice {
  pricePerKwh: number | null;
  pricePerMin: number | null;
  fixedFeeEur: number | null;
  source: PriceSource;
  sourceLabel: string;
  tier: PriceTier;
  detailNote?: string;
  rawTariff?: string | null;
  tariffUrl?: string | null;
  subscriptionPlanId?: string;
  subscriptionMonthlyEur?: number;
  subscriptionMonthlyLabel?: string;
  publicPricePerKwh?: number | null;
}

export interface PowerPriceTier {
  powerKw: number;
  pointCount: number;
  connectors: ConnectorType[];
  resolvedPrice: ResolvedPrice;
}

export interface ChargingStation {
  id: string;
  name: string;
  brand: string;
  operator: string;
  address: string;
  city: string;
  lat: number;
  lon: number;
  distanceKm: number;
  pointCount: number;
  maxPowerKw: number;
  minPowerKw: number;
  connectors: ConnectorType[];
  hasCcs: boolean;
  hasType2: boolean;
  hasChademo: boolean;
  paymentCb: boolean;
  paymentActe: boolean;
  isFree: boolean;
  is247: boolean;
  horaires: string;
  conditionAcces: string;
  dateMaj: string | null;
  rawTariff: string | null;
  tariffUrl: string | null;
  pdcIds: string[];
  tiers: PowerPriceTier[];
  resolvedPrice: ResolvedPrice;
  availability?: StationAvailability;
  routeDetourKm?: number;
  alongRouteKm?: number;
}

export interface OcpiTariffEvaluation {
  currentPricePerKwh: number;
  minPricePerKwh: number | null;
  maxPricePerKwh: number | null;
  flatFeeEur: number | null;
  hasTimeOfDay: boolean;
  partyId: string;
  tariffUrl?: string | null;
  updatedAt?: string | null;
}

export interface DrivingRoute {
  start: GeoLocation;
  end: GeoLocation;
  distanceKm: number;
  durationMin: number;
  polyline: [number, number][];
}

export interface SearchFilters {
  powerMode: PowerMode;
  radiusKm: number;
  maxPricePerKwh: number | null;
  cbOnly: boolean;
  knownPriceOnly: boolean;
  availableOnly: boolean;
  publicOnly: boolean;
  sortBy: SortBy;
}

export interface VehicleProfile {
  name: string;
  batteryKwh: number;
  maxDcKw: number;
  consumptionKwhPer100: number;
  startSoc: number;
  targetSoc: number;
  homeTariffPerKwh: number;
}

export interface UserPriceOverride {
  stationId: string;
  stationName: string;
  pricePerKwh: number;
  note?: string;
  updatedAt: string;
}

export interface FavoriteStation {
  id: string;
  name: string;
  brand: string;
  operator: string;
  address: string;
  city: string;
  lat: number;
  lon: number;
  maxPowerKw: number;
  connectors: ConnectorType[];
  lastKnownPricePerKwh: number | null;
  lastKnownSource?: PriceSource;
  savedAt: string;
}

export interface ChargeLogEntry {
  id: string;
  date: string;
  stationId?: string;
  stationName: string;
  operator: string;
  kwh: number;
  totalEur: number;
  pricePerKwh: number;
  powerKw?: number;
  notes?: string;
}

export interface GeoLocation {
  lat: number;
  lon: number;
  label: string;
  source?: 'gps' | 'search' | 'city' | 'map';
}
