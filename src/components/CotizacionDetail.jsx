import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../supabaseClient.js';
import { ESTADOS, CANCELADA, fmtMoney, fmtDateTime, itemsTotal } from '../utils.js';
import { StatusStepper, Badge } from './StatusStepper.jsx';
import ImagenInput from './ImagenInput.jsx';
import ImagenPerezosa from './ImagenPerezosa.jsx';
import { useUI } from './UIProvider.jsx';
import { MotionOverlay, MotionModal } from './Motion.jsx';

// El detalle NO pide las columnas `imagen` ni `imagen_notas`: esas son las
// fotos en base64 y son, de lejos, lo más pesado de la base. En su lugar pide
// las columnas generadas `tiene_imagen` / `tiene_imagen_notas` (un booleano),
// y la foto se descarga solo si alguien la pide con el botón "Ver foto".
// Abrir una cotización pasa de bajar cientos de KB a bajar unos 2 KB.
// Ojo: `proveedor_id` y `cotizado_por_trabajador_id` tienen que venir aunque
// la tabla muestre los nombres por el join. El formulario de edición los usa
// como valor inicial de sus desplegables, y si faltan, editar el precio de un
// producto le borraría el proveedor y le cambiaría quién lo cotizó.
const SELECT_DETALLE =
  'select=id,folio,escuela,titulo,solicitante_nombre,estado,created_at,updated_at,notas_generales,tiene_imagen_notas,' +
  'cotizacion_items(id,producto,descripcion,cantidad,precio_final,notas,created_at,tiene_imagen,' +
  'proveedor_id,cotizado_por_trabajador_id,' +
  'proveedor:proveedores(nombre),cotizado:trabajadores_cyber(nombre))';

function NotasGenerales({ cotizacionId, value, tieneImagen, onSave, isSolicitante }) {
  const [v, setV] = useState(value);
  // `img` arranca en 'sin-tocar': significa "hay o no hay foto guardada, pero
  // no la hemos descargado y no la vamos a modificar". Solo pasa a ser un
  // data URL (o null) si la persona cambia la foto, y solo entonces se manda
  // al guardar. Así editar una nota no reenvía ni borra la foto existente.
  const [img, setImg] = useState('sin-tocar');
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    setV(value);
    setImg('sin-tocar');
  }, [value, tieneImagen]);

  const imgTocada = img !== 'sin-tocar';

  return (
    <div className="field">
      <textarea
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          setSaved(false);
        }}
        style={{ minHeight: 90 }}
        placeholder={isSolicitante ? 'Lista de productos a cotizar, uno por línea…' : 'Sin productos anotados.'}
      />
      <div style={{ marginTop: 8 }}>
        {tieneImagen && !imgTocada && (
          <div className="action-row" style={{ marginBottom: 6 }}>
            <ImagenPerezosa
              tabla="cotizaciones"
              id={cotizacionId}
              columna="imagen_notas"
              hay={true}
              alt="lista"
              size={90}
            />
            <button type="button" className="link-btn" onClick={() => { setImg(null); setSaved(false); }}>
              Quitar foto
            </button>
          </div>
        )}
        <ImagenInput
          value={imgTocada ? img : null}
          onChange={(dataUrl) => {
            setImg(dataUrl);
            setSaved(false);
          }}
          label={
            tieneImagen && !imgTocada
              ? 'Reemplazar la foto de la lista (opcional)'
              : 'Foto de la lista (opcional, ej. captura de Excel)'
          }
        />
      </div>
      {!saved && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 6 }}
          onClick={async () => {
            await onSave(v, imgTocada ? img : undefined);
            setSaved(true);
            setImg('sin-tocar');
          }}
        >
          Guardar
        </button>
      )}
    </div>
  );
}



// Fila de producto en modo edición para Ocampo (solo producto y cantidad)
function ItemRowEditSolicitante({ it, onSave, onCancel }) {
  const [producto, setProducto] = useState(it.producto);
  const [cantidad, setCantidad] = useState(it.cantidad);
  return (
    <tr>
      <td colSpan={8}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 2, marginBottom: 0 }}>
            <label>Producto</label>
            <input value={producto} onChange={(e) => setProducto(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Cantidad</label>
            <input type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => onSave({ producto, cantidad: Number(cantidad) || 1 })}>
            Guardar
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
}

// Formulario de Cyber: crear o editar un producto cotizado (todos los datos).
function ItemFormCotizador({ initial, proveedores, trabajadoresCyber, activeWorker, reloadProveedores, onSave, onCancel, submitLabel }) {
  const [producto, setProducto] = useState(initial?.producto || '');
  const [descripcion, setDescripcion] = useState(initial?.descripcion || '');
  const [proveedorId, setProveedorId] = useState(initial?.proveedor_id || '');
  const [precio, setPrecio] = useState(initial?.precio_final ?? '');
  const [cantidad, setCantidad] = useState(initial?.cantidad ?? 1);
  const [notas, setNotas] = useState(initial?.notas || '');
  // Igual que en las notas generales: 'sin-tocar' = no descargamos la foto ni
  // la vamos a modificar. Editar el precio de un producto ya no arrastra su
  // foto de ida y de vuelta.
  const [imagen, setImagen] = useState(initial ? 'sin-tocar' : null);
  const imagenTocada = imagen !== 'sin-tocar';
  const [cotizadoPor, setCotizadoPor] = useState(initial?.cotizado_por_trabajador_id || (activeWorker ? activeWorker.id : ''));
  const [nuevoProv, setNuevoProv] = useState(false);
  const [nuevoProvNombre, setNuevoProvNombre] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!producto.trim()) {
      setErr('Escribe el nombre del producto.');
      return;
    }
    setBusy(true);
    try {
      let pid = proveedorId || null;
      if (nuevoProv && nuevoProvNombre.trim()) {
        const created = await api.post('proveedores', { nombre: nuevoProvNombre.trim() });
        pid = created[0].id;
        await reloadProveedores();
      }
      const payload = {
        producto: producto.trim(),
        descripcion: descripcion.trim() || null,
        proveedor_id: pid,
        precio_final: precio === '' ? null : Number(precio),
        cantidad: Number(cantidad) || 1,
        notas: notas.trim() || null,
        cotizado_por_trabajador_id: cotizadoPor || null,
      };
      if (imagenTocada) payload.imagen = imagen || null;
      await onSave(payload);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ background: '#F7F8FA', borderRadius: 10, padding: 14, marginBottom: 10 }}>
      {err && <div className="err">{err}</div>}
      <div className="row">
        <div className="field" style={{ flex: 2 }}>
          <label>Producto</label>
          <input required value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej: Pizarra acrílica 60x90" />
        </div>
        <div className="field">
          <label>Cantidad disponible</label>
          <input type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Descripción breve (opcional)</label>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Marca, medida, color, etc." />
      </div>
      <div className="row">
        <div className="field">
          <label>Proveedor</label>
          {!nuevoProv ? (
            <select
              value={proveedorId}
              onChange={(e) => {
                if (e.target.value === '__nuevo__') {
                  setNuevoProv(true);
                  setProveedorId('');
                } else setProveedorId(e.target.value);
              }}
            >
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
              <option value="__nuevo__">+ Nuevo proveedor…</option>
            </select>
          ) : (
            <div className="input-with-button">
              <input autoFocus placeholder="Nombre proveedor" value={nuevoProvNombre} onChange={(e) => setNuevoProvNombre(e.target.value)} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNuevoProv(false)}>
                x
              </button>
            </div>
          )}
        </div>
        <div className="field">
          <label>Precio final</label>
          <input type="number" min="0" step="any" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="₡" />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Cotizado por</label>
          <select value={cotizadoPor} onChange={(e) => setCotizadoPor(e.target.value)}>
            <option value="">— Selecciona —</option>
            {trabajadoresCyber.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          {initial?.tiene_imagen && !imagenTocada && (
            <div className="action-row" style={{ marginBottom: 6 }}>
              <ImagenPerezosa
                tabla="cotizacion_items"
                id={initial.id}
                columna="imagen"
                hay={true}
                alt={initial.producto}
                size={70}
              />
              <button type="button" className="link-btn" onClick={() => setImagen(null)}>
                Quitar
              </button>
            </div>
          )}
          <ImagenInput
            value={imagenTocada ? imagen : null}
            onChange={setImagen}
            label={initial?.tiene_imagen && !imagenTocada ? 'Reemplazar foto (opcional)' : 'Foto (opcional)'}
          />
        </div>
      </div>
      <div className="field">
        <label>Notas de proceso (opcional)</label>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: precio válido por 8 días" />
      </div>
      <div className="action-row" style={{ marginTop: 4 }}>
        <button className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Guardando…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

export default function CotizacionDetail({
  id,
  profile,
  activeWorker,
  proveedores,
  trabajadoresCyber,
  onClose,
  onChanged,
  onTouch,
  reloadProveedores,
  log,
}) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [showAddCotizador, setShowAddCotizador] = useState(false);
  const isCotizador = profile.role === 'cotizador';
  const isSolicitante = profile.role === 'solicitante';
  const { confirmar, toast } = useUI();

  const [falloCarga, setFalloCarga] = useState('');
  // En refs y no en las dependencias de `load`: si `load` dependiera de `c`,
  // cada carga cambiaría `c`, que recrearía `load`, que dispararía el efecto
  // de abajo otra vez. Bucle infinito de peticiones.
  const cRef = useRef(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(async () => {
    try {
      const data = await api.get(`cotizaciones?id=eq.${id}&${SELECT_DETALLE}`);
      cRef.current = data[0];
      setC(data[0]);
      setFalloCarga('');
    } catch (ex) {
      // Si la ventana ya estaba abierta con datos buenos (p. ej. se cayó la
      // red justo después de guardar), no se tira lo que hay: basta un aviso.
      // La pantalla de error completa es solo para cuando no se pudo abrir,
      // y el caso típico ahí es haber desplegado la app sin correr todavía
      // optimizacion_egress.sql, así que faltan las columnas tiene_imagen*.
      if (cRef.current) toastRef.current('No se pudo recargar: ' + ex.message, 'error');
      else setFalloCarga(ex.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const addItemCotizador = async (patch) => {
    await api.post('cotizacion_items', {
      cotizacion_id: id,
      agregado_por: profile.id,
      ...patch,
    });
    setShowAddCotizador(false);
    await load();
    onChanged();
    await log('Agregó producto cotizado', `${patch.producto} en #${c.folio}`);
  };

  const saveItem = async (itemId, patch, itemLabel) => {
    setErr('');
    try {
      await api.patch(`cotizacion_items?id=eq.${itemId}`, patch);
      setEditingId(null);
      await load();
      onChanged();
      await log('Editó producto', `${itemLabel} en #${c.folio}`);
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const deleteItem = async (itemId, itemLabel) => {
    const ok = await confirmar(`¿Eliminar "${itemLabel}" de esta cotización?`, { confirmLabel: 'Eliminar' });
    if (!ok) return;
    await api.del(`cotizacion_items?id=eq.${itemId}`);
    await load();
    onChanged();
    await log('Eliminó producto', `${itemLabel} en #${c.folio}`);
  };

  const changeEstado = async (estado) => {
    if (onTouch) onTouch(id);
    await api.patch(`cotizaciones?id=eq.${id}`, { estado });
    await load();
    onChanged();
    await log('Cambió estado', `#${c.folio} → ${estado}`);
  };

  // `imagen_notas` llega como `undefined` cuando la persona no tocó la foto:
  // en ese caso ni se menciona en el PATCH, así que no se reenvía (ahorra
  // subida) ni se borra por accidente.
  const saveNotas = async (notas_generales, imagen_notas) => {
    if (onTouch) onTouch(id);
    const patch = { notas_generales };
    if (imagen_notas !== undefined) patch.imagen_notas = imagen_notas || null;
    await api.patch(`cotizaciones?id=eq.${id}`, patch);
    await load();
    onChanged();
  };

  if (falloCarga && !c) {
    return (
      <MotionOverlay onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <MotionModal>
          <div className="modal-top">
            <h2>No se pudo abrir la cotización</h2>
            <button className="x-btn" onClick={onClose}>✕</button>
          </div>
          <div className="err" style={{ whiteSpace: 'pre-wrap' }}>{falloCarga}</div>
          <p className="hint">
            Si el mensaje habla de una columna que no existe (tiene_imagen o
            tiene_imagen_notas), falta ejecutar <code>optimizacion_egress.sql</code>{' '}
            en el SQL Editor de Supabase.
          </p>
          <div className="action-row">
            <button className="btn btn-primary btn-sm" onClick={load}>Reintentar</button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cerrar</button>
          </div>
        </MotionModal>
      </MotionOverlay>
    );
  }
  if (!c) return null;
  const total = itemsTotal(c.cotizacion_items);

  return (
    <MotionOverlay
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <MotionModal>
        <div className="modal-top">
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600 }}>#{c.folio}</div>
            <h2>{c.titulo}</h2>
          </div>
          <button className="x-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="action-row" style={{ margin: '10px 0 4px' }}>
          <Badge estado={c.estado} />
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {c.escuela} · Solicita: {c.solicitante_nombre}
          </span>
        </div>
        <StatusStepper estado={c.estado} />

        {/* Ambos lados pueden mover el estado del encargo. */}
        <div className="action-row" style={{ marginTop: 12 }}>
          {ESTADOS.map((e) => (
            <button
              key={e.key}
              className={`btn btn-sm ${e.key === c.estado ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => changeEstado(e.key)}
            >
              {e.label}
            </button>
          ))}
        </div>

        {/* La cancelación es aparte del flujo normal: es para cuando el
            encargo no se llegó a pedir o se canceló, y así no se queda
            "abierto" indefinidamente en una de las columnas activas. */}
        <div className="action-row" style={{ marginTop: 8 }}>
          {c.estado === CANCELADA.key ? (
            <button className="btn btn-ghost btn-sm" onClick={() => changeEstado(ESTADOS[0].key)}>
              ↺ Reabrir cotización
            </button>
          ) : (
            <button className="btn btn-danger btn-sm" onClick={() => changeEstado(CANCELADA.key)}>
              ✕ Cancelar cotización
            </button>
          )}
        </div>

        <div className="divider" />
        <div className="section-label">{isSolicitante ? 'Productos a cotizar (tu lista)' : 'Productos que pidió Ocampo'}</div>
        <NotasGenerales
          cotizacionId={c.id}
          value={c.notas_generales || ''}
          tieneImagen={Boolean(c.tiene_imagen_notas)}
          onSave={saveNotas}
          isSolicitante={isSolicitante}
        />

        <div className="divider" />
        <div className="section-label">Productos cotizados ({(c.cotizacion_items || []).length})</div>
        {err && <div className="err">{err}</div>}
        <div className="table-wrap">
        <table className="table-mobile-cards">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Prov.</th>
              <th>Cant.</th>
              <th>Precio</th>
              <th>Notas</th>
              <th>Cotizó / agregado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(c.cotizacion_items || []).map((it) =>
              editingId === it.id ? (
                isSolicitante ? (
                  <ItemRowEditSolicitante
                    key={it.id}
                    it={it}
                    onSave={(patch) => saveItem(it.id, patch, it.producto)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <tr key={it.id}>
                    <td colSpan={7}>
                      <ItemFormCotizador
                        initial={it}
                        proveedores={proveedores}
                        trabajadoresCyber={trabajadoresCyber}
                        activeWorker={activeWorker}
                        reloadProveedores={reloadProveedores}
                        submitLabel="Guardar cambios"
                        onCancel={() => setEditingId(null)}
                        onSave={(patch) => saveItem(it.id, patch, it.producto)}
                      />
                    </td>
                  </tr>
                )
              ) : (
                <tr key={it.id}>
                  <td data-label="Producto">
                    <ImagenPerezosa
                      tabla="cotizacion_items"
                      id={it.id}
                      columna="imagen"
                      hay={it.tiene_imagen}
                      alt={it.producto}
                      size={46}
                      style={{ marginBottom: 4 }}
                    />

                    {it.producto}
                    {it.descripcion && <div className="item-notas">{it.descripcion}</div>}
                  </td>
                  <td data-label="Proveedor">{it.proveedor ? it.proveedor.nombre : '—'}</td>
                  <td data-label="Cantidad">{it.cantidad}</td>
                  <td data-label="Precio">{it.precio_final !== null ? fmtMoney(it.precio_final) : 'Pendiente'}</td>
                  <td data-label="Notas" className="item-notas">{it.notas || '—'}</td>
                  <td data-label="Cotizó / agregado" className="item-time">
                    {it.cotizado ? it.cotizado.nombre : '—'}
                    <br />
                    {fmtDateTime(it.created_at)}
                  </td>
                  <td data-label="Acciones">
                    <div className="action-row" style={{ gap: 4 }}>
                      <button className="x-btn" onClick={() => setEditingId(it.id)} title="Editar">
                        ✎
                      </button>
                      <button className="x-btn" onClick={() => deleteItem(it.id, it.producto)} title="Eliminar">
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
        </div>
        <div className="total-line">
          <span>Total</span>
          <span>{fmtMoney(total)}</span>
        </div>

        {isCotizador && (
          <React.Fragment>
            <div className="divider" />
            <div className="section-label">Agregar producto cotizado</div>
            {!showAddCotizador ? (
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddCotizador(true)}>
                + Agregar producto
              </button>
            ) : (
              <ItemFormCotizador
                proveedores={proveedores}
                trabajadoresCyber={trabajadoresCyber}
                activeWorker={activeWorker}
                reloadProveedores={reloadProveedores}
                submitLabel="Agregar producto"
                onCancel={() => setShowAddCotizador(false)}
                onSave={addItemCotizador}
              />
            )}
          </React.Fragment>
        )}
      </MotionModal>
    </MotionOverlay>
  );
}
