import React from 'react';
import { fmtDateTime } from '../utils.js';

export default function ActividadScreen({ actividad }) {
  return (
    <div>
      <p className="hint" style={{ marginBottom: 16 }}>
        Registro de acciones de ambas cuentas, para saber quién hizo qué.
      </p>
      <div className="prov-list">
        {actividad.map((a) => (
          <div className="prov-row" key={a.id}>
            <div>
              <div className="name">
                {a.trabajador_nombre || (a.profile_role === 'cotizador' ? 'Cyber' : 'Ocampo')} · {a.accion}
              </div>
              <div className="sub">
                {a.detalle} · {fmtDateTime(a.created_at)}
              </div>
            </div>
          </div>
        ))}
        {actividad.length === 0 && <div className="empty-col">Aún no hay actividad registrada.</div>}
      </div>
    </div>
  );
}
