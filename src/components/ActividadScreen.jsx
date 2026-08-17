import React, { useState, useMemo } from 'react';
import { fmtMoney, fmtDateTime } from '../utils.js';
import Pager, { usePager } from './Pager.jsx';

const TIPOS_MOVIMIENTO = ['Envío a contador', 'Retiro de caja', 'Cambio de sinpe'];

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
    key: 'apartados',
    titulo: '🛍️ Apartados en tienda',
    match: (a) => ['Agregó apartado', 'Cambió estado de apartado', 'Eliminó apartado'].includes(a),
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

const CATEGORIAS_PARALELAS = CATEGORIAS.filter((c) => c.key !== 'caja');

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function categoriaDe(accion) {
  return CATEGORIAS.find((c) => c.match(accion))?.key || 'otros';
}

// La "detalle" de un movimiento de caja guarda el monto ya formateado (ej "₡10 000 · nota").
// Extraemos solo los dígitos para poder sumarlos en el calendario.
function parseMontoFromDetalle(detalle) {
  if (!detalle) return 0;
  const m = detalle.match(/₡\s*([\d.,\s]+)/);
  if (!m) return 0;
  const digits = m[1].replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function TablaActividad({ titulo, items }) {
  const { pageItems, page, setPage, totalPages } = usePager(items, 10);
  if (items.length === 0) return null;
  return (
    <div className="cat-card" style={{ marginBottom: 0 }}>
      <div className="section-label">
        {titulo} ({items.length})
      </div>
      <div className="table-wrap table-excel">
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
            {pageItems.map((a) => (
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
      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

function CajaCalendario({ items }) {
  const [mes, setMes] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [diaSel, setDiaSel] = useState(null);

  const porDia = useMemo(() => {
    const map = {};
    for (const a of items) {
      const key = dayKey(a.created_at);
      if (!map[key]) map[key] = { count: 0, total: 0, items: [] };
      map[key].count += 1;
      map[key].total += parseMontoFromDetalle(a.detalle);
      map[key].items.push(a);
    }
    return map;
  }, [items]);

  const hoyKey = dayKey(new Date().toISOString());

  const celdas = useMemo(() => {
    const year = mes.getFullYear();
    const month = mes.getMonth();
    const primerDia = new Date(year, month, 1);
    const inicioSemana = (primerDia.getDay() + 6) % 7; // lunes = 0
    const diasEnMes = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < inicioSemana; i++) cells.push(null);
    for (let d = 1; d <= diasEnMes; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, key, data: porDia[key] || null });
    }
    return cells;
  }, [mes, porDia]);

  const cambiarMes = (delta) => {
    setDiaSel(null);
    setMes((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const irAHoy = () => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    setMes(d);
    setDiaSel(hoyKey);
  };

  const prefixMes = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}`;

  const totalMes = useMemo(
    () => Object.entries(porDia).reduce((sum, [key, v]) => (key.startsWith(prefixMes) ? sum + v.total : sum), 0),
    [porDia, prefixMes]
  );

  const itemsMostrados = useMemo(() => {
    if (diaSel) return porDia[diaSel]?.items || [];
    return items
      .filter((a) => dayKey(a.created_at).startsWith(prefixMes))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [diaSel, porDia, prefixMes, items]);

  const { pageItems, page, setPage, totalPages } = usePager(itemsMostrados, 10);

  const labelMes = mes.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' });
  const labelDiaSel = diaSel
    ? new Date(`${diaSel}T00:00:00`).toLocaleDateString('es-CR', { weekday: 'long', day: '2-digit', month: 'long' })
    : null;

  return (
    <div>
      <div className="mini-cal">
        <div className="mini-cal-head">
          <div className="label">{labelMes}</div>
          <div className="mini-cal-nav">
            <button type="button" onClick={() => cambiarMes(-1)} title="Mes anterior">
              ←
            </button>
            <button
              type="button"
              onClick={irAHoy}
              style={{
                padding: '0 8px',
                height: 26,
                fontSize: 11,
                fontWeight: 700,
                border: '1px solid var(--line-dark)',
                borderRadius: 7,
                background: '#fff',
                color: '#475467',
              }}
            >
              Hoy
            </button>
            <button type="button" onClick={() => cambiarMes(1)} title="Mes siguiente">
              →
            </button>
          </div>
        </div>

        <div className="mini-cal-grid">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="mini-cal-dow">
              {d}
            </div>
          ))}
          {celdas.map((c, i) =>
            c === null ? (
              <div key={`empty-${i}`} className="mini-cal-cell empty" />
            ) : (
              <div
                key={c.key}
                className={
                  'mini-cal-cell' +
                  (c.data ? ' has-data' : '') +
                  (c.key === hoyKey ? ' today' : '') +
                  (c.key === diaSel ? ' selected' : '')
                }
                onClick={() => c.data && setDiaSel(diaSel === c.key ? null : c.key)}
                title={c.data ? `${c.data.count} movimiento(s)` : ''}
              >
                <span className="num">{c.day}</span>
                {c.data && (
                  <>
                    <span className="amt">{fmtMoney(c.data.total)}</span>
                    <span className="cnt">{c.data.count === 1 ? '1 mov.' : `${c.data.count} movs.`}</span>
                  </>
                )}
              </div>
            )
          )}
        </div>

        <div className="mini-cal-foot">
          <span className="hint" style={{ margin: 0 }}>
            {diaSel ? 'Mostrando ese día · click de nuevo para ver todo el mes' : 'Click en un día para ver el detalle'}
          </span>
          <span style={{ fontWeight: 750, fontSize: 13, color: 'var(--ink)' }}>Total mes: {fmtMoney(totalMes)}</span>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="section-label">
          {diaSel ? `Movimientos · ${labelDiaSel}` : `Movimientos · ${labelMes}`} ({itemsMostrados.length})
        </div>
        {itemsMostrados.length === 0 ? (
          <div className="empty-col">Sin movimientos en este periodo.</div>
        ) : (
          <>
            <div className="table-wrap table-excel">
              <table>
                <thead>
                  <tr>
                    <th>Quién</th>
                    <th>Tipo</th>
                    <th>Detalle</th>
                    <th>Cuándo</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((a) => (
                    <tr key={a.id}>
                      <td>{a.trabajador_nombre || (a.profile_role === 'cotizador' ? 'Cyber' : 'Ocampo')}</td>
                      <td>{a.accion.replace('💰 ', '')}</td>
                      <td className="item-notas">{a.detalle}</td>
                      <td className="item-time">{fmtDateTime(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
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
      <div className="caja-layout">
        <div className="auth-card" style={{ padding: 20, marginBottom: 0 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>
            Registrar movimiento de caja
          </div>
          <form onSubmit={registrarMovimiento}>
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
            <div className="field">
              <label>Nota (opcional)</label>
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: entregado en mano a don Carlos" />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Registrando…' : 'Registrar'}
            </button>
          </form>
        </div>

        <CajaCalendario items={grupos.caja || []} />
      </div>

      <p className="hint" style={{ marginBottom: 16 }}>
        Separado por tipo para que sea más fácil de revisar.
      </p>

      <div className="parallel-grid">
        {CATEGORIAS_PARALELAS.map((cat) => (
          <TablaActividad key={cat.key} titulo={cat.titulo} items={grupos[cat.key] || []} />
        ))}
        <TablaActividad titulo="🗂️ Otros" items={grupos.otros || []} />
      </div>

      {actividad.length === 0 && <div className="empty-col">Aún no hay actividad registrada.</div>}
    </div>
  );
}
