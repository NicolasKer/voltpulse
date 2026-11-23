import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Share2 } from 'lucide-react';
import {
  buildQrSvgModel,
  generateQrPngDataUrl,
  getAppShareUrl,
} from '../utils/qrCode';
import { ModalDialog } from './ModalDialog';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (message: string) => void;
}

/**
 * Displays a scannable SVG QR code for sharing VoltPulse alongside copy, PNG download, and native Web Share actions.
 */
export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  onNotify,
}) => {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  const shareUrl = useMemo(() => getAppShareUrl(), []);
  const qrModel = useMemo(() => buildQrSvgModel(shareUrl), [shareUrl]);
  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const markCopied = () => {
    setCopied(true);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 2000);
    onNotify?.('🔗 Lien VoltPulse copié !');
  };

  const handleCopyUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        markCopied();
        return;
      }
    } catch {
      // Fallback below for restricted clipboard permissions or non-HTTPS origins
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) markCopied();
    } catch {
      // Silent failure if clipboard is blocked by browser
    }
  };

  const handleDownloadPng = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const dataUrl = await generateQrPngDataUrl(shareUrl);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'voltpulse-qr.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onNotify?.('📥 QR code téléchargé (PNG)');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    try {
      await navigator.share({
        title: 'VoltPulse — Bornes & Prix €/kWh',
        text: 'Compare les prix €/kWh des bornes de recharge autour de toi :',
        url: shareUrl,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={380}
      title="Partager VoltPulse"
      subtitle="Scannez le QR code pour ouvrir ou installer l’appli"
    >
      <div className="share-qr-wrap">
        <div className="share-qr-card">
          <svg
            className="share-qr-svg"
            viewBox={`0 0 ${qrModel.viewBoxSize} ${qrModel.viewBoxSize}`}
            role="img"
            aria-label={`QR code vers ${shareUrl}`}
            shapeRendering="crispEdges"
          >
            <rect
              width={qrModel.viewBoxSize}
              height={qrModel.viewBoxSize}
              fill="#ffffff"
            />
            <path d={qrModel.pathData} fill="#0a0f18" />
          </svg>
        </div>

        <div className="share-url-pill">
          <code>{shareUrl}</code>
        </div>

        <div className="share-actions-row">
          <button
            type="button"
            className="secondary-btn"
            onClick={handleCopyUrl}
          >
            {copied ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
            <span>{copied ? 'Lien copié' : 'Copier le lien'}</span>
          </button>

          <button
            type="button"
            className="secondary-btn"
            onClick={handleDownloadPng}
            disabled={isDownloading}
          >
            <Download size={15} aria-hidden="true" />
            <span>Télécharger PNG</span>
          </button>

          {canNativeShare && (
            <button
              type="button"
              className="primary-btn-sm"
              onClick={handleNativeShare}
            >
              <Share2 size={15} aria-hidden="true" />
              <span>Partager…</span>
            </button>
          )}
        </div>

        <p className="share-install-tip">
          Astuce : une fois ouvert sur téléphone, touchez « Ajouter à l’écran
          d’accueil » pour l’installer comme une appli.
        </p>
      </div>
    </ModalDialog>
  );
};
