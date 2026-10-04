import React, { useMemo, useRef, useState } from 'react';
import { api } from '../supabaseClient.js';
import { ESTADOS_LICITACION, FLUJO_LICITACION, NO_ADJUDICADA, estadoLicitacionInfo, fmtMoney, fmtFecha, fmtDateTime, diasHasta } from '../utils.js';
import { leerExcel, detectarEncabezado, construirTabla, detectarColumnas, aNumero } from '../excel.js';
import FormModal from './FormModal.jsx';
import Icon from './Icons.jsx';
import { StatusStepper } from './StatusStepper.jsx';
import { useUI } from './UIProvider.jsx';
import { AnimatePresence } from './Motion.jsx';

// Lo que se pinta en la lista: encabezado + cantidad y precio de cada renglón
// (para el avance y el total). Nunca las filas completas del Excel.
export const SELECT_LISTA_LICITACIONES =
  'select=id,folio,titulo,institucion,codigo,fecha_limite,estado,creado_por_nombre,created_at,updated_at,' +
  'licitacion_items(cantidad,precio_unitario)';

const LOTE = 200;

export function resumenLicitacion(l) {
  const items = l.licitacion_items || [];
  const cotizados = items.filter((it) => it.precio_unitario !== null && it.precio_unitario !== undefined).length;
  const total = items.reduce(
    (s, it) => (it.precio_unitario === null || it.precio_unitario === undefined ? s : s + Number(it.precio_unitario) * Number(it.cantidad ?? 1)),
    0
  );
  return { renglones: items.length, cotizados, total, pct: items.length ? Math.round((cotizados / items.length) * 100) : 0 };
}

export function PlazoChip({ fecha }) {
  const d = diasHasta(fecha);
  if (d === null) return null;
  let cls = 'plazo-ok';
  let txt = `Vence en ${d} días`;
  if (d < 0) {
    cls = 'plazo-vencido';
    txt = `Venció hace ${-d} ${-d === 1 ? 'día' : 'días'}`;
  } else if (d === 0) {
    cls = 'plazo-hoy';
    txt = 'Vence hoy';
  } else if (d === 1) {
    cls = 'plazo-hoy';
    txt = 'Vence mañana';
  } else if (d <= 5) {
    cls = 'plazo-pronto';
  }
  return (
    <span className={`plazo-chip ${cls}`} title={fmtFecha(fecha)}>
      <Icon name="calendario" size={13} />
      {txt}
    </span>
  );
}

function LicitacionRow({ l, onOpen }) {
  const est = estadoLicitacionInfo(l.estado);
  const r = resumenLicitacion(l);
  return (
    <button type="button" className="lic-row" onClick={() => onOpen(l.id)}>
      <div className="lic-row-main">
        <div className="lic-row-top">
          <span className="lic-folio">L-{l.folio}</span>
          <span className="lic-estado" style={{ '--ec': est.color }}>
            {est.label}
          </span>
          {l.codigo && <span className="lic-codigo">{l.codigo}</span>}
        </div>
        <h3 className="lic-titulo">{l.titulo}</h3>
        <p className="lic-sub">
          {l.institucion || 'Sin institución'}
          {l.creado_por_nombre ? ` · subida por ${l.creado_por_nombre}` : ''} · {fmtDateTime(l.created_at)}
        </p>
        <div className="lic-row-stepper">
          <StatusStepper estado={l.estado} estados={FLUJO_LICITACION} especial={NO_ADJUDICADA} />
        </div>
      </div>
      <div className="lic-row-side">
        <div className="lic-progress" aria-label={`${r.cotizados} de ${r.renglones} renglones cotizados`}>
          <div className="lic-progress-text">
            <span>
              <b>{r.cotizados}</b>/{r.renglones} cotizados
            </span>
            <span className="num">{fmtMoney(r.total)}</span>
          </div>
          <div className="lic-progress-bar">
            <span style={{ width: `${r.pct}%` }} />
          </div>
        </div>
        {l.estado !== 'adjudicada' && l.estado !== 'no_adjudicada' && <PlazoChip fecha={l.fecha_limite} />}
      </div>
    </button>
  );
}

/** Ventana para subir un Excel y convertirlo en licitación. */
function ImportarLicitacion({ activeWorker, profile, onClose, onCreated }) {
  const { toast } = useUI();
  const inputRef = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [hojas, setHojas] = useState([]);
  const [hojaIdx, setHojaIdx] = useState(0);
  const [filaEnc, setFilaEnc] = useState(0);
  const [mapa, setMapa] = useState({ descripcion: '', cantidad: '', unidad: '' });
  const [titulo, setTitulo] = useState('');
  const [institucion, setInstitucion] = useState('');
  const [codigo, setCodigo] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [arrastrando, setArrastrando] = useState(false);

  const tabla = useMemo(() => {
    const hoja = hojas[hojaIdx];
    if (!hoja) return null;
    return construirTabla(hoja.filas, filaEnc);
  }, [hojas, hojaIdx, filaEnc]);

  const elegirHoja = (idx, lista = hojas) => {
    const hoja = lista[idx];
    if (!hoja) return;
    const enc = detectarEncabezado(hoja.filas);
    setHojaIdx(idx);
    setFilaEnc(enc);
    setMapa(detectarColumnas(construirTabla(hoja.filas, enc).columnas));
  };

  const cargarArchivo = async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xlsm|xls|csv|ods)$/i.test(file.name)) {
      toast('Ese archivo no parece un Excel (.xlsx, .xls, .csv u .ods).', 'error');
      return;
    }
    setLeyendo(true);
    try {
      const lista = (await leerExcel(file)).filter((h) => h.filas.length > 0);
      if (!lista.length) throw new Error('El archivo no tiene filas con datos.');
      setArchivo(file);
      setHojas(lista);
      // Se elige la hoja con más filas: suele ser la del detalle de renglones.
      const mayor = lista.reduce((m, h, i) => (h.filas.length > lista[m].filas.length ? i : m), 0);
      elegirHoja(mayor, lista);
      if (!titulo) setTitulo(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    } catch (ex) {
      toast('No se pudo leer el Excel: ' + ex.message, 'error');
    } finally {
      setLeyendo(false);
    }
  };

  const crear = async (e) => {
    e.preventDefault();
    if (!tabla || !tabla.registros.length || !titulo.trim()) return;
    setBusy(true);
    try {
      const [lic] = await api.post('licitaciones', {
        titulo: titulo.trim(),
        institucion: institucion.trim(),
        codigo: codigo.trim() || null,
        fecha_limite: fechaLimite || null,
        columnas: tabla.columnas,
        col_descripcion: mapa.descripcion || null,
        col_cantidad: mapa.cantidad || null,
        col_unidad: mapa.unidad || null,
        archivo_nombre: archivo ? archivo.name : null,
        creado_por: profile.id,
        creado_por_nombre: activeWorker ? activeWorker.nombre : null,
      });
      const filas = tabla.registros.map((datos, i) => ({
        licitacion_id: lic.id,
        orden: i + 1,
        datos,
        descripcion: mapa.descripcion ? String(datos[mapa.descripcion] ?? '') || null : null,
        cantidad: mapa.cantidad ? aNumero(datos[mapa.cantidad]) : null,
      }));
      for (let i = 0; i < filas.length; i += LOTE) {
        setProgreso(`Guardando renglones ${Math.min(i + LOTE, filas.length)} de ${filas.length}…`);
        await api.postMudo('licitacion_items', filas.slice(i, i + LOTE));
      }
      await onCreated(lic, filas.length);
    } catch (ex) {
      toast('No se pudo crear la licitación: ' + ex.message, 'error');
      setBusy(false);
      setProgreso('');
    }
  };

  const hoja = hojas[hojaIdx];
  const opcionesColumna = tabla ? tabla.columnas : [];

  return (
    <FormModal
      title="Subir licitación"
      subtitle="Sube el Excel tal como llegó. Las columnas originales se conservan; en la app se agregan producto ofrecido, proveedor y precio."
      onClose={busy ? () => {} : onClose}
      maxWidth={tabla ? 860 : 520}
    >
      <form onSubmit={crear}>
        {!tabla && (
          <div
            className={`dropzone${arrastrando ? ' over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              cargarArchivo(e.dataTransfer.files?.[0]);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          >
            <Icon name="subir" size={28} />
            <strong>{leyendo ? 'Leyendo archivo…' : 'Arrastra el Excel aquí'}</strong>
            <span>o toca para elegirlo · .xlsx, .xls, .csv, .ods</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls,.csv,.ods"
          hidden
          onChange={(e) => {
            cargarArchivo(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {tabla && (
          <>
            <div className="import-file">
              <Icon name="licitaciones" size={18} />
              <span className="import-file-name">{archivo?.name}</span>
              <button type="button" className="link-btn" onClick={() => inputRef.current?.click()} disabled={busy}>
                Cambiar archivo
              </button>
            </div>

            <div className="import-grid">
              <div className="field">
                <label>Nombre de la licitación</label>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required placeholder="Ej: Compra de útiles 2026" />
              </div>
              <div className="field">
                <label>Institución</label>
                <input value={institucion} onChange={(e) => setInstitucion(e.target.value)} placeholder="Ej: Liceo de Moravia" />
              </div>
              <div className="field">
                <label>Número / código (opcional)</label>
                <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej: 2026CD-000123" />
              </div>
              <div className="field">
                <label>Fecha límite (opcional)</label>
                <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
              </div>
            </div>

            <div className="import-config">
              {hojas.length > 1 && (
                <div className="field">
                  <label>Hoja</label>
                  <select value={hojaIdx} onChange={(e) => elegirHoja(Number(e.target.value))}>
                    {hojas.map((h, i) => (
                      <option key={h.nombre} value={i}>
                        {h.nombre} ({h.filas.length} filas)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label>Fila de encabezados</label>
                <select
                  value={filaEnc}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setFilaEnc(n);
                    setMapa(detectarColumnas(construirTabla(hoja.filas, n).columnas));
                  }}
                >
                  {hoja.filas.slice(0, 25).map((f, i) => (
                    <option key={i} value={i}>
                      Fila {i + 1}: {f.filter((c) => String(c).trim()).slice(0, 3).join(' · ').slice(0, 50) || '(vacía)'}
                    </option>
                  ))}
                </select>
              </div>
              {[
                ['descripcion', 'Columna de descripción'],
                ['cantidad', 'Columna de cantidad'],
                ['unidad', 'Columna de unidad'],
              ].map(([k, label]) => (
                <div className="field" key={k}>
                  <label>{label}</label>
                  <select value={mapa[k]} onChange={(e) => setMapa((m) => ({ ...m, [k]: e.target.value }))}>
                    <option value="">— Ninguna —</option>
                    {opcionesColumna.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="section-label" style={{ marginBottom: 8 }}>
              Vista previa · {tabla.registros.length} renglones
            </div>
            <div className="import-preview">
              <table>
                <thead>
                  <tr>
                    {tabla.columnas.map((c) => (
                      <th key={c} className={Object.values(mapa).includes(c) ? 'mapped' : ''}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tabla.registros.slice(0, 6).map((r, i) => (
                    <tr key={i}>
                      {tabla.columnas.map((c) => (
                        <td key={c}>{String(r[c] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tabla.registros.length > 6 && <p className="hint">…y {tabla.registros.length - 6} renglones más.</p>}

            <button className="btn btn-primary btn-block" disabled={busy || !titulo.trim() || !tabla.registros.length}>
              {busy ? progreso || 'Creando…' : `Crear licitación con ${tabla.registros.length} renglones`}
            </button>
          </>
        )}
      </form>
    </FormModal>
  );
}

export default function LicitacionesScreen({ profile, activeWorker, licitaciones, loading, onOpen, onCreated, showForm, onCloseForm }) {
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('activas');

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return licitaciones
      .filter((l) => {
        if (filtro === 'activas') return !['adjudicada', 'no_adjudicada'].includes(l.estado);
        if (filtro !== 'todas') return l.estado === filtro;
        return true;
      })
      .filter((l) => !t || [l.titulo, l.institucion, l.codigo, String(l.folio)].some((v) => (v || '').toLowerCase().includes(t)))
      .sort((a, b) => {
        // Activas: primero lo que vence antes. Sin fecha, al final.
        if (filtro === 'activas') {
          const da = a.fecha_limite || '9999';
          const db = b.fecha_limite || '9999';
          if (da !== db) return da.localeCompare(db);
        }
        return (b.updated_at || '').localeCompare(a.updated_at || '');
      });
  }, [licitaciones, q, filtro]);

  const conteo = (k) =>
    k === 'todas'
      ? licitaciones.length
      : k === 'activas'
        ? licitaciones.filter((l) => !['adjudicada', 'no_adjudicada'].includes(l.estado)).length
        : licitaciones.filter((l) => l.estado === k).length;

  const filtros = [{ key: 'activas', label: 'Activas' }, ...ESTADOS_LICITACION.map((e) => ({ key: e.key, label: e.label })), { key: 'todas', label: 'Todas' }];

  return (
    <div className="lic-screen">
      <div className="lic-toolbar">
        <label className="search-box">
          <Icon name="buscar" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, institución o número" aria-label="Buscar licitación" />
        </label>
        <div className="act-chips" role="tablist" aria-label="Filtrar licitaciones">
          {filtros.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filtro === f.key}
              className={`act-chip${filtro === f.key ? ' active' : ''}`}
              onClick={() => setFiltro(f.key)}
            >
              <span>{f.label}</span>
              <b>{conteo(f.key)}</b>
            </button>
          ))}
        </div>
      </div>

      {loading && !licitaciones.length ? (
        <div className="lic-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="lic-row skeleton" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <div className="empty-state">
          <Icon name="licitaciones" size={34} />
          <h3>{licitaciones.length ? 'Nada con ese filtro' : 'Todavía no hay licitaciones'}</h3>
          <p>
            {licitaciones.length
              ? 'Prueba con otro estado o borra la búsqueda.'
              : 'Sube el Excel de una licitación y aquí se va llenando con el producto ofrecido, el proveedor y el precio de cada renglón.'}
          </p>
        </div>
      ) : (
        <div className="lic-list">
          {lista.map((l) => (
            <LicitacionRow key={l.id} l={l} onOpen={onOpen} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <ImportarLicitacion key="importar-licitacion" profile={profile} activeWorker={activeWorker} onClose={onCloseForm} onCreated={onCreated} />
        )}
      </AnimatePresence>
    </div>
  );
}
