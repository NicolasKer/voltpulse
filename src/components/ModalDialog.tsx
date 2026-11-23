import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: number;
}

export const ModalDialog: React.FC<ModalDialogProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 540,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onCloseRef.current();
    };
    dialog.addEventListener('close', handleClose);

    // Progressive enhancement fallback for browsers lacking <dialog closedby="any"> (e.g. Safari)
    let cleanupFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = dialog.open && outside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && dialog.open && outside(e)) {
          dialog.close();
        }
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      cleanupFallback = () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupFallback?.();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="vp-dialog"
      style={{ maxWidth: `${maxWidth}px` }}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="vp-dialog-surface">
        <div className="vp-dialog-header">
          <div className="vp-dialog-title-wrap">
            <h1 id={titleId} className="vp-dialog-title">
              {title}
            </h1>
            {subtitle && <p className="vp-dialog-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-ghost-btn"
            onClick={() => dialogRef.current?.close()}
            aria-label="Fermer la fenêtre"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="vp-dialog-body">{children}</div>
      </div>
    </dialog>
  );
};
