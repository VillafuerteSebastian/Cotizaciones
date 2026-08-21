import React, { createContext, useCallback, useContext, useState } from 'react';
import { motion, AnimatePresence, MotionOverlay, MotionModal } from './Motion.jsx';

const UIContext = createContext(null);

let idSeq = 0;

const ICONOS = {
  info: 'ℹ️',
  success: '✓',
  error: '✕',
};

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Reemplazo de window.alert(): toast que aparece abajo a la derecha y
  // se cierra solo. type: 'info' | 'success' | 'error'.
  const toast = useCallback(
    (message, type = 'info', opts = {}) => {
      const id = ++idSeq;
      const duration = opts.duration ?? (type === 'error' ? 6500 : 4000);
      setToasts((prev) => [...prev, { id, message, type }]);
      if (duration > 0) {
        setTimeout(() => dismissToast(id), duration);
      }
      return id;
    },
    [dismissToast]
  );

  // Reemplazo de window.confirm(): devuelve una Promise<boolean>, así
  // que se usa con await igual que el confirm nativo.
  const confirmar = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setConfirmState({
        message,
        detail: opts.detail || null,
        confirmLabel: opts.confirmLabel || 'Confirmar',
        cancelLabel: opts.cancelLabel || 'Cancelar',
        danger: opts.danger !== false,
        resolve,
      });
    });
  }, []);

  const closeConfirm = (result) => {
    setConfirmState((prev) => {
      if (prev) prev.resolve(result);
      return null;
    });
  };

  return (
    <UIContext.Provider value={{ toast, confirmar }}>
      {children}

      <div className="toast-stack" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.16, ease: 'easeIn' } }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className={`toast toast-${t.type}`}
              onClick={() => dismissToast(t.id)}
            >
              <span className="toast-icon">{ICONOS[t.type] || ICONOS.info}</span>
              <span className="toast-msg">{t.message}</span>
              <button
                type="button"
                className="toast-x"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissToast(t.id);
                }}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {confirmState && (
          <MotionOverlay
            className="confirm-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeConfirm(false);
            }}
          >
            <MotionModal className="confirm-modal" role="alertdialog" aria-modal="true">
              <p className="confirm-message">{confirmState.message}</p>
              {confirmState.detail && <p className="hint confirm-detail">{confirmState.detail}</p>}
              <div className="row confirm-actions">
                <button className="btn btn-ghost" onClick={() => closeConfirm(false)}>
                  {confirmState.cancelLabel}
                </button>
                <button
                  className={`btn ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`}
                  autoFocus
                  onClick={() => closeConfirm(true)}
                >
                  {confirmState.confirmLabel}
                </button>
              </div>
            </MotionModal>
          </MotionOverlay>
        )}
      </AnimatePresence>
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI debe usarse dentro de <UIProvider>');
  return ctx;
}
