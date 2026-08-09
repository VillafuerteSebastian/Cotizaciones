import React, { useState } from 'react';
import { api } from '../supabaseClient.js';

export default function NuevaCotizacionModal({ profile, activeWorker, trabajadoresOcampo, escuelasSugeridas, onClose, onCreated }) {
  const [titulo, setTitulo] = useState('');
  const [escuela, setEscuela] = useState('');
  const [trabajadorId, setTrabajadorId] = useState(activeWorker ? activeWorker.id : '');
  const [notas, setNotas] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!escuela.trim()) {
      setErr('Indica a nombre de qué escuela / cliente es la cotización.');
      return;
    }
    if (!trabajadorId) {
      setErr('Indica quién de Ocampo está solicitando esta cotización.');
      return;
    }
    setBusy(true);
    try {
      const trabajador = trabajadoresOcampo.find((t) => t.id === trabajadorId);
      const created = await api.post('cotizaciones', {
        titulo: titulo.trim(),
        escuela: escuela.trim(),
        solicitante_trabajador_id: trabajadorId,
        solicitante_nombre: trabajador ? trabajador.nombre : '',
        creado_por: profile.id,
        notas_generales: notas.trim() || null,
      });
      onCreated(created[0].id, `${escuela.trim()} — ${titulo.trim()}`);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-top">
          <h2>Nueva cotización</h2>
          <button className="x-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        {err && <div className="err">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Título / descripción del encargo</label>
            <input required value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Material de limpieza para bodega" />
          </div>
          <div className="field">
            <label>Escuela / cliente</label>
            <input
              required
              list="escuelas-sugeridas"
              value={escuela}
              onChange={(e) => setEscuela(e.target.value)}
              placeholder="Ej: Escuela Juan Santamaría"
            />
            <datalist id="escuelas-sugeridas">
              {escuelasSugeridas.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>¿Quién solicita? (Ocampo)</label>
            <select required value={trabajadorId} onChange={(e) => setTrabajadorId(e.target.value)}>
              <option value="">— Selecciona —</option>
              {trabajadoresOcampo.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
            {trabajadoresOcampo.length === 0 && (
              <p className="hint">Aún no hay nadie en la lista de Ocampo. Agrégalo en la pestaña "Equipo".</p>
            )}
          </div>
          <div className="field">
            <label>Notas generales (opcional)</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creando…' : 'Crear cotización'}
          </button>
        </form>
      </div>
    </div>
  );
}
