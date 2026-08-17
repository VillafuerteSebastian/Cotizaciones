import React, { useState } from 'react';
import { api } from '../supabaseClient.js';
import { hashPin } from '../pinUtils.js';
import PinModal from './PinModal.jsx';
import { useUI } from './UIProvider.jsx';

export default function TrabajadoresScreen({ profile, activeWorker, trabajadoresCyber, trabajadoresOcampo, reload, log }) {
  const { toast, confirmar } = useUI();
  const isCotizador = profile.role === 'cotizador';
  const tabla = isCotizador ? 'trabajadores_cyber' : 'trabajadores_ocampo';
  const lista = isCotizador ? trabajadoresCyber : trabajadoresOcampo;
  const isAdmin = Boolean(activeWorker && activeWorker.es_administrador);
  const [nombre, setNombre] = useState('');
  const [busy, setBusy] = useState(false);
  const [pinModal, setPinModal] = useState(null); // { worker, mode: 'set-admin' | 'change' }

  const add = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setBusy(true);
    try {
      await api.post(tabla, { nombre: nombre.trim() });
      if (log) await log('Agregó a equipo', nombre.trim());
      setNombre('');
      await reload();
    } catch (ex) {
      toast('No se pudo agregar: ' + ex.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleActivo = async (t) => {
    try {
      await api.patch(`${tabla}?id=eq.${t.id}`, { activo: !t.activo });
      if (log) await log(t.activo ? 'Desactivó persona' : 'Activó persona', t.nombre);
      await reload();
    } catch (ex) {
      toast('No se pudo actualizar: ' + ex.message, 'error');
    }
  };

  const quitarAdmin = async (t) => {
    const ok = await confirmar(`¿Quitarle el rol de administrador a "${t.nombre}"?`, { confirmLabel: 'Quitar rol' });
    if (!ok) return;
    try {
      await api.patch(`${tabla}?id=eq.${t.id}`, { es_administrador: false, pin: null });
      if (log) await log('Quitó administrador', t.nombre);
      await reload();
    } catch (ex) {
      toast('No se pudo actualizar: ' + ex.message, 'error');
    }
  };

  const quitarPin = async (t) => {
    const ok = await confirmar(`¿Quitarle el PIN a "${t.nombre}"?`, {
      detail: 'Cualquiera podrá seleccionarlo sin PIN.',
      confirmLabel: 'Quitar PIN',
    });
    if (!ok) return;
    try {
      await api.patch(`${tabla}?id=eq.${t.id}`, { pin: null });
      if (log) await log('Quitó PIN', t.nombre);
      await reload();
    } catch (ex) {
      toast('No se pudo actualizar: ' + ex.message, 'error');
    }
  };

  const guardarPin = async (pin) => {
    const hash = await hashPin(pin);
    const t = pinModal.worker;
    const patch = pinModal.mode === 'set-admin' ? { es_administrador: true, pin: hash } : { pin: hash };
    const updated = await api.patch(`${tabla}?id=eq.${t.id}`, patch);
    if (!updated || !updated[0] || updated[0].pin !== hash) {
      throw new Error('El PIN no se guardó. Vuelve a correr schema.sql en Supabase e inténtalo de nuevo.');
    }
    if (log) await log(pinModal.mode === 'set-admin' ? 'Hizo administrador' : 'Cambió PIN', t.nombre);
    setPinModal(null);
    await reload();
  };

  const eliminar = async (t) => {
    const ok = await confirmar(`¿Eliminar a "${t.nombre}" del equipo?`, {
      detail: 'Esto no borra las cotizaciones ya hechas.',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await api.del(`${tabla}?id=eq.${t.id}`);
      if (log) await log('Eliminó de equipo', t.nombre);
      await reload();
    } catch (ex) {
      toast('No se pudo eliminar: ' + ex.message, 'error');
    }
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
                {!t.es_administrador && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setPinModal({ worker: t, mode: 'set-admin' })}>
                    Hacer admin
                  </button>
                )}
                {t.es_administrador && (
                  <React.Fragment>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPinModal({ worker: t, mode: 'change' })}>
                      {t.pin ? 'Cambiar PIN' : 'Poner PIN'}
                    </button>
                    {t.pin && (
                      <button className="btn btn-ghost btn-sm" onClick={() => quitarPin(t)}>
                        Quitar PIN
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => quitarAdmin(t)}>
                      Quitar admin
                    </button>
                  </React.Fragment>
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

      {pinModal && (
        <PinModal
          title={pinModal.mode === 'set-admin' ? `PIN para ${pinModal.worker.nombre}` : `Cambiar PIN de ${pinModal.worker.nombre}`}
          subtitle="Este PIN se pedirá cada vez que alguien intente seleccionar a esta persona."
          confirmLabel="Guardar"
          onCancel={() => setPinModal(null)}
          onSubmit={guardarPin}
        />
      )}
    </div>
  );
}
