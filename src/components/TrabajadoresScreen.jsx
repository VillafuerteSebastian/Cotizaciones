import React, { useState } from 'react';
import { api } from '../supabaseClient.js';

export default function TrabajadoresScreen({ profile, trabajadoresCyber, trabajadoresOcampo, reload }) {
  const isCotizador = profile.role === 'cotizador';
  const tabla = isCotizador ? 'trabajadores_cyber' : 'trabajadores_ocampo';
  const lista = isCotizador ? trabajadoresCyber : trabajadoresOcampo;
  const [nombre, setNombre] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setBusy(true);
    await api.post(tabla, { nombre: nombre.trim() });
    setNombre('');
    await reload();
    setBusy(false);
  };

  const toggleActivo = async (t) => {
    await api.patch(`${tabla}?id=eq.${t.id}`, { activo: !t.activo });
    await reload();
  };

  return (
    <div>
      <p className="hint" style={{ marginBottom: 16 }}>
        {isCotizador
          ? 'Personas de Cyber que pueden seleccionarse como quien cotizó un producto (precio/proveedor).'
          : 'Personas de Ocampo que pueden seleccionarse como quien solicita una cotización.'}
      </p>
      <div className="auth-card" style={{ maxWidth: 420, marginBottom: 22, padding: 20 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>
          Agregar persona
        </div>
        <form onSubmit={add}>
          <div className="row">
            <div className="field">
              <label>Nombre</label>
              <input required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
            </div>
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Agregar'}
          </button>
        </form>
      </div>

      <div className="prov-list">
        {lista.map((t) => (
          <div className="prov-row" key={t.id}>
            <div>
              <div className="name">{t.nombre}</div>
              <div className="sub">{t.activo ? 'Activo' : 'Inactivo'}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => toggleActivo(t)}>
              {t.activo ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        ))}
        {lista.length === 0 && <div className="empty-col">Aún no hay nadie en la lista.</div>}
      </div>
    </div>
  );
}
