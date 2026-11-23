import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { ChargeLogEntry, VehicleProfile } from '../types/charging';
import { estimateChargeSession } from '../utils/tariffParser';
import { ModalDialog } from './ModalDialog';

export interface ChargeLogPrefill {
  stationId?: string;
  stationName: string;
  operator: string;
  pricePerKwh: number | null;
  powerKw?: number;
}

interface ChargeLogModalProps {
  isOpen: boolean;
  prefill: ChargeLogPrefill | null;
  vehicle: VehicleProfile;
  onClose: () => void;
  onSaveLog: (
    entry: Omit<ChargeLogEntry, 'id'>,
    alsoSavePriceOverride: boolean
  ) => void;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const ChargeLogModal: React.FC<ChargeLogModalProps> = ({
  isOpen,
  prefill,
  vehicle,
  onClose,
  onSaveLog,
}) => {
  const [date, setDate] = useState<string>(todayIso());
  const [stationName, setStationName] = useState<string>('');
  const [operator, setOperator] = useState<string>('');
  const [kwh, setKwh] = useState<string>('36');
  const [pricePerKwh, setPricePerKwh] = useState<string>('0.39');
  const [totalEur, setTotalEur] = useState<string>('14.04');
  const [powerKw, setPowerKw] = useState<string>('150');
  const [notes, setNotes] = useState<string>('');
  const [alsoOverride, setAlsoOverride] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const est = estimateChargeSession(
      prefill?.pricePerKwh ?? 0.39,
      prefill?.powerKw ?? 150,
      vehicle
    );
    const defaultKwh = est.energyKwh > 0 ? est.energyKwh : 30;
    const defaultPrice =
      prefill?.pricePerKwh !== null && prefill?.pricePerKwh !== undefined
        ? prefill.pricePerKwh
        : 0.39;
    const defaultTotal = Math.round(defaultKwh * defaultPrice * 100) / 100;

    setDate(todayIso());
    setStationName(prefill?.stationName || '');
    setOperator(prefill?.operator || '');
    setKwh(String(defaultKwh));
    setPricePerKwh(String(defaultPrice));
    setTotalEur(String(defaultTotal));
    setPowerKw(prefill?.powerKw ? String(Math.round(prefill.powerKw)) : '');
    setNotes('');
    setAlsoOverride(Boolean(prefill?.stationId));
    setErrorMsg(null);
  }, [isOpen, prefill, vehicle]);

  const handleKwhChange = (val: string) => {
    setKwh(val);
    const k = Number.parseFloat(val.replace(',', '.'));
    const p = Number.parseFloat(pricePerKwh.replace(',', '.'));
    if (Number.isFinite(k) && Number.isFinite(p) && k >= 0 && p >= 0) {
      setTotalEur(String(Math.round(k * p * 100) / 100));
    }
  };

  const handlePriceChange = (val: string) => {
    setPricePerKwh(val);
    const k = Number.parseFloat(kwh.replace(',', '.'));
    const p = Number.parseFloat(val.replace(',', '.'));
    if (Number.isFinite(k) && Number.isFinite(p) && k >= 0 && p >= 0) {
      setTotalEur(String(Math.round(k * p * 100) / 100));
    }
  };

  const handleTotalChange = (val: string) => {
    setTotalEur(val);
    const t = Number.parseFloat(val.replace(',', '.'));
    const k = Number.parseFloat(kwh.replace(',', '.'));
    if (Number.isFinite(t) && Number.isFinite(k) && k > 0 && t >= 0) {
      setPricePerKwh(String(Math.round((t / k) * 1000) / 1000));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const k = Number.parseFloat(kwh.replace(',', '.'));
    const p = Number.parseFloat(pricePerKwh.replace(',', '.'));
    const t = Number.parseFloat(totalEur.replace(',', '.'));
    const kw = Number.parseFloat(powerKw.replace(',', '.'));

    if (!stationName.trim()) {
      setErrorMsg('Indiquez le nom de la station.');
      return;
    }
    if (!Number.isFinite(k) || k <= 0) {
      setErrorMsg('Indiquez une quantité de kWh valide (> 0).');
      return;
    }
    if (!Number.isFinite(p) || p < 0 || !Number.isFinite(t) || t < 0) {
      setErrorMsg('Vérifiez le prix au kWh et le montant total.');
      return;
    }

    setErrorMsg(null);
    onSaveLog(
      {
        date,
        stationId: prefill?.stationId,
        stationName: stationName.trim(),
        operator: operator.trim() || 'Autre réseau',
        kwh: Math.round(k * 10) / 10,
        totalEur: Math.round(t * 100) / 100,
        pricePerKwh: Math.round(p * 1000) / 1000,
        powerKw: Number.isFinite(kw) && kw > 0 ? kw : undefined,
        notes: notes.trim() || undefined,
      },
      Boolean(prefill?.stationId && alsoOverride)
    );
    onClose();
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Enregistrer une recharge"
      subtitle="Sauvegarde locale dans votre carnet"
    >
      <form className="charge-log-form" onSubmit={handleSubmit} noValidate>
        <div className="vehicle-fields-grid">
          <div className="field-group">
            <label htmlFor="log-date">Date</label>
            <input
              id="log-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label htmlFor="log-power">Puissance borne (kW)</label>
            <input
              id="log-power"
              type="number"
              inputMode="decimal"
              placeholder="ex. 150"
              value={powerKw}
              onChange={(e) => setPowerKw(e.target.value)}
            />
          </div>
        </div>

        <div className="field-group">
          <label htmlFor="log-station">Nom de la station</label>
          <input
            id="log-station"
            type="text"
            placeholder="ex. IECharge Aire de..."
            value={stationName}
            onChange={(e) => setStationName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="field-group">
          <label htmlFor="log-operator">Réseau / Opérateur</label>
          <input
            id="log-operator"
            type="text"
            placeholder="ex. IECharge, Tesla, Lidl..."
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
          />
        </div>

        <div className="log-amounts-grid">
          <div className="field-group">
            <label htmlFor="log-kwh">Énergie (kWh)</label>
            <input
              id="log-kwh"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.1"
              value={kwh}
              onChange={(e) => handleKwhChange(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label htmlFor="log-price">Prix (€/kWh)</label>
            <input
              id="log-price"
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              value={pricePerKwh}
              onChange={(e) => handlePriceChange(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label htmlFor="log-total">Total (€)</label>
            <input
              id="log-total"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={totalEur}
              onChange={(e) => handleTotalChange(e.target.value)}
            />
          </div>
        </div>

        <div className="field-group">
          <label htmlFor="log-notes">Note (optionnel)</label>
          <input
            id="log-notes"
            type="text"
            placeholder="ex. Paiement CB direct / Heure creuse"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {prefill?.stationId && (
          <label className="vp-checkbox-label" htmlFor="log-also-override">
            <input
              id="log-also-override"
              type="checkbox"
              checked={alsoOverride}
              onChange={(e) => setAlsoOverride(e.target.checked)}
            />
            <span>Mettre à jour aussi le tarif vérifié de cette borne</span>
          </label>
        )}

        {errorMsg && <p className="field-error-text">{errorMsg}</p>}

        <button type="submit" className="primary-validate-btn">
          <Save size={18} aria-hidden="true" />
          <span>Enregistrer la recharge</span>
        </button>
      </form>
    </ModalDialog>
  );
};
