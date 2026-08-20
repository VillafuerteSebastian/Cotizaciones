import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../supabaseClient.js';
import { ESTADOS_APARTADO, fmtMoney, fmtDateTime } from '../utils.js';
import { useUI } from './UIProvider.jsx';

function EstadoBadge({ estado }) {
  const info = ESTADOS_APARTADO.find((e) => e.key === estado) || ESTADOS_APARTADO[0];
  return (
    <span className="badge" style={{ background: info.color }}>
      {info.label}
    </span>
  );
}

export default function ApartadoDetail({ id, trabajadoresCyber, onClose, onChanged, log }) {
  const { confirmar } = useUI();
  const [a, setA] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [numeroApartado, setNumeroApartado] = useState('');
  const [producto, setProducto] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [precio, setPrecio] = useState('');
  const [notas, setNotas] = useState('');
  const [registradoPor, setRegistradoPor] = useState('');

  const load = useCallback(async () => {
    const data = await api.get(`apartados?id=eq.${id}&select=*`);
    setA(data[0]);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!a) return;
    setCliente(a.cliente_nombre || '');
    setTelefono(a.telefono || '');
    setNumeroApartado(a.numero_apartado || '');
    setProducto(a.producto || '');
    setCantidad(a.cantidad ?? '');
    setPrecio(a.precio ?? '');
    setNotas(a.notas || '');
    setRegistradoPor(a.registrado_por_trabajador_id || '');
    setDirty(false);
  }, [a]);

  const marcar = (setter) => (e) => {
    setter(e.target.value);
    setDirty(true);
  };

  const guardar = async () => {
    if (!cliente.trim() || !producto.trim()) {
      setErr('Cliente y producto son obligatorios.');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      await api.patch(`apartados?id=eq.${id}`, {
        cliente_nombre: cliente.trim(),
        telefono: telefono.trim() || null,
        numero_apartado: numeroApartado.trim() || null,
        producto: producto.trim(),
        cantidad: Number(cantidad) || 1,
        precio: precio === '' ? null : Number(precio),
        notas: notas.trim() || null,
        registrado_por_trabajador_id: registradoPor || null,
      });
      await load();
      onChanged();
      await log('Editó apartado', `${producto.trim()} · ${cliente.trim()}`);
      setDirty(false);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const cambiarEstado = async (estado) => {
    await api.patch(`apartados?id=eq.${id}`, { estado });
    await load();
    onChanged();
    const info = ESTADOS_APARTADO.find((e) => e.key === estado);
    await log('Cambió estado de apartado', `#${a.folio} ${a.producto} → ${info ? info.label : estado}`);
  };

  const eliminar = async () => {
    const ok = await confirmar(`¿Eliminar el apartado de "${a.producto}" para ${a.cliente_nombre}?`, { confirmLabel: 'Eliminar' });
    if (!ok) return;
    await api.del(`apartados?id=eq.${id}`);
    await log('Eliminó apartado', `${a.producto} · ${a.cliente_nombre}`);
    onChanged();
    onClose();
  };

  if (!a) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-top">
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600 }}>
              #{a.folio}
              {a.numero_apartado && ` · Apartado #${a.numero_apartado}`}
            </div>
            <h2>{a.producto}</h2>
          </div>
          <button className="x-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="action-row" style={{ margin: '10px 0 4px' }}>
          <EstadoBadge estado={a.estado} />
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Cliente: {a.cliente_nombre}</span>
        </div>

        <div className="action-row" style={{ marginTop: 12 }}>
          {ESTADOS_APARTADO.map((e) => (
            <button
              key={e.key}
              className={`btn btn-sm ${e.key === a.estado ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => cambiarEstado(e.key)}
            >
              {e.label}
            </button>
          ))}
        </div>

        <div className="divider" />
        <div className="section-label">Información general</div>
        {err && <div className="err">{err}</div>}

        <div className="row">
          <div className="field">
            <label>Cliente</label>
            <input value={cliente} onChange={marcar(setCliente)} />
          </div>
          <div className="field">
            <label>Teléfono</label>
            <input value={telefono} onChange={marcar(setTelefono)} placeholder="8888-8888" />
          </div>
        </div>

        <div className="field">
          <label>Número de apartado (facturación)</label>
          <input value={numeroApartado} onChange={marcar(setNumeroApartado)} placeholder="Ej: el número que da el sistema de facturación" />
        </div>

        <div className="field">
          <label>Producto</label>
          <input value={producto} onChange={marcar(setProducto)} />
        </div>

        <div className="row">
          <div className="field">
            <label>Cantidad</label>
            <input type="number" min="1" step="any" value={cantidad} onChange={marcar(setCantidad)} />
          </div>
          <div className="field">
            <label>Precio</label>
            <input type="number" min="0" step="any" value={precio} onChange={marcar(setPrecio)} placeholder="₡" />
          </div>
        </div>

        <div className="field">
          <label>Registrado por</label>
          <select value={registradoPor} onChange={marcar(setRegistradoPor)}>
            <option value="">— Selecciona —</option>
            {trabajadoresCyber.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Notas</label>
          <textarea style={{ minHeight: 80 }} value={notas} onChange={marcar(setNotas)} placeholder="Detalle, talla, color…" />
        </div>

        <div className="action-row" style={{ marginTop: 4 }}>
          {dirty && (
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={guardar}>
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          )}
          <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={eliminar}>
            Eliminar apartado
          </button>
        </div>

        <div className="divider" />
        <div className="meta" style={{ marginBottom: 0 }}>
          <span>Creado: {fmtDateTime(a.created_at)}</span>
          <span>Actualizado: {fmtDateTime(a.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}
