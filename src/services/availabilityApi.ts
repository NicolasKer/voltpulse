import {
  AvailabilityStatus,
  ChargingStation,
  PdcDynamicStatus,
  StationAvailability,
} from '../types/charging';

const DYNAMIC_IRVE_TABULAR_URL =
  'https://tabular-api.data.gouv.fr/api/resources/89185b1f-f958-4c5b-9282-399a66ecee97/data/';

const CACHE_TTL_MS = 90 * 1000;
const CHUNK_SIZE = 50;
const MAX_PDCS_PER_SWEEP = 350;
const MAX_CONCURRENCY = 4;

interface CachedPdcEntry {
  ts: number;
  status: PdcDynamicStatus;
}

const dynamicCache = new Map<string, CachedPdcEntry>();

interface RawTabularDynamicRow {
  id_pdc_itinerance?: string | null;
  etat_pdc?: string | null;
  occupation_pdc?: string | null;
  horodatage?: string | null;
}

export function classifyPdcStatus(
  etatPdc: string | null | undefined,
  occupationPdc: string | null | undefined
): AvailabilityStatus {
  const etat = (etatPdc || '').trim().toLowerCase();
  const occ = (occupationPdc || '').trim().toLowerCase();

  // MUST evaluate out-of-service first because some feeds report hors_service + libre
  if (etat === 'hors_service') return 'out_of_service';
  if (occ === 'libre') return 'available';
  if (occ === 'occupe' || occ === 'reserve') return 'occupied';
  return 'unknown';
}

export function normalizeIsoTimestamp(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Convert "YYYY-MM-DD HH:MM:SS+00:00" to ISO-8601 "YYYY-MM-DDTHH:MM:SS+00:00" for Safari
  const iso = trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/, '$1T$2');
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? iso : null;
}

async function fetchDynamicChunk(
  ids: string[],
  signal?: AbortSignal
): Promise<PdcDynamicStatus[]> {
  const params = new URLSearchParams({
    id_pdc_itinerance__in: ids.join(','),
    page_size: '100',
  });
  const res = await fetch(`${DYNAMIC_IRVE_TABULAR_URL}?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(`Erreur API disponibilité (${res.status})`);
  }
  const payload = (await res.json()) as { data?: RawTabularDynamicRow[] };
  const rows = Array.isArray(payload.data) ? payload.data : [];

  return rows
    .filter((r) => typeof r.id_pdc_itinerance === 'string' && r.id_pdc_itinerance.trim() !== '')
    .map((r) => {
      const idPdc = r.id_pdc_itinerance!.trim();
      const etatPdc = (r.etat_pdc || 'inconnu').trim();
      const occupationPdc = (r.occupation_pdc || 'inconnu').trim();
      const horodatage = normalizeIsoTimestamp(r.horodatage);
      return {
        idPdc,
        etatPdc,
        occupationPdc,
        horodatage,
        classified: classifyPdcStatus(etatPdc, occupationPdc),
      };
    });
}

export async function fetchDynamicStatusesForPdcIds(
  pdcIds: string[],
  signal?: AbortSignal,
  bypassCache = false
): Promise<Record<string, PdcDynamicStatus>> {
  const uniqueIds = Array.from(
    new Set(pdcIds.map((id) => id.trim()).filter((id) => id.length > 0))
  );
  const now = Date.now();
  const result: Record<string, PdcDynamicStatus> = {};
  const toFetch: string[] = [];

  for (const id of uniqueIds) {
    if (!bypassCache) {
      const cached = dynamicCache.get(id);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        result[id] = cached.status;
        continue;
      }
    }
    toFetch.push(id);
  }

  const capped = toFetch.slice(0, MAX_PDCS_PER_SWEEP);
  if (capped.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < capped.length; i += CHUNK_SIZE) {
    chunks.push(capped.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i += MAX_CONCURRENCY) {
    if (signal?.aborted) break;
    const batch = chunks.slice(i, i + MAX_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((chunk) => fetchDynamicChunk(chunk, signal))
    );
    const fetchedAt = Date.now();
    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled') continue;
      for (const st of outcome.value) {
        dynamicCache.set(st.idPdc, { ts: fetchedAt, status: st });
        result[st.idPdc] = st;
      }
    }
  }

  return result;
}

export function computeStationAvailability(
  station: Pick<ChargingStation, 'pdcIds' | 'pointCount'>,
  statusMap: Record<string, PdcDynamicStatus>
): StationAvailability {
  let availableCount = 0;
  let occupiedCount = 0;
  let outOfServiceCount = 0;
  let knownCount = 0;
  let latestTimestamp: string | null = null;
  let latestMs = -1;

  for (const id of station.pdcIds) {
    const dyn = statusMap[id];
    if (!dyn) continue;

    if (dyn.horodatage) {
      const ms = Date.parse(dyn.horodatage);
      if (Number.isFinite(ms) && ms > latestMs) {
        latestMs = ms;
        latestTimestamp = dyn.horodatage;
      }
    }

    if (dyn.classified === 'available') {
      availableCount += 1;
      knownCount += 1;
    } else if (dyn.classified === 'occupied') {
      occupiedCount += 1;
      knownCount += 1;
    } else if (dyn.classified === 'out_of_service') {
      outOfServiceCount += 1;
      knownCount += 1;
    }
  }

  let status: AvailabilityStatus = 'unknown';
  if (availableCount > 0) {
    status = 'available';
  } else if (occupiedCount > 0) {
    status = 'occupied';
  } else if (outOfServiceCount > 0) {
    status = 'out_of_service';
  }

  return {
    status,
    availableCount,
    occupiedCount,
    outOfServiceCount,
    knownCount,
    totalCount: Math.max(station.pointCount, station.pdcIds.length),
    latestTimestamp,
  };
}

export function formatRelativeTimestamp(
  iso: string | null | undefined,
  nowMs = Date.now()
): string {
  const normalized = normalizeIsoTimestamp(iso);
  if (!normalized) return 'Horodatage inconnu';
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) return 'Horodatage inconnu';

  const diffMin = Math.round((nowMs - ms) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `il y a ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'hier';
  return `il y a ${diffDays} j`;
}
