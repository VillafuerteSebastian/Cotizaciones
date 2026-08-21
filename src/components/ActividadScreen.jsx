import React, { useState, useMemo, useEffect } from 'react';
import { fmtMoney, fmtDateTime } from '../utils.js';
import Pager, { usePager } from './Pager.jsx';
import FormModal from './FormModal.jsx';

const TIPOS_MOVIMIENTO = ['Envío a contador', 'Retiro de caja', 'Cambio de sinpe'];

const CATEGORIAS = [
  { key: 'caja', titulo: '💰 Caja y movimientos', corto: 'Caja', match: (a) => a.startsWith('💰') },
  { key: 'cotizaciones', titulo: '📋 Cotizaciones', corto: 'Cotizaciones', match: (a) => ['Nueva cotización', 'Cambió estado'].includes(a) },
  {
    key: 'productos',
    titulo: '📦 Productos',
    corto: 'Productos',
    match: (a) => ['Agregó producto', 'Agregó producto cotizado', 'Editó producto', 'Eliminó producto'].includes(a),
  },
  {
    key: 'faltantes',
    titulo: '🔍 Faltantes en tienda',
    corto: 'Faltantes',
    match: (a) => ['Agregó faltante', 'Reportó faltante otra vez', 'Resolvió faltante', 'Reabrió faltante', 'Eliminó faltante'].includes(a),
  },
  {
    key: 'apartados',
    titulo: '🛍️ Apartados en tienda',
    corto: 'Apartados',
    match: (a) => ['Agregó apartado', 'Cambió estado de apartado', 'Eliminó apartado'].includes(a),
  },
  {
    key: 'equipo',
    titulo: '👥 Equipo',
    corto: 'Equipo',
    match: (a) =>
      ['Agregó a equipo', 'Desactivó persona', 'Activó persona', 'Hizo administrador', 'Quitó administrador', 'Cambió PIN', 'Eliminó de equipo'].includes(
        a
      ),
  },
];

const CATEGORIAS_REGISTRO = CATEGORIAS.filter((c) => c.key !== 'caja');

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const POR_PAGINA_REGISTROS = 20;
const POR_PAGINA_CAJA = 8;

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

function quienDe(a) {
  return a.trabajador_nombre || (a.profile_role === 'cotizador' ? 'Cyber' : 'Ocampo');
}

/** Un registro de actividad mostrado como mensaje, no como fila de tabla. */
function FeedItem({ a, montoVisible }) {
  const quien = quienDe(a);
  const monto = montoVisible ? parseMontoFromDetalle(a.detalle) : 0;
  const accion = a.accion.replace('💰 ', '');
  return (
    <li className="feed-item">
      <span className="feed-avatar" aria-hidden="true">
        {quien.charAt(0).toUpperCase()}
      </span>
      <div className="feed-body">
        <div className="feed-head">
          <strong className="feed-accion">{accion}</strong>
          {monto > 0 && <span className="feed-monto">{fmtMoney(monto)}</span>}
        </div>
        {a.detalle && <p className="feed-detalle">{a.detalle}</p>}
        <div className="feed-foot">
          <span>{quien}</span>
          <span>{fmtDateTime(a.created_at)}</span>
        </div>
      </div>
    </li>
  );
}

function Feed({ items, vacio, pageSize, montoVisible, resetKey }) {
  const { pageItems, page, setPage, totalPages } = usePager(items, pageSize);

  useEffect(() => {
    setPage(1);
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (items.length === 0) return <div className="empty-col">{vacio}</div>;

  return (
    <React.Fragment>
      <ul className="feed-list">
        {pageItems.map((a) => (
          <FeedItem key={a.id} a={a} montoVisible={montoVisible} />
        ))}
      </ul>
      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </React.Fragment>
  );
}

/** Calendario de caja + detalle del día, uno al lado del otro. */
function CajaPanel({ items }) {
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

  const totalMostrado = useMemo(
    () => itemsMostrados.reduce((sum, a) => sum + parseMontoFromDetalle(a.detalle), 0),
    [itemsMostrados]
  );

  const labelMes = mes.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' });
  const labelDiaSel = diaSel
    ? new Date(`${diaSel}T00:00:00`).toLocaleDateString('es-CR', { weekday: 'long', day: '2-digit', month: 'long' })
    : null;

  return (
    <section className="caja-panel">
      <header className="panel-head">
        <div className="panel-head-text">
          <div className="section-label" style={{ marginBottom: 2 }}>
            💰 Caja del mes
          </div>
          <p className="hint" style={{ margin: 0, textTransform: 'capitalize' }}>
            {labelMes}
          </p>
        </div>
        <div className="panel-head-side">
          <span className="panel-total">{fmtMoney(totalMes)}</span>
          <div className="mini-cal-nav">
            <button type="button" onClick={() => cambiarMes(-1)} title="Mes anterior" aria-label="Mes anterior">
              ←
            </button>
            <button type="button" className="mini-cal-hoy" onClick={irAHoy}>
              Hoy
            </button>
            <button type="button" onClick={() => cambiarMes(1)} title="Mes siguiente" aria-label="Mes siguiente">
              →
            </button>
          </div>
        </div>
      </header>

      <div className="caja-grid">
        <div className="mini-cal">
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
                    <React.Fragment>
                      <span className="amt">{fmtMoney(c.data.total)}</span>
                      <span className="cnt">{c.data.count === 1 ? '1 mov.' : `${c.data.count} movs.`}</span>
                    </React.Fragment>
                  )}
                </div>
              )
            )}
          </div>
          <div className="mini-cal-foot">
            <span className="hint" style={{ margin: 0 }}>
              {diaSel ? 'Viendo un día · toca de nuevo para ver todo el mes' : 'Toca un día para ver su detalle'}
            </span>
          </div>
        </div>

        <div className="caja-feed">
          <div className="caja-feed-head">
            <div>
              <div className="section-label" style={{ marginBottom: 2, textTransform: 'capitalize' }}>
                {diaSel ? labelDiaSel : labelMes}
              </div>
              <p className="hint" style={{ margin: 0 }}>
                {itemsMostrados.length === 1 ? '1 movimiento' : `${itemsMostrados.length} movimientos`}
              </p>
            </div>
            <span className="caja-feed-total">{fmtMoney(totalMostrado)}</span>
          </div>
          <Feed
            items={itemsMostrados}
            vacio="Sin movimientos en este periodo."
            pageSize={POR_PAGINA_CAJA}
            montoVisible
            resetKey={`${prefixMes}|${diaSel || ''}`}
          />
        </div>
      </div>
    </section>
  );
}

export default function ActividadScreen({ profile, activeWorker, actividad, reload, log, showForm, onCloseForm }) {
  const [tipo, setTipo] = useState(TIPOS_MOVIMIENTO[0]);
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [filtro, setFiltro] = useState('todas');

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
    onCloseForm();
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

  const registros = useMemo(() => actividad.filter((a) => categoriaDe(a.accion) !== 'caja'), [actividad]);

  const registrosFiltrados = useMemo(() => {
    if (filtro === 'todas') return registros;
    return registros.filter((a) => categoriaDe(a.accion) === filtro);
  }, [registros, filtro]);

  const chips = [
    { key: 'todas', label: 'Todas', count: registros.length },
    ...CATEGORIAS_REGISTRO.map((c) => ({ key: c.key, label: c.titulo, count: (grupos[c.key] || []).length })),
    { key: 'otros', label: '🗂️ Otros', count: (grupos.otros || []).length },
  ];

  return (
    <div className="actividad-screen">
      <CajaPanel items={grupos.caja || []} />

      <section className="registros-panel">
        <header className="panel-head">
          <div className="panel-head-text">
            <div className="section-label" style={{ marginBottom: 2 }}>
              🧾 Registros
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Todo lo que se ha hecho en la app, de lo más nuevo a lo más viejo.
            </p>
          </div>
        </header>

        <div className="act-chips" role="tablist" aria-label="Categorías de actividad">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={filtro === c.key}
              className={`act-chip${filtro === c.key ? ' active' : ''}`}
              onClick={() => setFiltro(c.key)}
            >
              <span>{c.label}</span>
              <b>{c.count}</b>
            </button>
          ))}
        </div>

        <Feed
          items={registrosFiltrados}
          vacio={actividad.length === 0 ? 'Aún no hay actividad registrada.' : 'Sin registros en esta categoría.'}
          pageSize={POR_PAGINA_REGISTROS}
          resetKey={filtro}
        />
      </section>

      {showForm && (
        <FormModal
          title="Movimiento de caja"
          subtitle={activeWorker ? `Registra: ${activeWorker.nombre}` : null}
          onClose={onCloseForm}
          maxWidth={420}
        >
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
              <input type="number" min="0" step="any" autoFocus value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="₡" />
            </div>
            <div className="field">
              <label>Nota (opcional)</label>
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: entregado en mano a don Carlos" />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy || (!monto && !nota.trim())}>
              {busy ? 'Registrando…' : 'Registrar'}
            </button>
          </form>
        </FormModal>
      )}
    </div>
  );
}
