import { VehicleProfile } from '../types/charging';

export interface NetworkTariffRule {
  id: string;
  displayName: string;
  /** Keywords checked against normalized brand (nom_enseigne) and operator (nom_operateur) */
  patterns: string[];
  acPerKwh?: number;
  dcFastPerKwh?: number;
  hpcPerKwh?: number;
  note: string;
}

export const NETWORK_TARIFFS: NetworkTariffRule[] = [
  {
    id: 'iecharge',
    displayName: 'IECharge',
    patterns: ['iecharge', 'nw iecharge', 'nw groupe'],
    dcFastPerKwh: 0.25,
    hpcPerKwh: 0.25,
    note: 'Réf. publique sans abonnement (0,25 €/kWh)',
  },
  {
    id: 'lidl',
    displayName: 'Lidl',
    patterns: ['lidl'],
    acPerKwh: 0.29,
    dcFastPerKwh: 0.39,
    hpcPerKwh: 0.39,
    note: 'Réf. publique Lidl (AC 0,29 € · DC 0,39 €/kWh)',
  },
  {
    id: 'izivia-fast',
    displayName: 'Izivia Fast',
    patterns: ['izivia fast'],
    dcFastPerKwh: 0.35,
    hpcPerKwh: 0.35,
    note: 'Réf. publique Izivia Fast (0,35 €/kWh sans abo)',
  },
  {
    id: 'tesla',
    displayName: 'Tesla Supercharger',
    patterns: ['tesla supercharger', 'tesla france', 'tesla'],
    dcFastPerKwh: 0.45,
    hpcPerKwh: 0.45,
    note: 'Moyenne sans abo (~0,42–0,60 € selon heure · ~0,29–0,39 € avec abo/Tesla)',
  },
  {
    id: 'carrefour',
    displayName: 'Carrefour Énergies',
    patterns: ['carrefour energies', 'carrefour'],
    acPerKwh: 0.30,
    dcFastPerKwh: 0.49,
    hpcPerKwh: 0.54,
    note: 'Réf. Carrefour Énergies (AC 0,30 € · DC 0,49–0,54 €/kWh)',
  },
  {
    id: 'electra',
    displayName: 'Electra',
    patterns: ['electra'],
    dcFastPerKwh: 0.54,
    hpcPerKwh: 0.54,
    note: 'Tarif dynamique appli Electra (~0,39–0,61 € · dès 0,29 € avec Electra+)',
  },
  {
    id: 'powerdot',
    displayName: 'Powerdot',
    patterns: ['power dot', 'powerdot'],
    acPerKwh: 0.39,
    dcFastPerKwh: 0.49,
    hpcPerKwh: 0.54,
    note: 'Réf. Powerdot sans abonnement (~0,49–0,54 €/kWh en DC)',
  },
  {
    id: 'driveco',
    displayName: 'Driveco',
    patterns: ['driveco'],
    acPerKwh: 0.39,
    dcFastPerKwh: 0.49,
    hpcPerKwh: 0.49,
    note: 'Réf. Driveco sans abonnement (~0,39 € AC · ~0,49 € DC)',
  },
  {
    id: 'leclerc',
    displayName: 'E.Leclerc',
    patterns: ['e.leclerc', 'leclerc'],
    acPerKwh: 0.30,
    dcFastPerKwh: 0.45,
    hpcPerKwh: 0.45,
    note: 'Réf. moyenne bornes E.Leclerc (~0,30 € AC · ~0,45 € DC)',
  },
  {
    id: 'aldi',
    displayName: 'Aldi',
    patterns: ['aldi'],
    acPerKwh: 0.29,
    dcFastPerKwh: 0.42,
    hpcPerKwh: 0.42,
    note: 'Réf. publique Aldi (AC ~0,29 € · DC ~0,42 €/kWh)',
  },
  {
    id: 'engie-vianeo',
    displayName: 'ENGIE Vianeo',
    patterns: ['engie vianeo', 'vianeo', 'engie'],
    acPerKwh: 0.40,
    dcFastPerKwh: 0.55,
    hpcPerKwh: 0.62,
    note: 'Réf. ENGIE Vianeo sans abo (~0,55–0,62 € DC · 0,33 € avec abo Max)',
  },
  {
    id: 'totalenergies',
    displayName: 'TotalEnergies',
    patterns: ['totalenergies', 'total ev', 'total marketing'],
    acPerKwh: 0.38,
    dcFastPerKwh: 0.52,
    hpcPerKwh: 0.62,
    note: 'Réf. TotalEnergies (≤50 kW 0,52 € · >50 kW 0,62 €/kWh)',
  },
  {
    id: 'ionity',
    displayName: 'IONITY',
    patterns: ['ionity'],
    dcFastPerKwh: 0.59,
    hpcPerKwh: 0.59,
    note: 'Tarif direct IONITY 0,59 €/kWh (~0,33–0,39 € avec Passport)',
  },
  {
    id: 'fastned',
    displayName: 'Fastned',
    patterns: ['fastned'],
    dcFastPerKwh: 0.59,
    hpcPerKwh: 0.59,
    note: 'Tarif direct Fastned ~0,59 €/kWh (~0,41 € avec abo Gold)',
  },
  {
    id: 'r3',
    displayName: 'R3',
    patterns: ['r3', 'norauto'],
    dcFastPerKwh: 0.55,
    hpcPerKwh: 0.55,
    note: 'Réf. publique R3 sans abonnement (~0,55 €/kWh)',
  },
  {
    id: 'atlante',
    displayName: 'Atlante',
    patterns: ['atlante'],
    dcFastPerKwh: 0.59,
    hpcPerKwh: 0.59,
    note: 'Réf. publique Atlante (~0,59 €/kWh)',
  },
  {
    id: 'bp-pulse',
    displayName: 'bp pulse',
    patterns: ['bp pulse', 'bp france'],
    dcFastPerKwh: 0.59,
    hpcPerKwh: 0.59,
    note: 'Réf. publique bp pulse (~0,59 €/kWh)',
  },
  {
    id: 'mobilize',
    displayName: 'Mobilize Fast Charge',
    patterns: ['mobilize'],
    acPerKwh: 0.39,
    dcFastPerKwh: 0.59,
    hpcPerKwh: 0.59,
    note: 'Réf. Mobilize sans abo (~0,59 €/kWh · ~0,39 € avec abo Intense)',
  },
  {
    id: 'evzen',
    displayName: 'EVzen',
    patterns: ['evzen'],
    acPerKwh: 0.39,
    dcFastPerKwh: 0.55,
    hpcPerKwh: 0.55,
    note: 'Réf. EVzen sans abonnement (~0,55 €/kWh DC)',
  },
  {
    id: 'zunder',
    displayName: 'Zunder',
    patterns: ['zunder', 'easycharger'],
    dcFastPerKwh: 0.55,
    hpcPerKwh: 0.55,
    note: 'Réf. Zunder sans abonnement (~0,55 €/kWh)',
  },
  {
    id: 'allego',
    displayName: 'Allego',
    patterns: ['allego'],
    acPerKwh: 0.45,
    dcFastPerKwh: 0.59,
    hpcPerKwh: 0.65,
    note: 'Réf. Allego tarif public (~0,59–0,65 €/kWh en DC)',
  },
  {
    id: 'izivia',
    displayName: 'Izivia',
    patterns: ['izivia'],
    acPerKwh: 0.35,
    dcFastPerKwh: 0.48,
    hpcPerKwh: 0.48,
    note: 'Réf. Izivia Express / réseau local (~0,35 € AC · ~0,48 € DC)',
  },
  {
    id: 'freshmile',
    displayName: 'Freshmile',
    patterns: ['freshmile'],
    acPerKwh: 0.35,
    dcFastPerKwh: 0.55,
    hpcPerKwh: 0.55,
    note: 'Réf. moyenne Freshmile (varie selon syndicat/site)',
  },
  {
    id: 'etotem',
    displayName: 'e-Totem',
    patterns: ['e-totem', 'etotem'],
    acPerKwh: 0.38,
    dcFastPerKwh: 0.52,
    hpcPerKwh: 0.52,
    note: 'Réf. e-Totem (~0,38 € AC · ~0,52 € DC)',
  },
  {
    id: 'eborn',
    displayName: 'eborn',
    patterns: ['eborn'],
    acPerKwh: 0.39,
    dcFastPerKwh: 0.52,
    hpcPerKwh: 0.52,
    note: 'Réf. réseau eborn sans abonnement (~0,39 € AC · ~0,52 € DC)',
  },
  {
    id: 'reveo',
    displayName: 'Révéo',
    patterns: ['reveo'],
    acPerKwh: 0.38,
    dcFastPerKwh: 0.52,
    hpcPerKwh: 0.52,
    note: 'Réf. Révéo sans abonnement (~0,38 € AC · ~0,52 € DC)',
  },
  {
    id: 'belib',
    displayName: "Belib'",
    patterns: ['belib'],
    acPerKwh: 0.42,
    dcFastPerKwh: 0.55,
    hpcPerKwh: 0.55,
    note: "Réf. Belib' Paris (~0,42 € AC · ~0,55 € DC)",
  },
  {
    id: 'ouest-charge',
    displayName: 'Ouest Charge',
    patterns: ['ouest charge', 'ouestcharge'],
    acPerKwh: 0.39,
    dcFastPerKwh: 0.50,
    hpcPerKwh: 0.50,
    note: 'Réf. Ouest Charge sans abonnement (~0,39 € AC · ~0,50 € DC)',
  },
  {
    id: 'mobive',
    displayName: 'Mobive',
    patterns: ['mobive'],
    acPerKwh: 0.38,
    dcFastPerKwh: 0.50,
    hpcPerKwh: 0.50,
    note: 'Réf. Mobive sans abonnement (~0,38 € AC · ~0,50 € DC)',
  },
  {
    id: 'metropolis',
    displayName: 'Metropolis',
    patterns: ['metropolis'],
    acPerKwh: 0.42,
    dcFastPerKwh: 0.55,
    hpcPerKwh: 0.55,
    note: 'Réf. Metropolis Grand Paris (~0,42 € AC · ~0,55 € DC)',
  },
  {
    id: 'qovoltis',
    displayName: 'Qovoltis',
    patterns: ['qovoltis'],
    acPerKwh: 0.39,
    dcFastPerKwh: 0.54,
    hpcPerKwh: 0.54,
    note: 'Réf. Qovoltis sans abonnement (~0,39 € AC · ~0,54 € DC)',
  },
  {
    id: 'stations-e',
    displayName: 'Stations-e',
    patterns: ['stations-e', 'station-e'],
    acPerKwh: 0.42,
    dcFastPerKwh: 0.55,
    hpcPerKwh: 0.55,
    note: 'Réf. Stations-e sans abonnement (~0,42 € AC · ~0,55 € DC)',
  },
  {
    id: 'greenspot',
    displayName: 'Greenspot',
    patterns: ['greenspot'],
    acPerKwh: 0.42,
    dcFastPerKwh: 0.55,
    hpcPerKwh: 0.55,
    note: 'Réf. Greenspot (~0,42 € AC · ~0,55 € DC)',
  },
];

export interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyLabel: string;
  pricePerKwh: number;
  patterns: string[];
  note: string;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'electra',
    name: 'Electra+ Boost',
    monthlyLabel: '19,99 €/mois',
    pricePerKwh: 0.29,
    patterns: ['electra'],
    note: 'Tarif abonné Electra+ Boost (0,29 €/kWh)',
  },
  {
    id: 'tesla',
    name: 'Tesla Supercharging',
    monthlyLabel: '9,99 €/mois',
    pricePerKwh: 0.33,
    patterns: ['tesla'],
    note: 'Tarif membre Tesla (~0,29–0,39 €/kWh selon heure)',
  },
  {
    id: 'ionity',
    name: 'IONITY Passport Power',
    monthlyLabel: '11,99 €/mois',
    pricePerKwh: 0.33,
    patterns: ['ionity'],
    note: 'Tarif abonné IONITY Passport Power (0,33 €/kWh)',
  },
  {
    id: 'engie',
    name: 'ENGIE Vianeo Max',
    monthlyLabel: '9,99 €/mois',
    pricePerKwh: 0.33,
    patterns: ['engie', 'vianeo'],
    note: 'Tarif unique abonné ENGIE Vianeo Max (0,33 €/kWh)',
  },
  {
    id: 'mobilize',
    name: 'Mobilize Pass Intense',
    monthlyLabel: '4,99 €/mois',
    pricePerKwh: 0.39,
    patterns: ['mobilize', 'ionity'],
    note: 'Tarif partenaire Mobilize Intense (~0,39 €/kWh)',
  },
  {
    id: 'fastned',
    name: 'Fastned Gold',
    monthlyLabel: '11,99 €/mois',
    pricePerKwh: 0.41,
    patterns: ['fastned'],
    note: 'Tarif abonné Fastned Gold (~0,41 €/kWh)',
  },
];

function normSubText(text: string | null | undefined): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function matchActiveSubscription(
  brand: string | null | undefined,
  operator: string | null | undefined,
  activeSubscriptionIds: string[]
): SubscriptionPlan | null {
  if (!activeSubscriptionIds.length) return null;
  const hay = `${normSubText(brand)} ${normSubText(operator)}`;
  const activeSet = new Set(activeSubscriptionIds);
  const matches = SUBSCRIPTION_PLANS.filter(
    (plan) => activeSet.has(plan.id) && plan.patterns.some((p) => hay.includes(p))
  ).sort((a, b) => a.pricePerKwh - b.pricePerKwh);

  return matches[0] || null;
}

export interface EvPreset {
  id: string;
  name: string;
  batteryKwh: number;
  maxDcKw: number;
  consumptionKwhPer100: number;
}

export const EV_PRESETS: EvPreset[] = [
  {
    id: 'megane',
    name: 'Renault Mégane E-Tech (60 kWh)',
    batteryKwh: 60,
    maxDcKw: 130,
    consumptionKwhPer100: 16.5,
  },
  {
    id: 'model3-prop',
    name: 'Tesla Model 3 / Y Prop (60 kWh)',
    batteryKwh: 60,
    maxDcKw: 170,
    consumptionKwhPer100: 15.0,
  },
  {
    id: 'modely-lr',
    name: 'Tesla Model Y Grande Autonomie (75 kWh)',
    batteryKwh: 75,
    maxDcKw: 250,
    consumptionKwhPer100: 16.5,
  },
  {
    id: 'e208',
    name: 'Peugeot e-208 / Corsa-e (50 kWh)',
    batteryKwh: 50,
    maxDcKw: 100,
    consumptionKwhPer100: 16.0,
  },
  {
    id: 'r5',
    name: 'Renault 5 E-Tech (52 kWh)',
    batteryKwh: 52,
    maxDcKw: 100,
    consumptionKwhPer100: 15.5,
  },
  {
    id: 'scenic',
    name: 'Renault Scénic E-Tech (87 kWh)',
    batteryKwh: 87,
    maxDcKw: 150,
    consumptionKwhPer100: 17.5,
  },
  {
    id: 'ioniq5',
    name: 'Hyundai Ioniq 5 / Kia EV6 (77 kWh)',
    batteryKwh: 77,
    maxDcKw: 235,
    consumptionKwhPer100: 17.5,
  },
  {
    id: 'spring',
    name: 'Dacia Spring (27 kWh)',
    batteryKwh: 27,
    maxDcKw: 30,
    consumptionKwhPer100: 13.5,
  },
];

export const DEFAULT_VEHICLE_PROFILE: VehicleProfile = {
  name: EV_PRESETS[0].name,
  batteryKwh: EV_PRESETS[0].batteryKwh,
  maxDcKw: EV_PRESETS[0].maxDcKw,
  consumptionKwhPer100: EV_PRESETS[0].consumptionKwhPer100,
  startSoc: 20,
  targetSoc: 80,
  homeTariffPerKwh: 0.20,
};
