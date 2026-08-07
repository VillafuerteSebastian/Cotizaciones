import React from 'react';
import { ESTADOS, estadoInfo } from '../utils.js';

export function StatusStepper({ estado }) {
  const idx = ESTADOS.findIndex((e) => e.key === estado);
  return (
    <div className="stepper">
      {ESTADOS.map((e, i) => (
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

export function Badge({ estado }) {
  const info = estadoInfo(estado);
  return (
    <span className="badge" style={{ background: info.color }}>
      {info.label}
    </span>
  );
}
