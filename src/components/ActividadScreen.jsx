import React, { useState } from 'react';
import { api } from '../supabaseClient.js';
import { fmtMoney, fmtDateTime } from '../utils.js';

const TIPOS_MOVIMIENTO = ['Envío a contador', 'Retiro de caja', 'Depósito a caja', 'Otro'];

export default function ActividadScreen({ profile, activeWorker, actividad, reload, log }) {
  const [tipo, setTipo] = useState(TIPOS_MOVIMIENTO[0]);
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  const registrarMovimiento = async (e) => {
    e.preventDefault();
    if (!monto && !nota.trim()) return;
    setBusy(true);
    const detalle = [monto ? fmtMoney(Number(monto)) : null, nota.trim() || null].filter(Boolean).join(' · ');
    await log(`💰 ${tipo}`, detalle);
    await reload();
    setMonto('');
    setNota('');
    setBusy(false);
  };

  return (
    <div>
      <div className="auth-card" style={{ maxWidth: 480, marginBottom: 22, padding: 20 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>
          Registrar movimiento de caja
        </div>
        <form onSubmit={registrarMovimiento}>
          <div className="row">
            <div className="field">
              <label>Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_MOVIMIENTO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Monto</label>
              <input type="number" min="0" step="any" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="₡" />
            </div>
          </div>
          <div className="field">
            <label>Nota (opcional)</label>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: entregado en mano a don Carlos" />
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Registrando…' : 'Registrar'}
          </button>
        </form>
      </div>

      <p className="hint" style={{ marginBottom: 16 }}>
        Registro de movimientos de caja y acciones del sistema, para que todo Cyber lo vea.
      </p>
      <div className="prov-list">
        {actividad.map((a) => (
          <div className="prov-row" key={a.id}>
            <div>
              <div className="name">
                {a.trabajador_nombre || (a.profile_role === 'cotizador' ? 'Cyber' : 'Ocampo')} · {a.accion}
              </div>
              <div className="sub">
                {a.detalle} · {fmtDateTime(a.created_at)}
              </div>
            </div>
          </div>
        ))}
        {actividad.length === 0 && <div className="empty-col">Aún no hay actividad registrada.</div>}
      </div>
    </div>
  );
}
