import React, { useState, useEffect } from 'react';
import { api } from '../supabaseClient.js';
import { ESTADOS_APARTADO, fmtMoney, fmtDateTime } from '../utils.js';
import ApartadoDetail from './ApartadoDetail.jsx';
import { useUI } from './UIProvider.jsx';
import Pager, { usePager } from './Pager.jsx';
import FormModal from './FormModal.jsx';

const POR_PAGINA = 6;

function ApartadoCard({ a, trabajadorNombre, onOpen, onAvanzar, onRetroceder, onDelete, draggable, onDragStart, onDragEnd, dragging }) {
  const idx = ESTADOS_APARTADO.findIndex((e) => e.key === a.estado);
  return (
    <div
      className="card"
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(e, a) : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={() => onOpen(a.id)}
      style={{ opacity: dragging ? 0.4 : 1, cursor: draggable ? 'grab' : 'pointer' }}
    >
      <div className="folio">
        #{a.folio} · {a.cliente_nombre}
      </div>
      {a.numero_apartado && <div className="item-notas">🧾 Apartado #{a.numero_apartado}</div>}
      <div className="titulo">{a.producto}</div>
      <div className="meta">
        <span>Cant: {a.cantidad}</span>
        {a.precio !== null && a.precio !== undefined && <span>{fmtMoney(a.precio)}</span>}
      </div>
      {a.telefono && <div className="item-notas">📞 {a.telefono}</div>}
      {a.notas && <div className="item-notas">{a.notas}</div>}
      <div className="meta" style={{ marginTop: 8, marginBottom: 0 }}>
        <span>{trabajadorNombre || '—'}</span>
        <span>{fmtDateTime(a.created_at)}</span>
      </div>
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        {idx > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ flex: 'none' }} onClick={() => onRetroceder(a)}>
            ← {ESTADOS_APARTADO[idx - 1].label}
          </button>
        )}
        {idx < ESTADOS_APARTADO.length - 1 && (
          <button className="btn btn-primary btn-sm" style={{ flex: 'none' }} onClick={() => onAvanzar(a)}>
            {ESTADOS_APARTADO[idx + 1].label} →
          </button>
        )}
        <button className="x-btn" onClick={() => onDelete(a)} title="Eliminar" style={{ marginLeft: 'auto' }}>
          ✕
        </button>
      </div>
    </div>
  );
}

function ApartadoColumna({
  estado,
  mobileActive,
  items,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  nombreTrabajador,
  onOpen,
  onAvanzar,
  onRetroceder,
  onDelete,
  draggingId,
  onDragStart,
  onDragEnd,
}) {
  const { pageItems, page, setPage, totalPages } = usePager(items, POR_PAGINA);
  return (
    <div
      className={`col${mobileActive ? ' mobile-col-active' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={isOver ? { background: '#E4E9FB', outline: '2px dashed var(--primary)', outlineOffset: -2 } : undefined}
    >
      <div className="col-head">
        <span className="sw" style={{ background: estado.color }} />
        <h3>{estado.label}</h3>
        <span className="count">{items.length}</span>
      </div>
      {items.length === 0 && <div className="empty-col">Arrastra aquí o usa los botones</div>}
      {pageItems.map((a) => (
        <ApartadoCard
          key={a.id}
          a={a}
          trabajadorNombre={nombreTrabajador(a.registrado_por_trabajador_id)}
          onOpen={onOpen}
          onAvanzar={onAvanzar}
          onRetroceder={onRetroceder}
          onDelete={onDelete}
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          dragging={draggingId === a.id}
        />
      ))}
      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default function ApartadosScreen({ activeWorker, trabajadoresCyber, apartados, reload, log, showForm, onCloseForm }) {
  const { confirmar, toast } = useUI();
  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [numeroApartado, setNumeroApartado] = useState('');
  const [producto, setProducto] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [precio, setPrecio] = useState('');
  const [notas, setNotas] = useState('');
  const [registradoPor, setRegistradoPor] = useState(activeWorker ? activeWorker.id : '');
  const [busy, setBusy] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [mobileEstado, setMobileEstado] = useState(() =>
    ESTADOS_APARTADO.find((estado) => apartados.some((a) => a.estado === estado.key))?.key || ESTADOS_APARTADO[0].key
  );

  useEffect(() => {
    if (!apartados.length) return;
    const estadoActualTieneItems = apartados.some((a) => a.estado === mobileEstado);
    if (!estadoActualTieneItems) {
      const primeroConItems = ESTADOS_APARTADO.find((estado) => apartados.some((a) => a.estado === estado.key));
      if (primeroConItems) setMobileEstado(primeroConItems.key);
    }
  }, [apartados, mobileEstado]);

  const nombreTrabajador = (id) => trabajadoresCyber.find((t) => t.id === id)?.nombre || null;

  const limpiar = () => {
    setCliente('');
    setTelefono('');
    setNumeroApartado('');
    setProducto('');
    setCantidad(1);
    setPrecio('');
    setNotas('');
  };

  const add = async (e) => {
    e.preventDefault();
    if (!cliente.trim() || !producto.trim()) return;
    setBusy(true);
    try {
      await api.post('apartados', {
        cliente_nombre: cliente.trim(),
        telefono: telefono.trim() || null,
        numero_apartado: numeroApartado.trim() || null,
        producto: producto.trim(),
        cantidad: Number(cantidad) || 1,
        precio: precio === '' ? null : Number(precio),
        notas: notas.trim() || null,
        registrado_por_trabajador_id: registradoPor || null,
      });
      await log('Agregó apartado', `${producto.trim()} · ${cliente.trim()}`);
      const guardado = producto.trim();
      limpiar();
      await reload();
      onCloseForm();
      toast(`Apartado de "${guardado}" registrado.`, 'success');
    } catch (ex) {
      toast('No se pudo registrar: ' + ex.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cambiarEstado = async (a, nuevoEstado) => {
    await api.patch(`apartados?id=eq.${a.id}`, { estado: nuevoEstado });
    const info = ESTADOS_APARTADO.find((e) => e.key === nuevoEstado);
    await log('Cambió estado de apartado', `#${a.folio} ${a.producto} → ${info ? info.label : nuevoEstado}`);
    await reload();
  };

  const avanzar = (a) => {
    const idx = ESTADOS_APARTADO.findIndex((e) => e.key === a.estado);
    if (idx < ESTADOS_APARTADO.length - 1) cambiarEstado(a, ESTADOS_APARTADO[idx + 1].key);
  };
  const retroceder = (a) => {
    const idx = ESTADOS_APARTADO.findIndex((e) => e.key === a.estado);
    if (idx > 0) cambiarEstado(a, ESTADOS_APARTADO[idx - 1].key);
  };

  const del = async (a) => {
    const ok = await confirmar(`¿Eliminar el apartado de "${a.producto}" para ${a.cliente_nombre}?`, { confirmLabel: 'Eliminar' });
    if (!ok) return;
    await api.del(`apartados?id=eq.${a.id}`);
    await log('Eliminó apartado', `${a.producto} · ${a.cliente_nombre}`);
    await reload();
  };

  const onDragStart = (e, a) => {
    setDraggingId(a.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', a.id);
  };
  const onDragEnd = () => {
    setDraggingId(null);
    setOverCol(null);
  };
  const onDropCol = (e, estadoKey) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    setDraggingId(null);
    setOverCol(null);
    if (!id) return;
    const a = apartados.find((x) => x.id === id);
    if (a && a.estado !== estadoKey) cambiarEstado(a, estadoKey);
  };

  return (
    <div>
      <p className="hint" style={{ marginBottom: 16 }}>
        Solo Cyber ve este control. Arrastra la tarjeta a otra columna o usa los botones. Máximo {POR_PAGINA} por página en
        cada columna, del más nuevo al más viejo.
      </p>

      <div className="board apartados-board">
        <div className="mobile-board-tabs" role="tablist" aria-label="Estados de apartados">
          {ESTADOS_APARTADO.map((estado) => {
            const count = apartados.filter((a) => a.estado === estado.key).length;
            const active = mobileEstado === estado.key;
            return (
              <button key={estado.key} type="button"
                className={`mobile-board-tab${active ? ' active' : ''}`}
                onClick={() => setMobileEstado(estado.key)}
                role="tab" aria-selected={active}>
                <span className="mobile-board-tab-dot" style={{ background: estado.color }} />
                <span className="mobile-board-tab-label">{estado.label}</span>
                <span className="mobile-board-tab-count">{count}</span>
              </button>
            );
          })}
        </div>
        {ESTADOS_APARTADO.map((estado) => {
          const list = apartados
            .filter((a) => a.estado === estado.key)
            .sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
          const isOver = overCol === estado.key;
          return (
            <ApartadoColumna
              key={estado.key}
              estado={estado}
              mobileActive={mobileEstado === estado.key}
              items={list}
              isOver={isOver}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overCol !== estado.key) setOverCol(estado.key);
              }}
              onDragLeave={() => setOverCol((prev) => (prev === estado.key ? null : prev))}
              onDrop={(e) => onDropCol(e, estado.key)}
              nombreTrabajador={nombreTrabajador}
              onOpen={setOpenId}
              onAvanzar={avanzar}
              onRetroceder={retroceder}
              onDelete={del}
              draggingId={draggingId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          );
        })}
      </div>

      {showForm && (
        <FormModal
          title="Nuevo apartado"
          subtitle="Apartado / pedido hecho directamente en tienda."
          onClose={onCloseForm}
          maxWidth={480}
        >
          <form onSubmit={add}>
            <div className="field">
              <label>Cliente</label>
              <input required autoFocus value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" />
            </div>
            <div className="row">
              <div className="field">
                <label>Teléfono (opcional)</label>
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="8888-8888" />
              </div>
              <div className="field">
                <label>N.º de apartado</label>
                <input
                  value={numeroApartado}
                  onChange={(e) => setNumeroApartado(e.target.value)}
                  placeholder="Facturación"
                />
              </div>
            </div>
            <div className="field">
              <label>Producto</label>
              <input required value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej: Mochila escolar azul" />
            </div>
            <div className="row">
              <div className="field">
                <label>Cantidad</label>
                <input type="number" min="1" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
              </div>
              <div className="field">
                <label>Precio (opcional)</label>
                <input type="number" min="0" step="any" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="₡" />
              </div>
            </div>
            <div className="field">
              <label>Registrado por</label>
              <select value={registradoPor} onChange={(e) => setRegistradoPor(e.target.value)}>
                <option value="">— Selecciona —</option>
                {trabajadoresCyber.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Notas (opcional)</label>
              <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Detalle, talla, color…" />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy || !cliente.trim() || !producto.trim()}>
              {busy ? 'Guardando…' : 'Registrar apartado'}
            </button>
          </form>
        </FormModal>
      )}

      {openId && (
        <ApartadoDetail
          id={openId}
          trabajadoresCyber={trabajadoresCyber}
          onClose={() => setOpenId(null)}
          onChanged={reload}
          log={log}
        />
      )}
    </div>
  );
}
