import React, { useState } from 'react';
import { api } from '../supabaseClient.js';

export default function TrabajadoresScreen({ profile, activeWorker, trabajadoresCyber, trabajadoresOcampo, reload, log }) {
  const isCotizador = profile.role === 'cotizador';
  const tabla = isCotizador ? 'trabajadores_cyber' : 'trabajadores_ocampo';
  const lista = isCotizador ? trabajadoresCyber : trabajadoresOcampo;
  const isAdmin = Boolean(activeWorker && activeWorker.es_administrador);
  const [nombre, setNombre] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setBusy(true);
    await api.post(tabla, { nombre: nombre.trim() });
    if (log) await log('Agregó a equipo', nombre.trim());
    setNombre('');
    await reload();
    setBusy(false);
  };

  const toggleActivo = async (t) => {
    await api.patch(`${tabla}?id=eq.${t.id}`, { activo: !t.activo });
    if (log) await log(t.activo ? 'Desactivó persona' : 'Activó persona', t.nombre);
    await reload();
  };

  const toggleAdmin = async (t) => {
    try {
      if (t.es_administrador) {
        if (!window.confirm(`¿Quitarle el rol de administrador a "${t.nombre}"?`)) return;
        await api.patch(`${tabla}?id=eq.${t.id}`, { es_administrador: false, pin: null });
        if (log) await log('Quitó administrador', t.nombre);
      } else {
        const pin = window.prompt(
          `Vas a hacer administrador a "${t.nombre}". Ponle un PIN (4 dígitos o más) que se pedirá cada vez que alguien intente seleccionarlo en "¿Quién eres?":`
        );
        if (!pin || !pin.trim()) return; // cancelado, no se hace admin sin PIN
        await api.patch(`${tabla}?id=eq.${t.id}`, { es_administrador: true, pin: pin.trim() });
        if (log) await log('Hizo administrador', t.nombre);
      }
      await reload();
    } catch (ex) {
      alert(`No se pudo actualizar: ${ex.message}`);
    }
  };

  const cambiarPin = async (t) => {
    const pin = window.prompt(`Nuevo PIN para "${t.nombre}" (déjalo vacío para quitarlo):`, '');
    if (pin === null) return; // canceló
    try {
      await api.patch(`${tabla}?id=eq.${t.id}`, { pin: pin.trim() || null });
      if (log) await log('Cambió PIN', t.nombre);
      await reload();
    } catch (ex) {
      alert(`No se pudo guardar el PIN: ${ex.message}`);
    }
  };

  const eliminar = async (t) => {
    if (!window.confirm(`¿Eliminar a "${t.nombre}" del equipo? Esto no borra las cotizaciones ya hechas.`)) return;
    await api.del(`${tabla}?id=eq.${t.id}`);
    if (log) await log('Eliminó de equipo', t.nombre);
    await reload();
  };

  return (
    <div>
      <p className="hint" style={{ marginBottom: 16 }}>
        {isCotizador
          ? 'Personas de Cyber que pueden seleccionarse como quien cotizó un producto (precio/proveedor).'
          : 'Personas de Ocampo que pueden seleccionarse como quien solicita una cotización.'}
      </p>

      {isAdmin ? (
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
      ) : (
        <p className="hint" style={{ marginBottom: 16 }}>
          Solo un administrador del equipo puede agregar, desactivar o eliminar personas. Pídele a{' '}
          {lista.find((t) => t.es_administrador)?.nombre || 'un administrador'} que lo haga, o que te dé el rol.
        </p>
      )}

      <div className="prov-list">
        {lista.map((t) => (
          <div className="prov-row" key={t.id}>
            <div>
              <div className="name">
                {t.nombre}
                {t.es_administrador && (
                  <span
                    className="badge"
                    style={{ background: t.pin ? 'var(--primary)' : 'var(--danger)', marginLeft: 8, fontSize: 10 }}
                  >
                    {t.pin ? 'Admin 🔒' : 'Admin sin PIN ⚠️'}
                  </span>
                )}
              </div>
              <div className="sub">{t.activo ? 'Activo' : 'Inactivo'}</div>
            </div>
            {isAdmin && (
              <div className="row" style={{ flex: 'none', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => toggleAdmin(t)}>
                  {t.es_administrador ? 'Quitar admin' : 'Hacer admin'}
                </button>
                {t.es_administrador && (
                  <button className="btn btn-ghost btn-sm" onClick={() => cambiarPin(t)}>
                    {t.pin ? 'Cambiar PIN' : 'Poner PIN'}
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => toggleActivo(t)}>
                  {t.activo ? 'Desactivar' : 'Activar'}
                </button>
                <button className="x-btn" onClick={() => eliminar(t)} title="Eliminar">
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
        {lista.length === 0 && <div className="empty-col">Aún no hay nadie en la lista.</div>}
      </div>
    </div>
  );
}
