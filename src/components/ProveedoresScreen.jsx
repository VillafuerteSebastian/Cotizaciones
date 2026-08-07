import React, { useState } from 'react';
import { api } from '../supabaseClient.js';

export default function ProveedoresScreen({ proveedores, reload }) {
  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setBusy(true);
    await api.post('proveedores', {
      nombre: nombre.trim(),
      contacto: contacto.trim() || null,
      telefono: telefono.trim() || null,
    });
    setNombre('');
    setContacto('');
    setTelefono('');
    await reload();
    setBusy(false);
  };

  return (
    <div>
      <div className="auth-card" style={{ maxWidth: 520, marginBottom: 22, padding: 20 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>
          Agregar proveedor
        </div>
        <form onSubmit={add}>
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
          <div className="field">
            <label>Teléfono</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Agregar proveedor'}
          </button>
        </form>
      </div>

      <div className="prov-list">
        {proveedores.map((p) => (
          <div className="prov-row" key={p.id}>
            <div>
              <div className="name">{p.nombre}</div>
              <div className="sub">{[p.contacto, p.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div>
            </div>
          </div>
        ))}
        {proveedores.length === 0 && <div className="empty-col">Aún no hay proveedores.</div>}
      </div>
    </div>
  );
}
