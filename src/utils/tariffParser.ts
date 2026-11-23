import {
  NETWORK_TARIFFS,
  NetworkTariffRule,
  SubscriptionPlan,
} from '../data/networkTariffs';
import { ChargingStation, PriceTier, ResolvedPrice, VehicleProfile } from '../types/charging';

export function isTruthyIrve(val: string | boolean | number | null | undefined): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val !== 'string') return false;
  const s = val.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'oui' || s === 'yes';
}

export function normalizePowerKw(raw: number | null | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0;
  // Rare ODRÉ records store power in Watts (e.g. 22000 or 160000) instead of kW
  const kw = raw > 2000 ? raw / 1000 : raw;
  return Math.round(kw * 10) / 10;
}

export function normalizeLabel(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function cleanMojibake(text: string): string {
  return text
    .replace(/â‚¬/g, '€')
    .replace(/Ć/g, '€')
    .replace(/ķ/g, 'é')
    .replace(/č/g, 'è')
    .replace(/ŕ/g, 'à');
}

export function extractUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

export function getPriceTier(pricePerKwh: number | null, isFree = false): PriceTier {
  if (isFree || pricePerKwh === 0) return 'free';
  if (pricePerKwh === null || !Number.isFinite(pricePerKwh)) return 'unknown';
  if (pricePerKwh <= 0.35) return 'cheap';
  if (pricePerKwh <= 0.48) return 'good';
  if (pricePerKwh <= 0.58) return 'medium';
  return 'expensive';
}

export function formatPriceKwh(price: number | null, includeUnit = false): string {
  if (price === null || !Number.isFinite(price)) return '? €';
  if (price === 0) return 'Gratuit';
  const formatted = price.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return includeUnit ? `${formatted} €/kWh` : `${formatted} €`;
}

function parseFrenchNumber(str: string): number {
  return Number.parseFloat(str.replace(',', '.'));
}

function roundPrice(val: number): number {
  return Math.round(val * 1000) / 1000;
}

function isGenericDisclaimer(cleanedLower: string): boolean {
  return (
    cleanedLower.includes('peuvent varier en fonction de plusieurs facteurs') ||
    cleanedLower.includes('grille tarifaire en ligne') ||
    cleanedLower.includes('frais de connexion éventuelles') ||
    cleanedLower.includes('frais de connexion eventuelles') ||
    cleanedLower.includes('consulter directement les informations tarifaires')
  );
}

function matchNetworkRule(target: string): NetworkTariffRule | null {
  if (!target) return null;
  for (const rule of NETWORK_TARIFFS) {
    for (const pat of rule.patterns) {
      if (pat.length <= 2) {
        // Short brand tokens like "r3" must match as whole words
        const wordRe = new RegExp(`(^|[^a-z0-9])${pat}([^a-z0-9]|$)`);
        if (wordRe.test(target)) return rule;
      } else if (target.includes(pat)) {
        return rule;
      }
    }
  }
  return null;
}

export function lookupNetworkTariff(
  brand: string | null | undefined,
  operator: string | null | undefined,
  powerKw: number
): ResolvedPrice | null {
  const normBrand = normalizeLabel(brand);
  const normOp = normalizeLabel(operator);

  // Match nom_enseigne (brand) BEFORE nom_operateur (crucial for Carrefour/Allego, ENGIE/Greenflux, etc.)
  const rule = matchNetworkRule(normBrand) || matchNetworkRule(normOp);
  if (!rule) return null;

  let price: number | undefined;
  if (powerKw >= 120) {
    price = rule.hpcPerKwh ?? rule.dcFastPerKwh ?? rule.acPerKwh;
  } else if (powerKw >= 23) {
    price = rule.dcFastPerKwh ?? rule.hpcPerKwh ?? rule.acPerKwh;
  } else {
    price = rule.acPerKwh ?? rule.dcFastPerKwh ?? rule.hpcPerKwh;
  }

  if (typeof price !== 'number') return null;

  return {
    pricePerKwh: price,
    pricePerMin: null,
    fixedFeeEur: null,
    source: 'network',
    sourceLabel: `Réf. ${rule.displayName}`,
    tier: getPriceTier(price),
    detailNote: rule.note,
  };
}

function pickTieredMatch(
  matches: { labelContext: string; val: number }[],
  powerKw: number
): number {
  if (matches.length === 1) return matches[0].val;

  const isHpc = powerKw >= 120;
  const isDc = powerKw >= 23;

  for (const m of matches) {
    const ctx = m.labelContext.toLowerCase();
    if (isHpc && (ctx.includes('hpc') || ctx.includes('thp') || ctx.includes('ultra'))) {
      return m.val;
    }
    if (isDc && !isHpc && (ctx.includes('dc') || ctx.includes('rapide') || ctx.includes('fast'))) {
      return m.val;
    }
    if (!isDc && (ctx.includes('ac') || ctx.includes('normale') || ctx.includes('lente'))) {
      return m.val;
    }
  }

  // Prefer "par défaut" if present (common in ODRÉ time-slot strings)
  const defaultEntry = matches.find((m) => /d[eé]faut/i.test(m.labelContext));
  if (defaultEntry) return defaultEntry.val;

  // Prefer DC/HPC over AC if >=23kW, else first
  return isDc ? matches[matches.length - 1].val : matches[0].val;
}

export function parseIrveTariff(
  rawText: string | null | undefined,
  isFreeInput: string | boolean | number | null | undefined,
  powerKw: number,
  operator?: string | null,
  brand?: string | null
): ResolvedPrice {
  const isFree = isTruthyIrve(isFreeInput);
  const cleanedRaw = rawText ? cleanMojibake(rawText).trim() : '';
  const tariffUrl = extractUrl(cleanedRaw);

  if (isFree) {
    return {
      pricePerKwh: 0,
      pricePerMin: null,
      fixedFeeEur: null,
      source: 'irve',
      sourceLabel: 'Gratuit (IRVE)',
      tier: 'free',
      detailNote: 'Recharge déclarée gratuite dans la base officielle IRVE',
      rawTariff: cleanedRaw || null,
      tariffUrl,
    };
  }

  if (cleanedRaw && !isGenericDisclaimer(cleanedRaw.toLowerCase())) {
    // 1. JSON payload format (e.g. {"fixedPrice":0,"energyPrice":0.51,...})
    if (cleanedRaw.startsWith('{')) {
      try {
        const parsed = JSON.parse(cleanedRaw) as {
          energyPrice?: unknown;
          fixedPrice?: unknown;
          matrixOSF?: Array<{ price?: unknown; gracePeriodBeforeOSF?: unknown }>;
        };
        if (
          typeof parsed.energyPrice === 'number' &&
          Number.isFinite(parsed.energyPrice) &&
          parsed.energyPrice >= 0 &&
          parsed.energyPrice <= 3
        ) {
          const price = roundPrice(parsed.energyPrice);
          const fixedFee =
            typeof parsed.fixedPrice === 'number' && parsed.fixedPrice > 0
              ? roundPrice(parsed.fixedPrice)
              : null;
          const osf = Array.isArray(parsed.matrixOSF) ? parsed.matrixOSF[0] : undefined;
          const osfNote =
            osf && typeof osf.price === 'number' && osf.price > 0
              ? ` · Frais d'occupation ${formatPriceKwh(osf.price)}/min après charge`
              : '';
          return {
            pricePerKwh: price,
            pricePerMin: null,
            fixedFeeEur: fixedFee,
            source: 'irve',
            sourceLabel: 'IRVE officiel',
            tier: getPriceTier(price),
            detailNote:
              (fixedFee ? `Frais fixes ${formatPriceKwh(fixedFee)}` : 'Tarif énergie officiel') +
              osfNote,
            rawTariff: cleanedRaw,
            tariffUrl,
          };
        }
      } catch {
        // Continue to text parsing
      }
    }

    // 2. Explicit €/kWh or "€ par kwh" patterns
    const eurKwhRe =
      /([^\n,;]{0,28}?)(\d+(?:[.,]\d+)?)\s*(?:€|eur|euros?)\s*(?:\/|par)\s*kwh/gi;
    const eurMatches: { labelContext: string; val: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = eurKwhRe.exec(cleanedRaw)) !== null) {
      const val = parseFrenchNumber(m[2]);
      if (Number.isFinite(val) && val >= 0 && val <= 3) {
        eurMatches.push({ labelContext: m[1] || '', val: roundPrice(val) });
      }
    }
    if (eurMatches.length > 0) {
      const chosen = pickTieredMatch(eurMatches, powerKw);
      return {
        pricePerKwh: chosen,
        pricePerMin: null,
        fixedFeeEur: null,
        source: 'irve',
        sourceLabel: 'IRVE officiel',
        tier: getPriceTier(chosen),
        detailNote: 'Tarif au kWh déclaré dans la base officielle IRVE',
        rawTariff: cleanedRaw,
        tariffUrl,
      };
    }

    // 3. Centimes patterns: "59 cts/kWh", "AC 36cts/KWh", "HPC 49cts/Kwh"
    const ctsKwhRe =
      /([^\n,;]{0,24}?)(\d+(?:[.,]\d+)?)\s*(?:cts?|centimes?)\s*(?:\/|par)?\s*kwh/gi;
    const ctsMatches: { labelContext: string; val: number }[] = [];
    while ((m = ctsKwhRe.exec(cleanedRaw)) !== null) {
      const cents = parseFrenchNumber(m[2]);
      const val = cents / 100;
      if (Number.isFinite(val) && val >= 0 && val <= 3) {
        ctsMatches.push({ labelContext: m[1] || '', val: roundPrice(val) });
      }
    }
    if (ctsMatches.length > 0) {
      const chosen = pickTieredMatch(ctsMatches, powerKw);
      return {
        pricePerKwh: chosen,
        pricePerMin: null,
        fixedFeeEur: null,
        source: 'irve',
        sourceLabel: 'IRVE officiel',
        tier: getPriceTier(chosen),
        detailNote: 'Tarif au kWh déclaré dans la base officielle IRVE',
        rawTariff: cleanedRaw,
        tariffUrl,
      };
    }

    // 4. Per-minute patterns: "0,025€ / min" or "30 cts/min"
    const minEurRe = /(\d+(?:[.,]\d+)?)\s*(?:€|eur|euros?)\s*(?:\/|par)\s*min/i;
    const minCtsRe = /(\d+(?:[.,]\d+)?)\s*(?:cts?|centimes?)\s*(?:\/|par)\s*min/i;
    const minEurMatch = cleanedRaw.match(minEurRe);
    const minCtsMatch = cleanedRaw.match(minCtsRe);
    const pricePerMin = minEurMatch
      ? parseFrenchNumber(minEurMatch[1])
      : minCtsMatch
      ? parseFrenchNumber(minCtsMatch[1]) / 100
      : null;

    if (pricePerMin !== null && Number.isFinite(pricePerMin) && pricePerMin > 0 && pricePerMin <= 5) {
      const effectiveKw = Math.max(
        3.7,
        Math.min(powerKw || 11, powerKw >= 50 ? 50 : 11)
      );
      const estKwh = roundPrice((pricePerMin * 60) / effectiveKw);
      const perMinFormatted = pricePerMin.toLocaleString('fr-FR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 3,
      });
      return {
        pricePerKwh: estKwh,
        pricePerMin: roundPrice(pricePerMin),
        fixedFeeEur: null,
        source: 'irve',
        sourceLabel: 'IRVE (à la min)',
        tier: getPriceTier(estKwh),
        detailNote: `Tarif à la minute (${perMinFormatted} €/min ≈ ${formatPriceKwh(estKwh)}/kWh estimé à ${effectiveKw} kW)`,
        rawTariff: cleanedRaw,
        tariffUrl,
      };
    }

    // Check explicit "gratuit" word inside tarification text
    if (/\bgratuit(e)?\b/i.test(cleanedRaw)) {
      return {
        pricePerKwh: 0,
        pricePerMin: null,
        fixedFeeEur: null,
        source: 'irve',
        sourceLabel: 'Gratuit (IRVE)',
        tier: 'free',
        detailNote: cleanedRaw,
        rawTariff: cleanedRaw,
        tariffUrl,
      };
    }
  }

  // 5. Fallback to curated French public network grid (brand first, then operator)
  const netPrice = lookupNetworkTariff(brand, operator, powerKw);
  if (netPrice) {
    return {
      ...netPrice,
      rawTariff: cleanedRaw || null,
      tariffUrl,
    };
  }

  // 6. Unknown price
  return {
    pricePerKwh: null,
    pricePerMin: null,
    fixedFeeEur: null,
    source: 'unknown',
    sourceLabel: 'Prix inconnu',
    tier: 'unknown',
    detailNote: tariffUrl
      ? 'Tarif non publié en opendata — consultez le lien opérateur ou notez le prix vu sur place'
      : 'Tarif non publié dans IRVE — notez le prix vu sur la borne pour le retenir',
    rawTariff: cleanedRaw || null,
    tariffUrl,
  };
}

export interface ChargeEstimate {
  energyKwh: number;
  estimatedCostEur: number | null;
  estimatedMinutes: number;
  estimatedRangeKm: number;
  homeCostEur: number;
  deltaVsHomeEur: number | null;
}

export function estimateChargeSession(
  pricePerKwh: number | null,
  stationPowerKw: number,
  vehicle: VehicleProfile
): ChargeEstimate {
  const socDiff = Math.max(0, vehicle.targetSoc - vehicle.startSoc);
  const energyKwh = Math.round(((vehicle.batteryKwh * socDiff) / 100) * 10) / 10;

  // Realistic average charging speed accounts for DC taper above 60-80%
  const rawPeak = Math.max(3.7, Math.min(stationPowerKw || 50, vehicle.maxDcKw || 130));
  const avgFactor = rawPeak >= 50 ? 0.72 : 0.92;
  const effectivePower = Math.max(3.7, rawPeak * avgFactor);
  const estimatedMinutes = Math.max(1, Math.round((energyKwh / effectivePower) * 60));

  const estimatedRangeKm =
    vehicle.consumptionKwhPer100 > 0
      ? Math.round((energyKwh / vehicle.consumptionKwhPer100) * 100)
      : 0;

  const homeCostEur = Math.round(energyKwh * vehicle.homeTariffPerKwh * 100) / 100;
  const estimatedCostEur =
    pricePerKwh !== null ? Math.round(energyKwh * pricePerKwh * 100) / 100 : null;
  const deltaVsHomeEur =
    estimatedCostEur !== null ? Math.round((estimatedCostEur - homeCostEur) * 100) / 100 : null;

  return {
    energyKwh,
    estimatedCostEur,
    estimatedMinutes,
    estimatedRangeKm,
    homeCostEur,
    deltaVsHomeEur,
  };
}

export interface DetourCostEstimate {
  chargeEst: ChargeEstimate;
  detourOneWayKm: number;
  detourRoundTripKm: number;
  detourEnergyKwh: number;
  detourEnergyCostEur: number | null;
  detourMinutes: number;
  totalEffectiveEur: number | null;
  effectivePricePerKwh: number | null;
}

export function estimateTotalCostWithDetour(
  station: Pick<ChargingStation, 'distanceKm' | 'routeDetourKm' | 'maxPowerKw' | 'resolvedPrice'>,
  vehicle: VehicleProfile
): DetourCostEstimate {
  const unitPrice = station.resolvedPrice.pricePerKwh;
  const chargeEst = estimateChargeSession(unitPrice, station.maxPowerKw, vehicle);
  const detourOneWayKm = Math.max(0, station.routeDetourKm ?? station.distanceKm);
  const detourRoundTripKm = Math.round(detourOneWayKm * 2 * 10) / 10;
  const detourEnergyKwh =
    Math.round(((detourRoundTripKm * vehicle.consumptionKwhPer100) / 100) * 100) / 100;
  const detourMinutes = Math.round((detourRoundTripKm / 45) * 60);

  const detourEnergyCostEur =
    unitPrice !== null ? Math.round(detourEnergyKwh * unitPrice * 100) / 100 : null;
  const totalEffectiveEur =
    chargeEst.estimatedCostEur !== null && detourEnergyCostEur !== null
      ? Math.round((chargeEst.estimatedCostEur + detourEnergyCostEur) * 100) / 100
      : null;
  const effectivePricePerKwh =
    totalEffectiveEur !== null && chargeEst.energyKwh > 0
      ? Math.round((totalEffectiveEur / chargeEst.energyKwh) * 1000) / 1000
      : null;

  return {
    chargeEst,
    detourOneWayKm,
    detourRoundTripKm,
    detourEnergyKwh,
    detourEnergyCostEur,
    detourMinutes,
    totalEffectiveEur,
    effectivePricePerKwh,
  };
}

export interface SubscriptionBreakeven {
  isProfitable: boolean;
  baselinePublicPerKwh: number;
  savingsPerKwh: number;
  breakEvenKwh: number | null;
  breakEvenCharges: number | null;
  breakEvenKm: number | null;
  savingsPerChargeEur: number;
}

export function computeSubscriptionBreakeven(
  plan: SubscriptionPlan,
  publicPricePerKwh: number | null,
  vehicle: VehicleProfile
): SubscriptionBreakeven {
  const baselinePublicPerKwh = publicPricePerKwh ?? plan.referencePublicPerKwh;
  const savingsPerKwh =
    Math.round((baselinePublicPerKwh - plan.pricePerKwh) * 1000) / 1000;

  if (savingsPerKwh <= 0) {
    return {
      isProfitable: false,
      baselinePublicPerKwh,
      savingsPerKwh: 0,
      breakEvenKwh: null,
      breakEvenCharges: null,
      breakEvenKm: null,
      savingsPerChargeEur: 0,
    };
  }

  const breakEvenKwh = Math.ceil(plan.monthlyPriceEur / savingsPerKwh);
  const socDelta = Math.max(5, vehicle.targetSoc - vehicle.startSoc);
  const sessionKwh = Math.max(1, (vehicle.batteryKwh * socDelta) / 100);
  const breakEvenCharges = Math.round((breakEvenKwh / sessionKwh) * 10) / 10;
  const breakEvenKm =
    vehicle.consumptionKwhPer100 > 0
      ? Math.round((breakEvenKwh / vehicle.consumptionKwhPer100) * 100)
      : null;
  const savingsPerChargeEur =
    Math.round(sessionKwh * savingsPerKwh * 100) / 100;

  return {
    isProfitable: true,
    baselinePublicPerKwh,
    savingsPerKwh,
    breakEvenKwh,
    breakEvenCharges,
    breakEvenKm,
    savingsPerChargeEur,
  };
}
