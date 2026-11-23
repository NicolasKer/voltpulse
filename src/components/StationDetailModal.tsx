import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Heart,
  Navigation,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Zap,
} from 'lucide-react';
import { ChargingStation, UserPriceOverride, VehicleProfile } from '../types/charging';
import {
  estimateChargeSession,
  estimateTotalCostWithDetour,
  formatPriceKwh,
} from '../utils/tariffParser';
import { formatRelativeTimestamp } from '../services/availabilityApi';
import { ModalDialog } from './ModalDialog';

interface StationDetailModalProps {
  station: ChargingStation | null;
  vehicle: VehicleProfile;
  areaAveragePrice: number | null;
  existingOverride?: UserPriceOverride;
  isFavorite: boolean;
  onClose: () => void;
  onRefreshAvailability?: (station: ChargingStation) => Promise<void>;
  onSaveOverride: (station: ChargingStation, pricePerKwh: number, note: string) => void;
  onDeleteOverride: (stationId: string) => void;
  onToggleFavorite: (station: ChargingStation) => void;
  onLogChargeHere: (station: ChargingStation) => void;
}

export const StationDetailModal: React.FC<StationDetailModalProps> = ({
  station,
  vehicle,
  areaAveragePrice,
  existingOverride,
  isFavorite,
  onClose,
  onRefreshAvailability,
  onSaveOverride,
  onDeleteOverride,
  onToggleFavorite,
  onLogChargeHere,
}) => {
  const [priceInput, setPriceInput] = useState<string>('');
  const [noteInput, setNoteInput] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isRefreshingAvail, setIsRefreshingAvail] = useState<boolean>(false);

  useEffect(() => {
    if (!station) return;
    if (existingOverride) {
      setPriceInput(String(existingOverride.pricePerKwh));
      setNoteInput(existingOverride.note || '');
    } else if (station.resolvedPrice.pricePerKwh !== null) {
      setPriceInput(String(station.resolvedPrice.pricePerKwh));
      setNoteInput('');
    } else {
      setPriceInput('');
      setNoteInput('');
    }
    setFormError(null);
  }, [station, existingOverride]);

  if (!station) {
    return (
      <ModalDialog isOpen={false} onClose={onClose} title="Détails de la borne">
        <div />
      </ModalDialog>
    );
  }

  const { resolvedPrice } = station;
  const sim = estimateChargeSession(
    resolvedPrice.pricePerKwh,
    station.maxPowerKw,
    vehicle
  );
  const detourEst = estimateTotalCostWithDetour(station, vehicle);

  const avgDelta =
    resolvedPrice.pricePerKwh !== null && areaAveragePrice !== null
      ? Math.round((resolvedPrice.pricePerKwh - areaAveragePrice) * sim.energyKwh * 100) / 100
      : null;

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}`;
  const wazeUrl = `https://waze.com/ul?ll=${station.lat},${station.lon}&navigate=yes`;

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number.parseFloat(priceInput.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 3) {
      setFormError('Indiquez un tarif entre 0,00 et 3,00 €/kWh.');
      return;
    }
    setFormError(null);
    onSaveOverride(station, Math.round(parsed * 1000) / 1000, noteInput.trim());
  };

  return (
    <ModalDialog
      isOpen={Boolean(station)}
      onClose={onClose}
      title={station.name}
      subtitle={`${station.brand}${
        station.operator && station.operator !== station.brand
          ? ` · Opérateur ${station.operator}`
          : ''
      } · ${station.distanceKm.toLocaleString('fr-FR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} km`}
    >
      {/* Hero Price Box */}
      <div className={`detail-price-hero tier-${resolvedPrice.tier}`}>
        <div>
          <span className="detail-price-eyebrow">{resolvedPrice.sourceLabel}</span>
          <div className="detail-price-big">
            {resolvedPrice.pricePerKwh === null
              ? 'Tarif non renseigné'
              : resolvedPrice.pricePerKwh === 0
              ? 'Gratuit (0,00 €/kWh)'
              : formatPriceKwh(resolvedPrice.pricePerKwh, true)}
          </div>
          {resolvedPrice.detailNote && (
            <p className="detail-price-note">{resolvedPrice.detailNote}</p>
          )}
        </div>
        {station.maxPowerKw > 0 && (
          <div className="detail-power-pill">
            <Zap size={16} aria-hidden="true" />
            <span>{Math.round(station.maxPowerKw)} kW max</span>
          </div>
        )}
      </div>

      {/* Live Availability Card */}
      <section className="detail-avail-card">
        <div className="detail-avail-top">
          <div>
            <span className="detail-avail-eyebrow">Disponibilité en direct (IRVE dynamique)</span>
            <div className="detail-avail-headline">
              {station.availability && station.availability.knownCount > 0 ? (
                <span className={`avail-pill avail-${station.availability.status}`}>
                  <span className="avail-pill-dot" aria-hidden="true" />
                  {station.availability.status === 'available'
                    ? `${station.availability.availableCount} borne${
                        station.availability.availableCount > 1 ? 's' : ''
                      } libre${station.availability.availableCount > 1 ? 's' : ''} sur ${
                        station.availability.totalCount
                      }`
                    : station.availability.status === 'occupied'
                    ? `Toutes les bornes occupées (0/${station.availability.totalCount})`
                    : 'Station signalée hors service'}
                </span>
              ) : (
                <span className="tier-meta">Statut temps réel non publié par cet opérateur</span>
              )}
            </div>
          </div>

          {onRefreshAvailability && station.pdcIds.length > 0 && (
            <button
              type="button"
              className="secondary-btn"
              style={{ padding: '0.35rem 0.65rem' }}
              disabled={isRefreshingAvail}
              onClick={async () => {
                setIsRefreshingAvail(true);
                await onRefreshAvailability(station);
                setIsRefreshingAvail(false);
              }}
            >
              <RefreshCw
                size={13}
                className={isRefreshingAvail ? 'spin' : ''}
                aria-hidden="true"
              />
              <span>Actualiser</span>
            </button>
          )}
        </div>

        {station.availability && station.availability.knownCount > 0 && (
          <div className="detail-avail-meta">
            <span>
              {station.availability.availableCount} libre · {station.availability.occupiedCount} occupée ·{' '}
              {station.availability.outOfServiceCount} HS
            </span>
            <span>MÀJ : {formatRelativeTimestamp(station.availability.latestTimestamp)}</span>
          </div>
        )}
      </section>

      {/* Quick Specs */}
      <div className="detail-specs-grid">
        <div className="detail-spec-tile">
          <span>Points de charge</span>
          <strong>
            {station.pointCount} borne{station.pointCount > 1 ? 's' : ''}
          </strong>
        </div>
        <div className="detail-spec-tile">
          <span>Connecteurs</span>
          <strong>{station.connectors.join(', ') || 'Non précisé'}</strong>
        </div>
        <div className="detail-spec-tile">
          <span>Paiement CB</span>
          <strong>
            <CreditCard size={13} aria-hidden="true" />{' '}
            {station.paymentCb ? 'Oui (TPE)' : station.paymentActe ? 'À l’acte / Appli' : 'Badge / Appli'}
          </strong>
        </div>
        <div className="detail-spec-tile">
          <span>Horaires</span>
          <strong>
            <Clock size={13} aria-hidden="true" /> {station.horaires || '24/7'}
          </strong>
        </div>
      </div>

      {station.address && (
        <p className="detail-address-line">📍 {station.address}</p>
      )}

      {/* Simulation Card */}
      <section className="detail-card-box">
        <h2 className="detail-subhead">
          Simulation pour {vehicle.name} ({vehicle.startSoc}% → {vehicle.targetSoc}%)
        </h2>
        <div className="detail-sim-metrics">
          <div>
            <span>Énergie ajoutée</span>
            <strong>{sim.energyKwh} kWh</strong>
          </div>
          <div>
            <span>Coût estimé</span>
            <strong className="accent-emerald-txt">
              {sim.estimatedCostEur !== null
                ? `${sim.estimatedCostEur.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} €`
                : '—'}
            </strong>
          </div>
          <div>
            <span>Temps estimé</span>
            <strong>~{sim.estimatedMinutes} min</strong>
          </div>
          <div>
            <span>Autonomie gagnée</span>
            <strong>+{sim.estimatedRangeKm} km</strong>
          </div>
        </div>
        {detourEst.totalEffectiveEur !== null && detourEst.detourRoundTripKm > 0 && (
          <p className="detail-compare-line">
            Détour A/R ({detourEst.detourRoundTripKm} km · +{detourEst.detourMinutes} min) :{' '}
            <strong>
              +{detourEst.detourEnergyCostEur?.toLocaleString('fr-FR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              €
            </strong>{' '}
            → Total réel{' '}
            <strong className="accent-emerald-txt">
              {detourEst.totalEffectiveEur.toLocaleString('fr-FR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              €
            </strong>
          </p>
        )}
        {sim.deltaVsHomeEur !== null && (
          <p className="detail-compare-line">
            Vs domicile ({formatPriceKwh(vehicle.homeTariffPerKwh, true)}) :{' '}
            <strong>
              {sim.deltaVsHomeEur >= 0 ? '+' : ''}
              {sim.deltaVsHomeEur.toLocaleString('fr-FR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              €
            </strong>
            {avgDelta !== null && (
              <>
                {' · '}Vs moyenne du secteur :{' '}
                <strong className={avgDelta <= 0 ? 'accent-emerald-txt' : 'accent-rose-txt'}>
                  {avgDelta <= 0 ? '' : '+'}
                  {avgDelta.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  €
                </strong>
              </>
            )}
          </p>
        )}
      </section>

      {/* Power Tiers at Station */}
      {station.tiers.length > 0 && (
        <section className="detail-card-box">
          <h2 className="detail-subhead">Puissances &amp; tarifs détectés sur site</h2>
          <ul className="tiers-list">
            {station.tiers.map((tier, idx) => (
              <li key={`${tier.powerKw}_${idx}`} className="tier-row">
                <div>
                  <strong>{tier.powerKw > 0 ? `${tier.powerKw} kW` : 'Puissance NC'}</strong>
                  <span className="tier-meta">
                    {' '}
                    · {tier.pointCount} PDC · {tier.connectors.join('/') || 'Prise'}
                  </span>
                </div>
                <span className={`tier-price-pill tier-${tier.resolvedPrice.tier}`}>
                  {formatPriceKwh(tier.resolvedPrice.pricePerKwh, true)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Raw IRVE disclosure */}
      {(station.rawTariff || station.tariffUrl || station.dateMaj) && (
        <details className="irve-raw-details">
          <summary>Données brutes IRVE &amp; lien opérateur</summary>
          <div className="irve-raw-body">
            {station.rawTariff && (
              <p>
                <strong>Champ tarification :</strong> <code>{station.rawTariff}</code>
              </p>
            )}
            {station.conditionAcces && (
              <p>
                <strong>Accès :</strong> {station.conditionAcces}
              </p>
            )}
            {station.dateMaj && (
              <p>
                <strong>Dernière MÀJ IRVE :</strong> {station.dateMaj}
              </p>
            )}
            {station.tariffUrl && (
              <a
                href={station.tariffUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="open-sheet-link"
              >
                <ExternalLink size={14} aria-hidden="true" />
                <span>Voir la grille tarifaire opérateur</span>
              </a>
            )}
          </div>
        </details>
      )}

      {/* Local User Price Override Form */}
      <form className="detail-card-box override-form" onSubmit={handleSaveSubmit} noValidate>
        <div className="override-header">
          <h2 className="detail-subhead">
            <CheckCircle2 size={15} aria-hidden="true" /> Corriger / Noter le prix réel
          </h2>
          {existingOverride && (
            <button
              type="button"
              className="discard-draft-btn"
              onClick={() => onDeleteOverride(station.id)}
            >
              <RotateCcw size={12} aria-hidden="true" /> Réinitialiser
            </button>
          )}
        </div>
        <div className="override-inputs-row">
          <div className="field-group">
            <label htmlFor="override-price-input">Prix relevé (€/kWh)</label>
            <input
              id="override-price-input"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="3"
              placeholder="ex. 0.39"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label htmlFor="override-note-input">Note (optionnel)</label>
            <input
              id="override-note-input"
              type="text"
              placeholder="ex. Vu sur borne CB / appli"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
            />
          </div>
        </div>
        {formError && <p className="field-error-text">{formError}</p>}
        <button type="submit" className="primary-btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
          <Save size={15} aria-hidden="true" />
          <span>Enregistrer mon tarif pour cette borne</span>
        </button>
      </form>

      {/* Primary Action Buttons */}
      <div className="detail-actions-footer">
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="secondary-btn"
          style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}
        >
          <Navigation size={15} aria-hidden="true" />
          <span>Google Maps</span>
        </a>
        <a
          href={wazeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="secondary-btn"
          style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}
        >
          <Navigation size={15} aria-hidden="true" />
          <span>Waze</span>
        </a>
        <button
          type="button"
          className={`secondary-btn${isFavorite ? ' active-fav-btn' : ''}`}
          onClick={() => onToggleFavorite(station)}
          aria-pressed={isFavorite}
        >
          <Heart
            size={15}
            fill={isFavorite ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
          <span>{isFavorite ? 'Favori' : 'Sauver'}</span>
        </button>
      </div>

      <button
        type="button"
        className="primary-validate-btn"
        style={{ marginTop: '0.65rem' }}
        onClick={() => {
          onClose();
          onLogChargeHere(station);
        }}
      >
        <Plus size={18} aria-hidden="true" />
        <span>Enregistrer une recharge ici</span>
      </button>
    </ModalDialog>
  );
};
