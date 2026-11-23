import { OcpiTariffEvaluation } from '../types/charging';

const QC_OCPI_TARIFFS_URL =
  'https://tabular-api.data.gouv.fr/api/resources/95b787a1-3c50-4bad-a51c-fa90ccc6661c/data/';

const OCPI_CACHE_TTL_MS = 30 * 60 * 1000;
const PAGE_SIZE = 200;

interface OcpiPriceComponent {
  type?: string;
  price?: number;
  vat?: number;
}

interface OcpiRestrictions {
  start_time?: string;
  end_time?: string;
  day_of_week?: string[];
  min_duration?: number;
  max_duration?: number;
}

interface OcpiElement {
  restrictions?: OcpiRestrictions;
  price_components?: OcpiPriceComponent[];
}

export interface OcpiRawTariff {
  id?: string;
  party_id?: string;
  currency?: string;
  tax_included?: string;
  last_updated?: string;
  tariff_alt_url?: string;
  elements?: OcpiElement[];
}

interface RawTabularOcpiRow {
  raw?: OcpiRawTariff | null;
  start?: string | null;
  end?: string | null;
  id_pdc_itinerance?: string[] | null;
}

const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

let cachedIndex: { ts: number; data: Record<string, OcpiTariffEvaluation> } | null = null;
let inflightPromise: Promise<Record<string, OcpiTariffEvaluation>> | null = null;

function parseHhMmToMinutes(hhmmss: string, isEnd: boolean): number | null {
  const match = hhmmss.trim().match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const total = h * 60 + m;
  if (isEnd && total === 0) return 1440;
  return total;
}

function isElementActiveAt(restrictions: OcpiRestrictions | undefined, nowDate: Date): boolean {
  if (!restrictions) return true;

  if (Array.isArray(restrictions.day_of_week) && restrictions.day_of_week.length > 0) {
    const todayName = WEEKDAYS[nowDate.getDay()];
    const upperDays = restrictions.day_of_week.map((d) => d.toUpperCase());
    if (!upperDays.includes(todayName)) return false;
  }

  if (restrictions.start_time && restrictions.end_time) {
    const startMin = parseHhMmToMinutes(restrictions.start_time, false);
    const endMin = parseHhMmToMinutes(restrictions.end_time, true);
    if (startMin !== null && endMin !== null) {
      const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
      if (startMin <= endMin) {
        if (nowMin < startMin || nowMin >= endMin) return false;
      } else {
        if (nowMin < startMin && nowMin >= endMin) return false;
      }
    }
  }

  return true;
}

function toTtcPrice(price: number, vat: number | undefined, taxIncluded: string | undefined): number {
  const alreadyTtc = (taxIncluded || '').toUpperCase() === 'YES';
  const ttc =
    !alreadyTtc && typeof vat === 'number' && Number.isFinite(vat) && vat > 0
      ? price * (1 + vat / 100)
      : price;
  return Math.round(ttc * 1000) / 1000;
}

export function evaluateOcpiRawTariff(
  raw: OcpiRawTariff | null | undefined,
  nowDate = new Date()
): OcpiTariffEvaluation | null {
  if (!raw || !Array.isArray(raw.elements) || raw.elements.length === 0) return null;
  if (raw.currency && raw.currency.toUpperCase() !== 'EUR') return null;

  let activeEnergyPrice: number | null = null;
  let fallbackEnergyPrice: number | null = null;
  let flatFeeEur: number | null = null;
  let hasTimeOfDay = false;
  const allEnergyPrices: number[] = [];

  for (const el of raw.elements) {
    if (!Array.isArray(el.price_components)) continue;
    const isRestrictedTime = Boolean(el.restrictions?.start_time && el.restrictions?.end_time);
    if (isRestrictedTime) hasTimeOfDay = true;

    const energyComp = el.price_components.find(
      (c) => c.type === 'ENERGY' && typeof c.price === 'number' && Number.isFinite(c.price)
    );
    if (energyComp && typeof energyComp.price === 'number') {
      const ttc = toTtcPrice(energyComp.price, energyComp.vat, raw.tax_included);
      if (ttc >= 0 && ttc <= 3) {
        allEnergyPrices.push(ttc);
        if (fallbackEnergyPrice === null) fallbackEnergyPrice = ttc;
        if (activeEnergyPrice === null && isElementActiveAt(el.restrictions, nowDate)) {
          activeEnergyPrice = ttc;
        }
      }
    }

    const flatComp = el.price_components.find(
      (c) => c.type === 'FLAT' && typeof c.price === 'number' && Number.isFinite(c.price)
    );
    if (flatComp && typeof flatComp.price === 'number' && flatFeeEur === null) {
      const flatTtc = toTtcPrice(flatComp.price, flatComp.vat, raw.tax_included);
      if (flatTtc > 0) flatFeeEur = Math.round(flatTtc * 100) / 100;
    }
  }

  const chosen = activeEnergyPrice ?? fallbackEnergyPrice;
  if (chosen === null) return null;

  return {
    currentPricePerKwh: chosen,
    minPricePerKwh: allEnergyPrices.length > 0 ? Math.min(...allEnergyPrices) : chosen,
    maxPricePerKwh: allEnergyPrices.length > 0 ? Math.max(...allEnergyPrices) : chosen,
    flatFeeEur,
    hasTimeOfDay,
    partyId: raw.party_id || '',
    tariffUrl: raw.tariff_alt_url || null,
    updatedAt: raw.last_updated || null,
  };
}

function isRowExpired(endStr: string | null | undefined, nowMs: number): boolean {
  if (!endStr) return false;
  const iso = endStr.trim().replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/, '$1T$2');
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms < nowMs;
}

async function fetchOcpiPage(
  page: number,
  signal?: AbortSignal
): Promise<{ rows: RawTabularOcpiRow[]; total: number }> {
  const url = `${QC_OCPI_TARIFFS_URL}?page_size=${PAGE_SIZE}&page=${page}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Erreur API OCPI QualiCharge (${res.status})`);
  }
  const json = (await res.json()) as {
    data?: RawTabularOcpiRow[];
    meta?: { total?: number };
  };
  return {
    rows: Array.isArray(json.data) ? json.data : [],
    total: typeof json.meta?.total === 'number' ? json.meta.total : 0,
  };
}

export async function fetchOcpiTariffIndex(
  signal?: AbortSignal,
  bypassCache = false
): Promise<Record<string, OcpiTariffEvaluation>> {
  const nowMs = Date.now();
  if (!bypassCache && cachedIndex && nowMs - cachedIndex.ts < OCPI_CACHE_TTL_MS) {
    return cachedIndex.data;
  }

  if (!bypassCache && inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = (async () => {
    try {
      const first = await fetchOcpiPage(1, signal);
      const totalPages = Math.min(
        10,
        Math.max(1, Math.ceil((first.total || first.rows.length) / PAGE_SIZE))
      );

      const allRows: RawTabularOcpiRow[] = [...first.rows];
      if (totalPages > 1) {
        const restPages: number[] = [];
        for (let p = 2; p <= totalPages; p++) restPages.push(p);
        const settled = await Promise.allSettled(
          restPages.map((p) => fetchOcpiPage(p, signal))
        );
        for (const outcome of settled) {
          if (outcome.status === 'fulfilled') {
            allRows.push(...outcome.value.rows);
          }
        }
      }

      const nowDate = new Date();
      const nowEpoch = nowDate.getTime();
      const index: Record<string, OcpiTariffEvaluation> = {};

      for (const row of allRows) {
        if (isRowExpired(row.end, nowEpoch)) continue;
        if (!Array.isArray(row.id_pdc_itinerance) || row.id_pdc_itinerance.length === 0) {
          continue;
        }
        const evaluated = evaluateOcpiRawTariff(row.raw, nowDate);
        if (!evaluated) continue;

        for (const rawId of row.id_pdc_itinerance) {
          const id = typeof rawId === 'string' ? rawId.trim() : '';
          if (!id) continue;
          const prev = index[id];
          if (
            !prev ||
            (evaluated.updatedAt && (!prev.updatedAt || evaluated.updatedAt > prev.updatedAt))
          ) {
            index[id] = evaluated;
          }
        }
      }

      cachedIndex = { ts: Date.now(), data: index };
      return index;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}
