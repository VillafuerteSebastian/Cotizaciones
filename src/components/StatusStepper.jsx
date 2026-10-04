import React from 'react';
import { ESTADOS, CANCELADA, estadoInfo } from '../utils.js';

// Por defecto dibuja el flujo de cotizaciones; licitaciones le pasa su propio
// flujo (`estados`) y su estado "fuera del flujo" (`especial`, ej. No adjudicada).
export function StatusStepper({ estado, estados = ESTADOS, especial = CANCELADA }) {
  if (especial && estado === especial.key) {
    return (
      <div className="stepper stepper-cancelada">
        <span className="cancelada-pill">✕ {especial.label}</span>
      </div>
    );
  }
  const idx = estados.findIndex((e) => e.key === estado);
  return (
    <div className="stepper">
      {estados.map((e, i) => (
        <React.Fragment key={e.key}>
          {i > 0 && <div className={`bar ${i <= idx ? 'done' : ''}`} style={{ '--sc': e.color }} />}
          <div
            className={`dot ${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''}`}
            style={{ '--sc': e.color }}
            title={e.label}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

export function Badge({ estado, info }) {
  const i = info || estadoInfo(estado);
  return (
    <span className="badge" style={{ background: i.color }}>
      {i.label}
    </span>
  );
}
