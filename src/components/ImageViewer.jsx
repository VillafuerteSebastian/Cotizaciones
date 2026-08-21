import React, { useState } from 'react';
import { MotionOverlay, motion, AnimatePresence } from './Motion.jsx';

// Miniatura de imagen que, al hacer clic, se abre en grande con opción de
// descargarla. Se usa en cualquier parte de la app donde se muestre una
// foto (productos cotizados, notas generales, etc.).
export function ImageThumb({ src, alt, size = 46, style, radius = 6 }) {
  const [open, setOpen] = useState(false);
  if (!src) return null;

  const nombreArchivo = (alt || 'imagen').trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-') || 'imagen';

  return (
    <React.Fragment>
      <img
        src={src}
        alt={alt || 'imagen'}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Clic para ver en grande"
        style={{
          maxWidth: size,
          maxHeight: size,
          borderRadius: radius,
          cursor: 'zoom-in',
          display: 'block',
          border: '1px solid var(--line)',
          ...style,
        }}
      />
      <AnimatePresence>
        {open && (
          <MotionOverlay
            style={{ zIndex: 300 }}
            onClick={(e) => {
              e.stopPropagation();
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.14 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 14,
                maxWidth: '92vw',
                maxHeight: '92vh',
              }}
            >
              <img
                src={src}
                alt={alt || 'imagen'}
                style={{
                  maxWidth: '92vw',
                  maxHeight: '78vh',
                  borderRadius: 12,
                  boxShadow: '0 20px 60px rgba(0,0,0,.45)',
                  background: '#fff',
                }}
              />
              <div className="action-row" style={{ justifyContent: 'center' }}>
                <a href={src} download={`${nombreArchivo}.jpg`} className="btn btn-primary btn-sm">
                  Descargar
                </a>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                  Cerrar
                </button>
              </div>
            </motion.div>
          </MotionOverlay>
        )}
      </AnimatePresence>
    </React.Fragment>
  );
}

export default ImageThumb;
