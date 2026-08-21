import React, { useState } from 'react';
import { api } from '../supabaseClient.js';
import ImagenInput from './ImagenInput.jsx';
import FormModal from './FormModal.jsx';

export default function NuevaCotizacionModal({ profile, activeWorker, escuelasSugeridas, onClose, onCreated }) {
  const isCotizador = profile.role === 'cotizador';
  const [titulo, setTitulo] = useState('');
  const [escuela, setEscuela] = useState('');
  const [productos, setProductos] = useState('');
  const [imagenNotas, setImagenNotas] = useState(null);
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
      const payload = {
        titulo: titulo.trim(),
        escuela: escuela.trim(),
        // El vinculo con la tabla de trabajadores de Ocampo solo aplica
        // cuando quien crea es Ocampo; si es Cyber, se deja sin ese
        // vinculo (la tabla es de otro equipo) pero igual se guarda el
        // nombre de quien la creo para mostrarlo.
        solicitante_trabajador_id: !isCotizador ? activeWorker.id : null,
        solicitante_nombre: activeWorker.nombre,
        creado_por: profile.id,
        notas_generales: productos.trim() || null,
        imagen_notas: imagenNotas || null,
      };
      const created = await api.post('cotizaciones', payload);
      onCreated(created[0].id, `${escuela.trim()} — ${titulo.trim()}`);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      title="Nueva cotización"
      subtitle={
        <React.Fragment>
          {isCotizador ? 'Creada por' : 'Solicita'}: <strong>{activeWorker ? activeWorker.nombre : '—'}</strong>
        </React.Fragment>
      }
      onClose={onClose}
      maxWidth={460}
    >
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
          <label>{isCotizador ? 'Notas / productos (opcional)' : 'Productos a cotizar'}</label>
          <textarea
            value={productos}
            onChange={(e) => setProductos(e.target.value)}
            placeholder={
              isCotizador
                ? 'Notas sobre el encargo, si hacen falta…'
                : 'Escribe aquí la lista, uno por línea. Ej:\n5 pizarras acrílicas\n10 marcadores de agua\n1 engrapadora industrial'
            }
            style={{ minHeight: 110 }}
          />
          {!isCotizador && <p className="hint">Cyber los verá aquí y agregará cada uno con precio, proveedor y demás datos.</p>}
        </div>
        <div className="field">
          <ImagenInput
            value={imagenNotas}
            onChange={setImagenNotas}
            label="Foto (opcional, ej. captura de Excel con la lista)"
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creando…' : 'Crear cotización'}
        </button>
      </form>
    </FormModal>
  );
}
