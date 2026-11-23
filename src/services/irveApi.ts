import {
  ChargingStation,
  ConnectorType,
  DrivingRoute,
  OcpiTariffEvaluation,
  PowerMode,
  PowerPriceTier,
  RawIrveRecord,
  ResolvedPrice,
  UserPriceOverride,
} from '../types/charging';
import { matchActiveSubscription } from '../data/networkTariffs';
import {
  formatPriceKwh,
  getPriceTier,
  isTruthyIrve,
  normalizePowerKw,
  parseIrveTariff,
} from '../utils/tariffParser';
import { projectStationOntoRoute, sampleRouteQueryCenters } from './routeApi';

const ODRE_EXPORTS_URL =
  'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/bornes-irve/exports/json';

const SELECT_FIELDS = [
  'id_station_itinerance',
  'id_station_local',
  'id_pdc_itinerance',
  'nom_station',
  'nom_operateur',
  'nom_enseigne',
  'adresse_station',
  'consolidated_commune',
  'consolidated_code_postal',
  'consolidated_latitude',
  'consolidated_longitude',
  'puissance_nominale',
  'tarification',
  'gratuit',
  'paiement_cb',
  'paiement_acte',
  'prise_type_combo_ccs',
  'prise_type_2',
  'prise_type_chademo',
  'prise_type_ef',
  'horaires',
  'condition_acces',
  'date_maj',
].join(',');

const CACHE_TTL_MS = 5 * 60 * 1000;
const SESSION_CACHE_PREFIX = 'voltpulse_irve_cache_v2_';

interface CacheEntry {
  timestamp: number;
  stations: ChargingStation[];
}

const memoryCache = new Map<string, CacheEntry>();

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function extractCity(rec: RawIrveRecord): string {
  if (rec.consolidated_commune && rec.consolidated_commune.trim()) {
    return rec.consolidated_commune.trim();
  }
  const addr = rec.adresse_station || '';
  const match = addr.match(/\b\d{5}\s+([A-Za-zÀ-ÿ'’\- ]{2,})/);
  if (match) return match[1].trim();
  return '';
}

function collectConnectors(rec: RawIrveRecord): ConnectorType[] {
  const list: ConnectorType[] = [];
  if (isTruthyIrve(rec.prise_type_combo_ccs)) list.push('CCS');
  if (isTruthyIrve(rec.prise_type_2)) list.push('Type 2');
  if (isTruthyIrve(rec.prise_type_chademo)) list.push('CHAdeMO');
  if (isTruthyIrve(rec.prise_type_ef)) list.push('EF');
  return list;
}

function pickPrimaryResolvedPrice(tiers: PowerPriceTier[]): ResolvedPrice {
  const known = tiers
    .filter((t) => t.resolvedPrice.pricePerKwh !== null)
    .sort((a, b) => {
      const pa = a.resolvedPrice.pricePerKwh ?? 999;
      const pb = b.resolvedPrice.pricePerKwh ?? 999;
      if (pa !== pb) return pa - pb;
      return b.powerKw - a.powerKw;
    });
  if (known.length > 0) return known[0].resolvedPrice;
  const sortedByPower = [...tiers].sort((a, b) => b.powerKw - a.powerKw);
  return sortedByPower[0].resolvedPrice;
}

export function aggregateIrveRecords(
  records: RawIrveRecord[],
  centerLat: number,
  centerLon: number,
  radiusKm: number
): ChargingStation[] {
  const groups = new Map<string, RawIrveRecord[]>();

  for (const rec of records) {
    const lat = rec.consolidated_latitude;
    const lon = rec.consolidated_longitude;
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      continue;
    }

    const stationKey =
      rec.id_station_itinerance?.trim() ||
      rec.id_station_local?.trim() ||
      `${(rec.nom_station || 'station').trim()}_${lat.toFixed(4)}_${lon.toFixed(4)}`;

    const existing = groups.get(stationKey);
    if (existing) {
      existing.push(rec);
    } else {
      groups.set(stationKey, [rec]);
    }
  }

  const stations: ChargingStation[] = [];

  for (const [stationId, rows] of groups.entries()) {
    const first = rows[0];
    const lat = first.consolidated_latitude as number;
    const lon = first.consolidated_longitude as number;
    const distanceKm = haversineKm(centerLat, centerLon, lat, lon);
    if (distanceKm > radiusKm * 1.15) continue;

    const brand = (first.nom_enseigne || '').trim();
    const operator = (first.nom_operateur || '').trim();
    const name = (first.nom_station || brand || operator || 'Station de recharge').trim();
    const address = (first.adresse_station || '').trim();
    const city = extractCity(first);

    const allConnectors = new Set<ConnectorType>();
    const pdcIdSet = new Set<string>();
    let paymentCb = false;
    let paymentActe = false;
    let isFree = false;
    let latestDateMaj: string | null = null;
    let rawTariffSample: string | null = null;
    let tariffUrlSample: string | null = null;
    const horaires = (first.horaires || '').trim();
    const conditionAcces = (first.condition_acces || '').trim();

    const tierBuckets = new Map<
      number,
      {
        powerKw: number;
        pointCount: number;
        connectors: Set<ConnectorType>;
        rawTariff: string | null;
        anyFree: boolean;
      }
    >();

    for (const r of rows) {
      const kw = normalizePowerKw(r.puissance_nominale);
      const roundedKw = kw > 0 ? Math.round(kw) : 0;
      const conns = collectConnectors(r);
      conns.forEach((c) => allConnectors.add(c));
      const pdcId = r.id_pdc_itinerance?.trim();
      if (pdcId) pdcIdSet.add(pdcId);

      if (isTruthyIrve(r.paiement_cb)) paymentCb = true;
      if (isTruthyIrve(r.paiement_acte)) paymentActe = true;
      const rowFree = isTruthyIrve(r.gratuit);
      if (rowFree) isFree = true;

      if (r.date_maj && (!latestDateMaj || r.date_maj > latestDateMaj)) {
        latestDateMaj = r.date_maj;
      }

      const tStr = r.tarification?.trim() || null;
      if (tStr && !rawTariffSample) rawTariffSample = tStr;

      const bucket = tierBuckets.get(roundedKw);
      if (bucket) {
        bucket.pointCount += 1;
        conns.forEach((c) => bucket.connectors.add(c));
        if (!bucket.rawTariff && tStr) bucket.rawTariff = tStr;
        if (rowFree) bucket.anyFree = true;
      } else {
        tierBuckets.set(roundedKw, {
          powerKw: kw,
          pointCount: 1,
          connectors: new Set(conns),
          rawTariff: tStr,
          anyFree: rowFree,
        });
      }
    }

    const tiers: PowerPriceTier[] = Array.from(tierBuckets.values())
      .map((b) => {
        const resolved = parseIrveTariff(
          b.rawTariff ?? rawTariffSample,
          b.anyFree,
          b.powerKw,
          operator,
          brand
        );
        if (resolved.tariffUrl && !tariffUrlSample) {
          tariffUrlSample = resolved.tariffUrl;
        }
        return {
          powerKw: b.powerKw,
          pointCount: b.pointCount,
          connectors: Array.from(b.connectors),
          resolvedPrice: resolved,
        };
      })
      .sort((a, b) => a.powerKw - b.powerKw);

    const resolvedPrice = pickPrimaryResolvedPrice(tiers);
    const powers = tiers.map((t) => t.powerKw).filter((p) => p > 0);
    const maxPowerKw = powers.length > 0 ? Math.max(...powers) : 0;
    const minPowerKw = powers.length > 0 ? Math.min(...powers) : 0;
    const connectors = Array.from(allConnectors);
    const is247 = /24\s*\/\s*7|24h\s*\/\s*24|00:00\s*-\s*24:00|tous les jours 24/i.test(horaires);

    stations.push({
      id: stationId,
      name,
      brand: brand || operator || 'Réseau indépendant',
      operator: operator || brand || 'Opérateur inconnu',
      address,
      city,
      lat,
      lon,
      distanceKm,
      pointCount: rows.length,
      maxPowerKw,
      minPowerKw,
      connectors,
      hasCcs: connectors.includes('CCS'),
      hasType2: connectors.includes('Type 2'),
      hasChademo: connectors.includes('CHAdeMO'),
      paymentCb,
      paymentActe,
      isFree,
      is247,
      horaires,
      conditionAcces,
      dateMaj: latestDateMaj,
      rawTariff: rawTariffSample,
      tariffUrl: tariffUrlSample || resolvedPrice.tariffUrl || null,
      pdcIds: Array.from(pdcIdSet),
      tiers,
      resolvedPrice,
    });
  }

  return stations;
}

export function applyUserOverrides(
  stations: ChargingStation[],
  overrides: Record<string, UserPriceOverride>
): ChargingStation[] {
  return applyPricingLayers(stations, overrides, [], {});
}

export function applyPricingLayers(
  stations: ChargingStation[],
  overrides: Record<string, UserPriceOverride>,
  activeSubscriptions: string[],
  ocpiIndex: Record<string, OcpiTariffEvaluation>
): ChargingStation[] {
  return stations.map((st) => {
    // 1. User verified override always wins
    const ov = overrides[st.id];
    if (ov) {
      return {
        ...st,
        resolvedPrice: {
          ...st.resolvedPrice,
          pricePerKwh: ov.pricePerKwh,
          source: 'user',
          sourceLabel: 'Vérifié par toi',
          tier: getPriceTier(ov.pricePerKwh, ov.pricePerKwh === 0),
          detailNote: ov.note
            ? `${ov.note} (noté le ${ov.updatedAt.slice(0, 10)})`
            : `Prix relevé localement le ${ov.updatedAt.slice(0, 10)}`,
        },
      };
    }

    // Check live OCPI tariff from QualiCharge (for non-free stations)
    let bestOcpi: OcpiTariffEvaluation | null = null;
    if (!st.isFree && st.pdcIds.length > 0) {
      for (const pdcId of st.pdcIds) {
        const cand = ocpiIndex[pdcId];
        if (!cand) continue;
        if (!bestOcpi || cand.currentPricePerKwh < bestOcpi.currentPricePerKwh) {
          bestOcpi = cand;
        }
      }
    }

    let basePrice = st.resolvedPrice;
    if (bestOcpi) {
      const rangeNote =
        bestOcpi.hasTimeOfDay &&
        bestOcpi.minPricePerKwh !== null &&
        bestOcpi.maxPricePerKwh !== null &&
        bestOcpi.minPricePerKwh !== bestOcpi.maxPricePerKwh
          ? `Tarif horaire OCPI en direct (plage ${formatPriceKwh(
              bestOcpi.minPricePerKwh
            )}–${formatPriceKwh(bestOcpi.maxPricePerKwh)}/kWh)`
          : 'Tarif OCPI QualiCharge en direct';
      const flatNote = bestOcpi.flatFeeEur
        ? ` · + ${formatPriceKwh(bestOcpi.flatFeeEur)} frais session`
        : '';

      basePrice = {
        ...basePrice,
        pricePerKwh: bestOcpi.currentPricePerKwh,
        fixedFeeEur: bestOcpi.flatFeeEur,
        source: 'ocpi',
        sourceLabel: bestOcpi.hasTimeOfDay ? 'OCPI horaire' : 'OCPI direct',
        tier: getPriceTier(bestOcpi.currentPricePerKwh, bestOcpi.currentPricePerKwh === 0),
        detailNote: rangeNote + flatNote,
        tariffUrl: bestOcpi.tariffUrl || basePrice.tariffUrl,
      };
    }

    // 2. Active subscription beats OCPI / IRVE / network when cheaper (or when price unknown)
    const sub = matchActiveSubscription(st.brand, st.operator, activeSubscriptions);
    if (
      sub &&
      (basePrice.pricePerKwh === null || sub.pricePerKwh < basePrice.pricePerKwh)
    ) {
      return {
        ...st,
        resolvedPrice: {
          ...basePrice,
          pricePerKwh: sub.pricePerKwh,
          source: 'subscription',
          sourceLabel: `Abo ${sub.name.split(' ')[0]}`,
          tier: getPriceTier(sub.pricePerKwh),
          detailNote: `${sub.note} (abonnement actif)`,
          subscriptionPlanId: sub.id,
          subscriptionMonthlyEur: sub.monthlyPriceEur,
          subscriptionMonthlyLabel: sub.monthlyLabel,
          publicPricePerKwh: basePrice.pricePerKwh ?? sub.referencePublicPerKwh,
        },
      };
    }

    if (bestOcpi) {
      return {
        ...st,
        resolvedPrice: basePrice,
      };
    }

    return st;
  });
}

function buildWhereClause(
  lat: number,
  lon: number,
  radiusKm: number,
  powerMode: PowerMode
): string {
  const latDelta = radiusKm / 111;
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lonDelta = radiusKm / (111 * cosLat);

  const minLat = (lat - latDelta).toFixed(5);
  const maxLat = (lat + latDelta).toFixed(5);
  const minLon = (lon - lonDelta).toFixed(5);
  const maxLon = (lon + lonDelta).toFixed(5);

  const clauses = [
    `consolidated_latitude >= ${minLat}`,
    `consolidated_latitude <= ${maxLat}`,
    `consolidated_longitude >= ${minLon}`,
    `consolidated_longitude <= ${maxLon}`,
  ];

  // CRITICAL: ODRÉ stores mixed-case booleans ('true', 'True', 'TRUE', '1')
  if (powerMode === 'ccs50') {
    clauses.push('puissance_nominale >= 50');
    clauses.push("prise_type_combo_ccs in ('true','True','TRUE','1')");
  } else if (powerMode === 'ccs150') {
    clauses.push('puissance_nominale >= 150');
    clauses.push("prise_type_combo_ccs in ('true','True','TRUE','1')");
  } else if (powerMode === 'ac') {
    clauses.push('puissance_nominale < 50');
    clauses.push("prise_type_2 in ('true','True','TRUE','1')");
  }

  return clauses.join(' AND ');
}

function getCacheKey(lat: number, lon: number, radiusKm: number, powerMode: PowerMode): string {
  return `${lat.toFixed(2)}_${lon.toFixed(2)}_${radiusKm}_${powerMode}`;
}

function readCached(
  key: string,
  centerLat: number,
  centerLon: number
): ChargingStation[] | null {
  const now = Date.now();
  const mem = memoryCache.get(key);
  if (mem && now - mem.timestamp < CACHE_TTL_MS) {
    return mem.stations.map((s) => ({
      ...s,
      distanceKm: haversineKm(centerLat, centerLon, s.lat, s.lon),
    }));
  }

  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed && now - parsed.timestamp < CACHE_TTL_MS && Array.isArray(parsed.stations)) {
      memoryCache.set(key, parsed);
      return parsed.stations.map((s) => ({
        ...s,
        distanceKm: haversineKm(centerLat, centerLon, s.lat, s.lon),
      }));
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function writeCached(key: string, stations: ChargingStation[]): void {
  const entry: CacheEntry = { timestamp: Date.now(), stations };
  memoryCache.set(key, entry);
  try {
    sessionStorage.setItem(SESSION_CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Ignore quota overflow
  }
}

export interface FetchStationsResult {
  stations: ChargingStation[];
  fromCache: boolean;
  truncated: boolean;
}

export async function fetchStationsAround(
  lat: number,
  lon: number,
  radiusKm: number,
  powerMode: PowerMode,
  signal?: AbortSignal,
  bypassCache = false
): Promise<FetchStationsResult> {
  const cacheKey = getCacheKey(lat, lon, radiusKm, powerMode);
  if (!bypassCache) {
    const cached = readCached(cacheKey, lat, lon);
    if (cached) {
      return {
        stations: cached,
        fromCache: true,
        truncated: false,
      };
    }
  }

  const where = buildWhereClause(lat, lon, radiusKm, powerMode);
  const params = new URLSearchParams({
    select: SELECT_FIELDS,
    where,
    limit: '800',
  });

  const url = `${ODRE_EXPORTS_URL}?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Erreur API IRVE (${res.status})`);
  }

  const data = (await res.json()) as RawIrveRecord[];
  const rows = Array.isArray(data) ? data : [];
  const stations = aggregateIrveRecords(rows, lat, lon, radiusKm);
  writeCached(cacheKey, stations);

  return {
    stations,
    fromCache: false,
    truncated: rows.length >= 800,
  };
}

export async function fetchStationsAlongRoute(
  route: DrivingRoute,
  corridorKm: number,
  powerMode: PowerMode,
  signal?: AbortSignal
): Promise<FetchStationsResult> {
  const centers = sampleRouteQueryCenters(route.polyline, 36, 10);
  if (centers.length === 0) {
    return { stations: [], fromCache: false, truncated: false };
  }

  const deduped = new Map<string, ChargingStation>();
  let anyTruncated = false;
  let allFromCache = true;

  for (let i = 0; i < centers.length; i += 3) {
    if (signal?.aborted) break;
    const batch = centers.slice(i, i + 3);
    const settled = await Promise.allSettled(
      batch.map((c) =>
        fetchStationsAround(
          c.lat,
          c.lon,
          Math.max(c.radiusKm, corridorKm + 16),
          powerMode,
          signal
        )
      )
    );

    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled') continue;
      if (!outcome.value.fromCache) allFromCache = false;
      if (outcome.value.truncated) anyTruncated = true;

      for (const st of outcome.value.stations) {
        if (deduped.has(st.id)) continue;
        const proj = projectStationOntoRoute(st.lat, st.lon, route.polyline);
        if (proj.detourKm <= corridorKm) {
          deduped.set(st.id, {
            ...st,
            distanceKm: haversineKm(route.start.lat, route.start.lon, st.lat, st.lon),
            routeDetourKm: proj.detourKm,
            alongRouteKm: proj.alongRouteKm,
          });
        }
      }
    }
  }

  const result = Array.from(deduped.values()).sort(
    (a, b) => (a.alongRouteKm ?? 0) - (b.alongRouteKm ?? 0)
  );

  return {
    stations: result,
    fromCache: allFromCache,
    truncated: anyTruncated,
  };
}
