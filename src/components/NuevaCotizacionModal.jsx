import React, { useState } from 'react';
import { api } from '../supabaseClient.js';

export default function NuevaCotizacionModal({ profile, activeWorker, escuelasSugeridas, onClose, onCreated }) {
  const [titulo, setTitulo] = useState('');
  const [escuela, setEscuela] = useState('');
  const [productos, setProductos] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!escuela.trim()) {
      setErr('Indica a nombre de qué escuela / cliente es la cotización.');
      return;
    }
    if (!activeWorker) {
      setErr('No se detectó quién eres. Cierra este cuadro y vuelve a seleccionarte desde el menú.');
      return;
    }
    setBusy(true);
    try {
      const created = await api.post('cotizaciones', {
        titulo: titulo.trim(),
        escuela: escuela.trim(),
        solicitante_trabajador_id: activeWorker.id,
        solicitante_nombre: activeWorker.nombre,
        creado_por: profile.id,
        notas_generales: productos.trim() || null,
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
        <p className="hint" style={{ marginBottom: 14 }}>
          Solicita: <strong>{activeWorker ? activeWorker.nombre : '—'}</strong>
        </p>
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
            <label>Productos a cotizar</label>
            <textarea
              value={productos}
              onChange={(e) => setProductos(e.target.value)}
              placeholder={'Escribe aquí la lista, uno por línea. Ej:\n5 pizarras acrílicas\n10 marcadores de agua\n1 engrapadora industrial'}
              style={{ minHeight: 110 }}
            />
            <p className="hint">Cyber los verá aquí y agregará cada uno con precio, proveedor y demás datos.</p>
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creando…' : 'Crear cotización'}
          </button>
        </form>
      </div>
    </div>
  );
}
