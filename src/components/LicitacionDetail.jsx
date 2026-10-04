import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../supabaseClient.js';
import { ESTADOS_LICITACION, estadoLicitacionInfo, fmtMoney, fmtFecha } from '../utils.js';
import { aNumero, exportarLicitacion, sugerir } from '../excel.js';
import { PlazoChip } from './LicitacionesScreen.jsx';
import Pager, { usePager } from './Pager.jsx';
import FormModal from './FormModal.jsx';
import Icon from './Icons.jsx';
import { useUI } from './UIProvider.jsx';
import { AnimatePresence } from './Motion.jsx';

const POR_PAGINA = 50;
const CHEQUEO = 30000;

// Historial de lo ya cotizado (licitaciones anteriores + cotizaciones), para
// sugerir producto/proveedor/precio. Se pide una vez y se reutiliza 10 min.
let historialCache = { ts: 0, datos: null };

async function cargarHistorial() {
  if (historialCache.datos && Date.now() - historialCache.ts < 10 * 60 * 1000) return historialCache.datos;
  const [lic, cot] = await Promise.all([
    api
      .get(
        'licitacion_items?select=licitacion_id,descripcion,producto_ofrecido,proveedor_nombre,precio_unitario,updated_at' +
          '&precio_unitario=not.is.null&order=updated_at.desc&limit=2000'
      )
      .catch(() => []),
    api
      .get(
        'cotizacion_items?select=producto,descripcion,precio_final,created_at,proveedor:proveedores(nombre)' +
          '&precio_final=not.is.null&order=created_at.desc&limit=2000'
      )
      .catch(() => []),
  ]);
  const datos = [
    ...lic.map((h) => ({
      licitacion_id: h.licitacion_id,
      texto: `${h.descripcion || ''} ${h.producto_ofrecido || ''}`,
      producto: h.producto_ofrecido || h.descripcion || '',
      proveedor: h.proveedor_nombre || '',
      precio: Number(h.precio_unitario),
      fecha: h.updated_at,
      origen: 'Licitación',
    })),
    ...cot.map((h) => ({
      texto: `${h.producto || ''} ${h.descripcion || ''}`,
      producto: h.producto || '',
      proveedor: h.proveedor?.nombre || '',
      precio: Number(h.precio_final),
      fecha: h.created_at,
      origen: 'Cotización',
    })),
  ];
  historialCache = { ts: Date.now(), datos };
  return datos;
}

export function invalidarHistorial() {
  historialCache = { ts: 0, datos: null };
}

const fmtNumero = (n) => new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(n);

/**
 * Celda editable que guarda al salir (blur) o con Enter, y no se pisa con
 * datos que llegan de la otra área mientras alguien escribe en ella.
 * `multiline` usa un textarea que crece con el texto (descripciones largas).
 * Los números se muestran con separador de miles mientras no se editan.
 */
function Celda({ value, onSave, numeric = false, multiline = false, placeholder = '', list, ariaLabel }) {
  const texto = value === null || value === undefined ? '' : String(value);
  const [v, setV] = useState(texto);
  const [enfocado, setEnfocado] = useState(false);

  useEffect(() => {
    if (!enfocado) setV(texto);
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    setEnfocado(false);
    if (v.trim() === texto.trim()) return;
    onSave(numeric ? aNumero(v) : v.trim() || null);
  };

  const n = numeric && !enfocado ? aNumero(v) : null;
  const mostrado = n !== null ? fmtNumero(n) : v;

  const props = {
    className: `celda${numeric ? ' num' : ''}${multiline ? ' multi' : ''}`,
    value: mostrado,
    placeholder,
    'aria-label': ariaLabel,
    onFocus: () => setEnfocado(true),
    onChange: (e) => setV(e.target.value),
    onBlur: commit,
    onKeyDown: (e) => {
      // En celdas de varias líneas, Shift+Enter hace salto de línea.
      if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
        e.preventDefault();
        e.currentTarget.blur();
      }
      if (e.key === 'Escape') {
        setV(texto);
        setEnfocado(false);
        e.currentTarget.blur();
      }
    },
  };

  if (multiline) return <textarea rows={1} {...props} />;
  return <input {...props} inputMode={numeric ? 'decimal' : undefined} list={list} />;
}

function Sugerencias({ lista, onUsar }) {
  const [abierto, setAbierto] = useState(false);
  if (!lista.length) return null;
  const visibles = abierto ? lista : lista.slice(0, 1);
  return (
    <div className="sug">
      {visibles.map((s, i) => (
        <div key={i} className="sug-item">
          <Icon name="chispa" size={12} />
          <span className="sug-text" title={`${s.origen} · ${new Date(s.fecha).toLocaleDateString('es-CR')}`}>
            {s.producto}
            {s.proveedor ? ` · ${s.proveedor}` : ''} · <b className="num">{fmtMoney(s.precio)}</b>
          </span>
          <button type="button" className="sug-usar" onClick={() => onUsar(s)}>
            Usar
          </button>
        </div>
      ))}
      {lista.length > 1 && (
        <button type="button" className="sug-mas" onClick={() => setAbierto(!abierto)}>
          {abierto ? 'Ver menos' : `+${lista.length - 1} más`}
        </button>
      )}
    </div>
  );
}

function EditarDatos({ lic, onClose, onSave }) {
  const [titulo, setTitulo] = useState(lic.titulo || '');
  const [institucion, setInstitucion] = useState(lic.institucion || '');
  const [codigo, setCodigo] = useState(lic.codigo || '');
  const [fecha, setFecha] = useState(lic.fecha_limite || '');
  const [notas, setNotas] = useState(lic.notas || '');
  const [busy, setBusy] = useState(false);
  return (
    <FormModal title="Datos de la licitación" onClose={onClose} maxWidth={480}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!titulo.trim()) return;
          setBusy(true);
          await onSave({
            titulo: titulo.trim(),
            institucion: institucion.trim(),
            codigo: codigo.trim() || null,
            fecha_limite: fecha || null,
            notas: notas.trim() || null,
          });
          setBusy(false);
        }}
      >
        <div className="field">
          <label>Nombre</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Institución</label>
          <input value={institucion} onChange={(e) => setInstitucion(e.target.value)} />
        </div>
        <div className="row">
          <div className="field">
            <label>Número / código</label>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </div>
          <div className="field">
            <label>Fecha límite</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Condiciones, garantía, lugar de entrega…" />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !titulo.trim()}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </FormModal>
  );
}

export default function LicitacionDetail({ id, activeWorker, proveedores, onBack, onChanged, log }) {
  const { toast, confirmar } = useUI();
  const [lic, setLic] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState({}); // itemId -> 'saving' | 'saved' | 'error'
  const [q, setQ] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [verTodas, setVerTodas] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [editando, setEditando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const ultimaFirma = useRef('');

  const cargar = useCallback(async () => {
    const [cab, filas] = await Promise.all([
      api.get(`licitaciones?id=eq.${id}&select=*`),
      api.get(`licitacion_items?licitacion_id=eq.${id}&select=*&order=orden.asc`),
    ]);
    if (!cab[0]) throw new Error('La licitación ya no existe.');
    ultimaFirma.current = cab[0].updated_at;
    setLic(cab[0]);
    setItems(filas);
  }, [id]);

  useEffect(() => {
    cargar().catch((ex) => setError(ex.message));
    cargarHistorial().then(setHistorial);
  }, [cargar]);

  // Si alguien más (la otra área) está llenando la misma licitación, sus
  // cambios aparecen solos. Se pregunta solo la fecha del último cambio
  // (unos bytes) y se baja todo únicamente si cambió.
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const [cab] = await api.get(`licitaciones?id=eq.${id}&select=updated_at`);
        if (cab && cab.updated_at !== ultimaFirma.current) await cargar();
      } catch (ex) {
        // se reintenta en el próximo ciclo
      }
    }, CHEQUEO);
    return () => clearInterval(t);
  }, [id, cargar]);

  const nombresProveedores = useMemo(() => {
    const set = new Set(proveedores.map((p) => p.nombre));
    for (const it of items) if (it.proveedor_nombre) set.add(it.proveedor_nombre);
    for (const h of historial) if (h.proveedor) set.add(h.proveedor);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [proveedores, items, historial]);

  const historialOtras = useMemo(() => historial.filter((h) => h.licitacion_id !== id), [historial, id]);

  const guardar = async (item, cambios) => {
    const antes = item;
    const nuevo = { ...item, ...cambios };
    setItems((prev) => prev.map((it) => (it.id === item.id ? nuevo : it)));
    setGuardando((g) => ({ ...g, [item.id]: 'saving' }));
    try {
      await api.patch(`licitacion_items?id=eq.${item.id}`, {
        ...cambios,
        editado_por_nombre: activeWorker ? activeWorker.nombre : null,
      });
      setGuardando((g) => ({ ...g, [item.id]: 'saved' }));
      setTimeout(() => setGuardando((g) => (g[item.id] === 'saved' ? { ...g, [item.id]: undefined } : g)), 1600);
      // Nuestro propio cambio toca updated_at; se actualiza la firma para no
      // volver a bajar todo en el próximo chequeo solo por esto.
      api
        .get(`licitaciones?id=eq.${id}&select=updated_at`)
        .then(([c]) => c && (ultimaFirma.current = c.updated_at))
        .catch(() => {});
      if ('precio_unitario' in cambios) invalidarHistorial();
      onChanged();
    } catch (ex) {
      setItems((prev) => prev.map((it) => (it.id === item.id ? antes : it)));
      setGuardando((g) => ({ ...g, [item.id]: 'error' }));
      toast('No se guardó el cambio: ' + ex.message, 'error');
    }
  };

  const guardarColumnaOriginal = (item, col, valor) => {
    const datos = { ...(item.datos || {}) };
    if (valor === null) delete datos[col];
    else datos[col] = valor;
    const cambios = { datos };
    if (col === lic.col_descripcion) cambios.descripcion = valor === null ? null : String(valor);
    if (col === lic.col_cantidad) cambios.cantidad = aNumero(valor);
    guardar(item, cambios);
  };

  const guardarProveedor = (item, nombre) => {
    const match = nombre ? proveedores.find((p) => p.nombre.toLowerCase() === nombre.toLowerCase()) : null;
    guardar(item, { proveedor_nombre: match ? match.nombre : nombre, proveedor_id: match ? match.id : null });
  };

  const usarSugerencia = (item, s) => {
    const match = s.proveedor ? proveedores.find((p) => p.nombre.toLowerCase() === s.proveedor.toLowerCase()) : null;
    guardar(item, {
      producto_ofrecido: s.producto || null,
      proveedor_nombre: s.proveedor || null,
      proveedor_id: match ? match.id : null,
      precio_unitario: Number.isFinite(s.precio) ? s.precio : null,
    });
  };

  const actualizarCabecera = async (cambios, accionLog) => {
    try {
      const [act] = await api.patch(`licitaciones?id=eq.${id}`, cambios);
      setLic(act);
      ultimaFirma.current = act.updated_at;
      onChanged();
      if (accionLog) await log(accionLog[0], accionLog[1]);
      return true;
    } catch (ex) {
      toast('No se pudo guardar: ' + ex.message, 'error');
      return false;
    }
  };

  const agregarRenglon = async () => {
    try {
      const orden = items.reduce((m, it) => Math.max(m, it.orden || 0), 0) + 1;
      const [nuevo] = await api.post('licitacion_items', { licitacion_id: id, orden, datos: {} });
      setItems((prev) => [...prev, nuevo]);
      setQ('');
      setSoloPendientes(false);
      onChanged();
    } catch (ex) {
      toast('No se pudo agregar el renglón: ' + ex.message, 'error');
    }
  };

  const eliminarRenglon = async (item) => {
    const ok = await confirmar(`¿Eliminar el renglón ${item.orden}?`, {
      detail: item.descripcion || undefined,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await api.del(`licitacion_items?id=eq.${item.id}`);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      onChanged();
    } catch (ex) {
      toast('No se pudo eliminar: ' + ex.message, 'error');
    }
  };

  const eliminarLicitacion = async () => {
    const ok = await confirmar(`¿Eliminar la licitación "${lic.titulo}"?`, {
      detail: `Se borran también sus ${items.length} renglones con lo cotizado. No se puede deshacer.`,
      confirmLabel: 'Eliminar licitación',
    });
    if (!ok) return;
    try {
      await api.del(`licitaciones?id=eq.${id}`);
      await log('Eliminó licitación', `L-${lic.folio} · ${lic.titulo}`);
      onChanged();
      onBack();
    } catch (ex) {
      toast('No se pudo eliminar: ' + ex.message, 'error');
    }
  };

  const exportar = async () => {
    setExportando(true);
    try {
      await exportarLicitacion(lic, items);
    } catch (ex) {
      toast('No se pudo generar el Excel: ' + ex.message, 'error');
    } finally {
      setExportando(false);
    }
  };

  const columnasVisibles = useMemo(() => {
    if (!lic) return [];
    const todas = lic.columnas || [];
    if (verTodas || todas.length <= 4) return todas;
    const clave = [lic.col_descripcion, lic.col_cantidad, lic.col_unidad].filter((c) => c && todas.includes(c));
    return clave.length ? todas.filter((c) => clave.includes(c)) : todas.slice(0, 3);
  }, [lic, verTodas]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((it) => {
      if (soloPendientes && it.precio_unitario !== null && it.precio_unitario !== undefined) return false;
      if (!t) return true;
      const hay = [it.descripcion, it.producto_ofrecido, it.proveedor_nombre, it.notas, String(it.orden), ...Object.values(it.datos || {})]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return hay.includes(t);
    });
  }, [items, q, soloPendientes]);

  const { pageItems, page, setPage, totalPages } = usePager(filtrados, POR_PAGINA);

  // Sugerencias solo de la página visible y solo de renglones sin precio.
  // Comparar contra miles de registros del historial no es gratis, así que se
  // recalcula únicamente cuando cambia la página o llega el historial.
  const sugerenciasPagina = useMemo(() => {
    const map = {};
    for (const it of pageItems) {
      if (it.precio_unitario !== null && it.precio_unitario !== undefined) continue;
      map[it.id] = sugerir(`${it.descripcion || ''} ${it.producto_ofrecido || ''}`, historialOtras);
    }
    return map;
  }, [pageItems, historialOtras]);

  useEffect(() => {
    setPage(1);
  }, [q, soloPendientes]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumen = useMemo(() => {
    const cotizados = items.filter((it) => it.precio_unitario !== null && it.precio_unitario !== undefined);
    const total = cotizados.reduce((s, it) => s + Number(it.precio_unitario) * Number(it.cantidad ?? 1), 0);
    const provs = new Set(cotizados.map((it) => it.proveedor_nombre).filter(Boolean));
    return {
      cotizados: cotizados.length,
      total,
      proveedores: provs.size,
      pct: items.length ? Math.round((cotizados.length / items.length) * 100) : 0,
    };
  }, [items]);

  if (error) {
    return (
      <div className="lic-detail">
        <button type="button" className="back-link" onClick={onBack}>
          <Icon name="atras" size={16} /> Licitaciones
        </button>
        <div className="err">{error}</div>
      </div>
    );
  }

  if (!lic) {
    return (
      <div className="lic-detail">
        <button type="button" className="back-link" onClick={onBack}>
          <Icon name="atras" size={16} /> Licitaciones
        </button>
        <div className="lic-head skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ height: 320, borderRadius: 16 }} />
      </div>
    );
  }

  const est = estadoLicitacionInfo(lic.estado);
  const totalCols = 1 + columnasVisibles.length + 6;

  return (
    <div className="lic-detail">
      <button type="button" className="back-link" onClick={onBack}>
        <Icon name="atras" size={16} /> Licitaciones
      </button>

      <header className="lic-head">
        <div className="lic-head-text">
          <div className="lic-row-top">
            <span className="lic-folio">L-{lic.folio}</span>
            {lic.codigo && <span className="lic-codigo">{lic.codigo}</span>}
            {lic.archivo_nombre && <span className="lic-codigo">{lic.archivo_nombre}</span>}
          </div>
          <h2>{lic.titulo}</h2>
          <p>
            {lic.institucion || 'Sin institución'}
            {lic.fecha_limite ? ` · Fecha límite ${fmtFecha(lic.fecha_limite)}` : ''}
          </p>
          {lic.notas && <p className="lic-notas">{lic.notas}</p>}
        </div>
        <div className="lic-head-actions">
          <select
            className="estado-select"
            style={{ '--ec': est.color }}
            value={lic.estado}
            aria-label="Estado de la licitación"
            onChange={(e) =>
              actualizarCabecera({ estado: e.target.value }, [
                'Cambió estado de licitación',
                `L-${lic.folio} → ${estadoLicitacionInfo(e.target.value).label}`,
              ])
            }
          >
            {ESTADOS_LICITACION.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(true)}>
            Editar datos
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={exportar} disabled={exportando}>
            <Icon name="bajar" size={15} />
            {exportando ? 'Generando…' : 'Descargar Excel'}
          </button>
        </div>
      </header>

      <section className="lic-stats" aria-label="Resumen">
        <div className="lic-stat lic-stat-wide">
          <span className="lic-stat-label">Renglones cotizados</span>
          <span className="lic-stat-value num">
            {resumen.cotizados}
            <small>/{items.length}</small>
          </span>
          <div className="lic-progress-bar">
            <span style={{ width: `${resumen.pct}%` }} />
          </div>
        </div>
        <div className="lic-stat">
          <span className="lic-stat-label">Total de la oferta</span>
          <span className="lic-stat-value num">{fmtMoney(resumen.total)}</span>
        </div>
        <div className="lic-stat">
          <span className="lic-stat-label">Proveedores</span>
          <span className="lic-stat-value num">{resumen.proveedores}</span>
        </div>
        <div className="lic-stat">
          <span className="lic-stat-label">Plazo</span>
          <span className="lic-stat-value lic-stat-plazo">
            {lic.fecha_limite ? <PlazoChip fecha={lic.fecha_limite} /> : <span className="hint">Sin fecha</span>}
          </span>
        </div>
      </section>

      <div className="lic-toolbar">
        <label className="search-box">
          <Icon name="buscar" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en los renglones" aria-label="Buscar renglón" />
        </label>
        <div className="lic-toolbar-right">
          <label className="toggle">
            <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
            Solo sin precio
          </label>
          {(lic.columnas || []).length > 4 && (
            <label className="toggle">
              <input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)} />
              Todas las columnas del Excel ({lic.columnas.length})
            </label>
          )}
        </div>
      </div>

      <datalist id={`lic-prov-${id}`}>
        {nombresProveedores.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="lic-grid-wrap">
        <table className="lic-grid">
          <thead>
            <tr>
              <th className="col-n">#</th>
              {columnasVisibles.map((c) => (
                <th key={c} className="col-orig">
                  {c}
                </th>
              ))}
              <th className="col-add col-producto">Producto ofrecido</th>
              <th className="col-add col-proveedor">Proveedor</th>
              <th className="col-add col-precio">Precio unit.</th>
              <th className="col-add col-total">Total</th>
              <th className="col-add col-notas">Notas</th>
              <th className="col-x" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="lic-grid-empty">
                  {items.length ? 'Ningún renglón coincide.' : 'Esta licitación no tiene renglones.'}
                </td>
              </tr>
            )}
            {pageItems.map((it) => {
              const tienePrecio = it.precio_unitario !== null && it.precio_unitario !== undefined;
              const total = tienePrecio ? Number(it.precio_unitario) * Number(it.cantidad ?? 1) : null;
              const sugs = sugerenciasPagina[it.id] || [];
              const estado = guardando[it.id];
              return (
                <tr key={it.id} className={tienePrecio ? 'is-done' : ''}>
                  <td className="col-n">
                    <span className={`row-dot ${estado || (tienePrecio ? 'done' : '')}`} title={estado === 'error' ? 'No se guardó' : undefined} />
                    {it.orden}
                  </td>
                  {columnasVisibles.map((c) => (
                    <td key={c} className={`col-orig${c === lic.col_descripcion ? ' col-desc' : ''}`}>
                      <Celda
                        value={it.datos?.[c]}
                        numeric={c === lic.col_cantidad}
                        multiline={c === lic.col_descripcion}
                        ariaLabel={`${c}, renglón ${it.orden}`}
                        onSave={(v) => guardarColumnaOriginal(it, c, v)}
                      />
                    </td>
                  ))}
                  <td className="col-add col-producto">
                    <Celda
                      value={it.producto_ofrecido}
                      placeholder="Marca / modelo"
                      multiline
                      ariaLabel={`Producto ofrecido, renglón ${it.orden}`}
                      onSave={(v) => guardar(it, { producto_ofrecido: v })}
                    />
                    <Sugerencias lista={sugs} onUsar={(s) => usarSugerencia(it, s)} />
                  </td>
                  <td className="col-add col-proveedor">
                    <Celda
                      value={it.proveedor_nombre}
                      placeholder="Proveedor"
                      list={`lic-prov-${id}`}
                      ariaLabel={`Proveedor, renglón ${it.orden}`}
                      onSave={(v) => guardarProveedor(it, v)}
                    />
                  </td>
                  <td className="col-add col-precio">
                    <Celda
                      value={it.precio_unitario}
                      numeric
                      placeholder="₡"
                      ariaLabel={`Precio unitario, renglón ${it.orden}`}
                      onSave={(v) => guardar(it, { precio_unitario: v })}
                    />
                  </td>
                  <td className="col-add col-total num">{total === null ? '—' : fmtMoney(total)}</td>
                  <td className="col-add col-notas">
                    <Celda
                      value={it.notas}
                      placeholder="—"
                      ariaLabel={`Notas, renglón ${it.orden}`}
                      onSave={(v) => guardar(it, { notas: v })}
                    />
                  </td>
                  <td className="col-x">
                    <button type="button" className="icon-btn" onClick={() => eliminarRenglon(it)} title="Eliminar renglón" aria-label={`Eliminar renglón ${it.orden}`}>
                      <Icon name="basura" size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="lic-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={agregarRenglon}>
          <Icon name="mas" size={15} /> Agregar renglón
        </button>
        <Pager page={page} totalPages={totalPages} onChange={setPage} />
        <button type="button" className="btn btn-danger btn-sm" onClick={eliminarLicitacion}>
          Eliminar licitación
        </button>
      </div>

      <AnimatePresence>
        {editando && (
          <EditarDatos
            key="editar-licitacion"
            lic={lic}
            onClose={() => setEditando(false)}
            onSave={async (cambios) => {
              if (await actualizarCabecera(cambios)) setEditando(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
