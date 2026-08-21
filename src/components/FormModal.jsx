import React, { useEffect } from 'react';

/**
 * Ventana genérica para "agregar algo nuevo".
 *
 * Reutiliza exactamente las mismas clases que ya tenía la ventana de
 * "Nueva cotización" (`nueva-cotizacion-overlay` / `nueva-cotizacion-modal`),
 * porque esas ya traen todo el ajuste fino para móvil: se centra sobre la
 * barra de navegación de abajo, el título queda pegado arriba y el botón de
 * guardar queda pegado abajo aunque el formulario sea largo.
 *
 * Así, agregar proveedor / persona / faltante / apartado / movimiento se ve y
 * se comporta igual que agregar una cotización, en escritorio y en teléfono.
 */
export default function FormModal({ title, subtitle, onClose, maxWidth = 460, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay nueva-cotizacion-overlay app-form-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal nueva-cotizacion-modal app-form-modal"
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-top">
          <h2>{title}</h2>
          <button type="button" className="x-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {subtitle && (
          <p className="hint" style={{ marginBottom: 14 }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
