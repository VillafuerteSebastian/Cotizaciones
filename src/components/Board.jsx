import React from 'react';
import { ESTADOS, fmtMoney, fmtDateTime, itemsTotal } from '../utils.js';
import { StatusStepper } from './StatusStepper.jsx';

function CotizacionCard({ c, onOpen }) {
  const total = itemsTotal(c.cotizacion_items);
  return (
    <div className="card" onClick={() => onOpen(c.id)}>
      <div className="folio">#{c.folio}</div>
      <div className="titulo">{c.titulo}</div>
      <div className="meta">
        <span>{c.solicitante_nombre}</span>
        <span>{(c.cotizacion_items || []).length} prod.</span>
      </div>
      <StatusStepper estado={c.estado} />
      <div className="meta" style={{ marginTop: 8, marginBottom: 0 }}>
        <span>{fmtDateTime(c.created_at)}</span>
        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{total > 0 ? fmtMoney(total) : ''}</span>
      </div>
    </div>
  );
}

export default function Board({ cotizaciones, onOpen }) {
  return (
    <div className="board">
      {ESTADOS.map((estado) => {
        const list = cotizaciones.filter((c) => c.estado === estado.key);
        return (
          <div className="col" key={estado.key}>
            <div className="col-head">
              <span className="sw" style={{ background: estado.color }} />
              <h3>{estado.label}</h3>
              <span className="count">{list.length}</span>
            </div>
            {list.length === 0 && <div className="empty-col">Sin cotizaciones</div>}
            {list.map((c) => (
              <CotizacionCard key={c.id} c={c} onOpen={onOpen} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
