import React, { useState } from 'react';
import { api } from '../supabaseClient.js';
import { useUI } from './UIProvider.jsx';
import FormModal from './FormModal.jsx';
import { AnimatePresence } from './Motion.jsx';

function ProveedorEditForm({ p, onCancel, onSaved }) {
  const { toast } = useUI();
  const [nombre, setNombre] = useState(p.nombre);
  const [contacto, setContacto] = useState(p.contacto || '');
  const [telefono, setTelefono] = useState(p.telefono || '');
  const [email, setEmail] = useState(p.email || '');
  const [notas, setNotas] = useState(p.notas || '');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`proveedores?id=eq.${p.id}`, {
        nombre: nombre.trim(),
        contacto: contacto.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        notas: notas.trim() || null,
      });
      await onSaved();
    } catch (ex) {
      toast('No se pudo guardar: ' + ex.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} style={{ background: '#F7F8FA', borderRadius: 10, padding: 14, width: '100%' }}>
      <div className="row">
        <div className="field">
          <label>Nombre</label>
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="field">
          <label>Contacto</label>
          <input value={contacto} onChange={(e) => setContacto(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Teléfono</label>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </div>
        <div className="field">
          <label>Correo</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Notas</label>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
      <div className="action-row">
        <button className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default function ProveedoresScreen({ activeWorker, proveedores, reload, showForm, onCloseForm }) {
  const { toast, confirmar } = useUI();
  const isAdmin = Boolean(activeWorker && activeWorker.es_administrador);
  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setBusy(true);
    try {
      await api.post('proveedores', { nombre: nombre.trim(), contacto: contacto.trim() || null, telefono: telefono.trim() || null });
      const guardado = nombre.trim();
      setNombre('');
      setContacto('');
      setTelefono('');
      await reload();
      onCloseForm();
      toast(`Proveedor "${guardado}" agregado.`, 'success');
    } catch (ex) {
      toast('No se pudo agregar: ' + ex.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const eliminar = async (p) => {
    const ok = await confirmar(`¿Eliminar al proveedor "${p.nombre}"?`, {
      detail: 'Los productos que lo tenían asignado quedarán sin proveedor.',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await api.del(`proveedores?id=eq.${p.id}`);
      await reload();
    } catch (ex) {
      toast('No se pudo eliminar: ' + ex.message, 'error');
    }
  };

  return (
    <div>
      {!isAdmin && (
        <p className="hint" style={{ marginBottom: 16 }}>
          Solo un administrador puede agregar, editar o eliminar proveedores. Aquí puedes ver sus datos.
        </p>
      )}

      <div className="prov-list">
        {proveedores.map((p) =>
          editingId === p.id ? (
            <div className="prov-row" key={p.id}>
              <ProveedorEditForm
                p={p}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await reload();
                }}
              />
            </div>
          ) : (
            <div className="prov-row" key={p.id}>
              <div>
                <div className="name">{p.nombre}</div>
                <div className="sub">
                  {[p.contacto, p.telefono, p.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                </div>
                {p.notas && <div className="sub">{p.notas}</div>}
              </div>
              {isAdmin && (
                <div className="action-row" style={{ gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(p.id)}>
                    Editar
                  </button>
                  <button className="x-btn" onClick={() => eliminar(p)} title="Eliminar">
                    ✕
                  </button>
                </div>
              )}
            </div>
          )
        )}
        {proveedores.length === 0 && (
          <div className="empty-col">
            {isAdmin ? 'Aún no hay proveedores. Usa el botón “+” de arriba para agregar el primero.' : 'Aún no hay proveedores.'}
          </div>
        )}
      </div>

      <AnimatePresence>
      {showForm && isAdmin && (
        <FormModal key="form-proveedor" title="Nuevo proveedor" onClose={onCloseForm} maxWidth={440}>
          <form onSubmit={add}>
            <div className="field">
              <label>Nombre</label>
              <input required autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Distribuidora La Central" />
            </div>
            <div className="field">
              <label>Contacto (opcional)</label>
              <input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Nombre de la persona" />
            </div>
            <div className="field">
              <label>Teléfono (opcional)</label>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="8888-8888" />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy || !nombre.trim()}>
              {busy ? 'Guardando…' : 'Agregar proveedor'}
            </button>
          </form>
        </FormModal>
      )}
      </AnimatePresence>
    </div>
  );
}
