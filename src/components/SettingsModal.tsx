import React, { useRef, useState } from 'react';
import { Download, Info, QrCode, Smartphone, Ticket, Trash2, Upload } from 'lucide-react';
import { SUBSCRIPTION_PLANS } from '../data/networkTariffs';
import { PowerMode, SearchFilters, VehicleProfile } from '../types/charging';
import { computeSubscriptionBreakeven, formatPriceKwh } from '../utils/tariffParser';
import { ModalDialog } from './ModalDialog';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: SearchFilters;
  vehicle: VehicleProfile;
  activeSubscriptions: string[];
  canInstallApp: boolean;
  onInstallApp: () => void;
  onOpenShare: () => void;
  onUpdateFilters: (next: SearchFilters) => void;
  onUpdateVehicle: (next: VehicleProfile) => void;
  onToggleSubscription: (planId: string) => void;
  onExportJson: () => void;
  onImportJson: (text: string) => void;
  onResetAll: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  filters,
  vehicle,
  activeSubscriptions,
  canInstallApp,
  onInstallApp,
  onOpenShare,
  onUpdateFilters,
  onUpdateVehicle,
  onToggleSubscription,
  onExportJson,
  onImportJson,
  onResetAll,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Paramètres & Sources"
      subtitle="VoltPulse · Données ouvertes IRVE & stockage local"
    >
      {canInstallApp && (
        <div className="connection-status-card">
          <div className="conn-row">
            <Smartphone size={20} className="conn-icon-ok" aria-hidden="true" />
            <div>
              <div className="conn-title">Installer l’application</div>
              <div className="conn-sub">
                Accès rapide sur l’écran d’accueil façon SportApp.
              </div>
            </div>
          </div>
          <div className="conn-actions-row">
            <button
              type="button"
              className="primary-btn-sm"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={onInstallApp}
            >
              Installer sur cet appareil
            </button>
          </div>
        </div>
      )}

      <div className="connection-status-card settings-share-card">
        <div className="conn-row">
          <QrCode size={20} className="conn-icon-ok" aria-hidden="true" />
          <div>
            <div className="conn-title">Partager VoltPulse</div>
            <div className="conn-sub">
              QR code prêt à scanner ou envoyer par message.
            </div>
          </div>
        </div>
        <div className="conn-actions-row">
          <button
            type="button"
            className="secondary-btn"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={onOpenShare}
          >
            <QrCode size={15} aria-hidden="true" />
            <span>Afficher le QR code</span>
          </button>
        </div>
      </div>

      <div className="detail-card-box">
        <h2 className="detail-subhead">Préférences par défaut</h2>
        <div className="vehicle-fields-grid">
          <div className="field-group">
            <label htmlFor="pref-radius">Rayon de recherche</label>
            <select
              id="pref-radius"
              value={filters.radiusKm}
              onChange={(e) =>
                onUpdateFilters({ ...filters, radiusKm: Number(e.target.value) })
              }
            >
              <option value={5}>5 km</option>
              <option value={15}>15 km</option>
              <option value={30}>30 km</option>
              <option value={50}>50 km</option>
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="pref-mode">Prise principale</label>
            <select
              id="pref-mode"
              value={filters.powerMode}
              onChange={(e) =>
                onUpdateFilters({ ...filters, powerMode: e.target.value as PowerMode })
              }
            >
              <option value="ccs50">CCS Rapide (≥ 50 kW)</option>
              <option value="ccs150">CCS Ultra (≥ 150 kW)</option>
              <option value="ac">Type 2 AC (&lt; 50 kW)</option>
              <option value="all">Toutes prises</option>
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="pref-home-tariff">Tarif domicile (€/kWh)</label>
            <input
              id="pref-home-tariff"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="1"
              value={vehicle.homeTariffPerKwh}
              onChange={(e) =>
                onUpdateVehicle({
                  ...vehicle,
                  homeTariffPerKwh: Math.max(0, Number(e.target.value) || 0.2),
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="detail-card-box">
        <h2 className="detail-subhead">
          <Ticket size={15} aria-hidden="true" /> Mes abonnements / badges actifs
        </h2>
        <p className="tier-meta" style={{ margin: '0 0 0.55rem' }}>
          Cochez vos pass actifs pour recalculer instantanément toute la carte :
        </p>
        <div className="subs-grid">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const checked = activeSubscriptions.includes(plan.id);
            const be = computeSubscriptionBreakeven(plan, null, vehicle);
            return (
              <label
                key={plan.id}
                htmlFor={`sub-${plan.id}`}
                className={`vp-checkbox-label sub-plan-row${checked ? ' is-active' : ''}`}
              >
                <input
                  id={`sub-${plan.id}`}
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleSubscription(plan.id)}
                />
                <span className="sub-plan-info">
                  <strong>{plan.name}</strong>
                  <small>
                    {formatPriceKwh(plan.pricePerKwh, true)} · {plan.monthlyLabel}
                  </small>
                  {be.isProfitable && (
                    <small className="sub-plan-breakeven">
                      Rentable ≥ {be.breakEvenKwh} kWh/mois (~{be.breakEvenCharges} rech.)
                    </small>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <details className="irve-raw-details" open>
        <summary>
          <Info size={14} aria-hidden="true" /> Comment sont calculés les prix €/kWh ?
        </summary>
        <div className="irve-raw-body">
          <p>
            <strong>1. Vérifié par toi :</strong> vos relevés locaux sont toujours prioritaires.
          </p>
          <p>
            <strong>2. Abonnement actif :</strong> tarif réduit de vos pass cochés ci-dessus.
          </p>
          <p>
            <strong>3. OCPI temps réel (QualiCharge) :</strong> tarifs horaires officiels TTC
            selon l’heure actuelle (heures creuses / pleines).
          </p>
          <p>
            <strong>4. IRVE officiel (ODRÉ) :</strong> tarif ou gratuité déclaré dans la base nationale.
          </p>
          <p>
            <strong>5. Réf. réseau :</strong> grille publique sans abonnement lorsque l’IRVE est vide.
          </p>
          <div className="legend-row">
            <span className="legend-dot cheap">≤ 0,35 €</span>
            <span className="legend-dot good">0,36–0,48 €</span>
            <span className="legend-dot medium">0,49–0,58 €</span>
            <span className="legend-dot expensive">≥ 0,59 €</span>
            <span className="legend-dot unknown">Inconnu</span>
          </div>
        </div>
      </details>

      <div className="detail-card-box" style={{ marginTop: '0.85rem' }}>
        <h2 className="detail-subhead">Sauvegarde locale</h2>
        <div className="backup-bar" style={{ marginTop: '0.4rem' }}>
          <button type="button" className="secondary-btn" onClick={onExportJson}>
            <Download size={14} aria-hidden="true" />
            <span>Exporter JSON</span>
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} aria-hidden="true" />
            <span>Importer JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="visually-hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              onImportJson(await f.text());
              e.target.value = '';
            }}
          />
        </div>

        {!confirmReset ? (
          <button
            type="button"
            className="discard-draft-btn"
            style={{ marginTop: '0.65rem', color: '#fda4af', borderColor: 'rgba(244,63,94,0.35)' }}
            onClick={() => setConfirmReset(true)}
          >
            <Trash2 size={13} aria-hidden="true" /> Réinitialiser mes données locales
          </button>
        ) : (
          <div className="delete-confirm-strip" style={{ marginTop: '0.65rem', marginBottom: 0 }}>
            <span>Tout effacer (prix, favoris, carnet) ?</span>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                className="confirm-del-btn"
                onClick={() => {
                  onResetAll();
                  setConfirmReset(false);
                  onClose();
                }}
              >
                Confirmer
              </button>
              <button
                type="button"
                className="cancel-del-btn"
                onClick={() => setConfirmReset(false)}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalDialog>
  );
};
