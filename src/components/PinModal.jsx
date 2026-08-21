import React, { useState } from 'react';
import { MotionOverlay, MotionModal } from './Motion.jsx';

export default function PinModal({ title, subtitle, confirmLabel = 'Confirmar', onSubmit, onCancel }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setErr('');
    setBusy(true);
    try {
      await onSubmit(pin.trim());
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MotionOverlay
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <MotionModal style={{ maxWidth: 340 }}>
        <div className="modal-top">
          <h2>{title}</h2>
          <button className="x-btn" onClick={onCancel}>
            ✕
          </button>
        </div>
        {subtitle && <p className="hint" style={{ marginBottom: 12 }}>{subtitle}</p>}
        {err && <div className="err">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>PIN</label>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Verificando…' : confirmLabel}
          </button>
        </form>
      </MotionModal>
    </MotionOverlay>
  );
}
