import React, { useState, useMemo } from 'react';
import { fmtMoney, fmtDateTime } from '../utils.js';

const TIPOS_MOVIMIENTO = ['Envío a contador', 'Retiro de caja', 'Depósito a caja', 'Otro'];

const CATEGORIAS = [
  { key: 'caja', titulo: '💰 Caja y movimientos', match: (a) => a.startsWith('💰') },
  { key: 'cotizaciones', titulo: '📋 Cotizaciones', match: (a) => ['Nueva cotización', 'Cambió estado'].includes(a) },
  {
    key: 'productos',
    titulo: '📦 Productos',
    match: (a) => ['Agregó producto', 'Agregó producto cotizado', 'Editó producto', 'Eliminó producto'].includes(a),
  },
  {
    key: 'faltantes',
    titulo: '🔍 Faltantes en tienda',
    match: (a) => ['Agregó faltante', 'Reportó faltante otra vez', 'Resolvió faltante', 'Reabrió faltante', 'Eliminó faltante'].includes(a),
  },
  {
    key: 'equipo',
    titulo: '👥 Equipo',
    match: (a) =>
      ['Agregó a equipo', 'Desactivó persona', 'Activó persona', 'Hizo administrador', 'Quitó administrador', 'Cambió PIN', 'Eliminó de equipo'].includes(
        a
      ),
  },
];

function categoriaDe(accion) {
  return CATEGORIAS.find((c) => c.match(accion))?.key || 'otros';
}

function TablaActividad({ titulo, items }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 26 }}>
      <div className="section-label">
        {titulo} ({items.length})
      </div>
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Quién</th>
            <th>Acción</th>
            <th>Detalle</th>
            <th>Cuándo</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td>{a.trabajador_nombre || (a.profile_role === 'cotizador' ? 'Cyber' : 'Ocampo')}</td>
              <td>{a.accion}</td>
              <td className="item-notas">{a.detalle}</td>
              <td className="item-time">{fmtDateTime(a.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

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

  const grupos = useMemo(() => {
    const porCategoria = {};
    for (const a of actividad) {
      const key = categoriaDe(a.accion);
      if (!porCategoria[key]) porCategoria[key] = [];
      porCategoria[key].push(a);
    }
    return porCategoria;
  }, [actividad]);

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
        Separado por tipo para que sea más fácil de revisar.
      </p>

      {CATEGORIAS.map((cat) => (
        <TablaActividad key={cat.key} titulo={cat.titulo} items={grupos[cat.key] || []} />
      ))}
      <TablaActividad titulo="🗂️ Otros" items={grupos.otros || []} />

      {actividad.length === 0 && <div className="empty-col">Aún no hay actividad registrada.</div>}
    </div>
  );
}
