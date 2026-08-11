import React, { useState } from 'react';
import { api } from '../supabaseClient.js';

export default function ProveedoresScreen({
  proveedores,
  activeWorker,
  reload,
  log,
}) {
  const isAdmin = Boolean(activeWorker && activeWorker.es_administrador);

  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  const limpiarFormulario = () => {
    setNombre('');
    setContacto('');
    setTelefono('');
    setEditing(null);
  };

  const add = async (e) => {
    e.preventDefault();

    if (!nombre.trim()) return;

    setBusy(true);

    try {
      await api.post('proveedores', {
        nombre: nombre.trim(),
        contacto: contacto.trim() || null,
        telefono: telefono.trim() || null,
      });

      if (log) {
        await log('Agregó proveedor', nombre.trim());
      }

      limpiarFormulario();
      await reload();
    } catch (ex) {
      alert(`No se pudo agregar el proveedor: ${ex.message}`);
    } finally {
      setBusy(false);
    }
  };

  const iniciarEdicion = (p) => {
    setEditing(p);
    setNombre(p.nombre || '');
    setContacto(p.contacto || '');
    setTelefono(p.telefono || '');
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();

    if (!editing || !nombre.trim()) return;

    setBusy(true);

    try {
      await api.patch(`proveedores?id=eq.${editing.id}`, {
        nombre: nombre.trim(),
        contacto: contacto.trim() || null,
        telefono: telefono.trim() || null,
      });

      if (log) {
        await log('Editó proveedor', nombre.trim());
      }

      limpiarFormulario();
      await reload();
    } catch (ex) {
      alert(`No se pudo editar el proveedor: ${ex.message}`);
    } finally {
      setBusy(false);
    }
  };

  const eliminar = async (p) => {
    if (
      !window.confirm(
        `¿Eliminar al proveedor "${p.nombre}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    try {
      await api.del(`proveedores?id=eq.${p.id}`);

      if (log) {
        await log('Eliminó proveedor', p.nombre);
      }

      await reload();
    } catch (ex) {
      alert(`No se pudo eliminar el proveedor: ${ex.message}`);
    }
  };

  return (
    <div>
      {isAdmin ? (
        <div
          className="auth-card"
          style={{
            maxWidth: 520,
            marginBottom: 22,
            padding: 20,
          }}
        >
          <div className="section-label" style={{ marginBottom: 12 }}>
            {editing ? 'Editar proveedor' : 'Agregar proveedor'}
          </div>

          <form onSubmit={editing ? guardarEdicion : add}>
            <div className="row">
              <div className="field">
                <label>Nombre</label>
                <input
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre del proveedor"
                />
              </div>

              <div className="field">
                <label>Contacto</label>
                <input
                  value={contacto}
                  onChange={(e) => setContacto(e.target.value)}
                  placeholder="Persona de contacto"
                />
              </div>
            </div>

            <div className="field">
              <label>Teléfono</label>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Número de teléfono"
              />
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy}
              >
                {busy
                  ? 'Guardando…'
                  : editing
                  ? 'Guardar cambios'
                  : 'Agregar proveedor'}
              </button>

              {editing && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={limpiarFormulario}
                  disabled={busy}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      ) : (
        <p className="hint" style={{ marginBottom: 16 }}>
          Solo un administrador del equipo Cyber puede agregar, editar o
          eliminar proveedores.
        </p>
      )}

      <div className="prov-list">
        {proveedores.map((p) => (
          <div className="prov-row" key={p.id}>
            <div>
              <div className="name">{p.nombre}</div>

              <div className="sub">
                {[p.contacto, p.telefono]
                  .filter(Boolean)
                  .join(' · ') || 'Sin datos de contacto'}
              </div>
            </div>

            {isAdmin && (
              <div
                className="row"
                style={{
                  flex: 'none',
                  gap: 6,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => iniciarEdicion(p)}
                >
                  Editar
                </button>

                <button
                  className="x-btn"
                  onClick={() => eliminar(p)}
                  title="Eliminar proveedor"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}

        {proveedores.length === 0 && (
          <div className="empty-col">
            Aún no hay proveedores.
          </div>
        )}
      </div>
    </div>
  );
}

