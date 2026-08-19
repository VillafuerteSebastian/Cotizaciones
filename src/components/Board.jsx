import React, { useState } from 'react';
import { ESTADOS, CANCELADA, fmtMoney, fmtDateTime, itemsTotal } from '../utils.js';
import { StatusStepper } from './StatusStepper.jsx';

const COLUMNAS = [...ESTADOS, CANCELADA];

function CotizacionCard({ c, onOpen, draggable, onDragStart, onDragEnd, dragging }) {
  const total = itemsTotal(c.cotizacion_items);
  return (
    <div className="card" draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(e, c) : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={() => onOpen(c.id)}
      style={{ opacity: dragging ? 0.4 : 1, cursor: draggable ? 'grab' : 'pointer' }}>
      <div className="folio">#{c.folio} · {c.escuela}</div>
      <div className="titulo">{c.titulo}</div>
      <div className="meta">
        <span>Solicita: {c.solicitante_nombre}</span>
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

export default function Board({ cotizaciones, onOpen, canDrag, onMoveEstado }) {
  const [draggingId, setDraggingId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [mobileEstado, setMobileEstado] = useState(COLUMNAS[0].key);

  const onDragStart = (e, c) => {
    setDraggingId(c.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', c.id);
  };
  const onDragEnd = () => { setDraggingId(null); setOverCol(null); };
  const onDropCol = (e, estadoKey) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    setDraggingId(null); setOverCol(null);
    if (!id) return;
    const c = cotizaciones.find((x) => x.id === id);
    if (c && c.estado !== estadoKey) onMoveEstado(id, estadoKey, c);
  };

  return (
    <div className="board">
      <div className="mobile-board-tabs" role="tablist" aria-label="Estados de cotizaciones">
        {COLUMNAS.map((estado) => {
          const count = cotizaciones.filter((c) => c.estado === estado.key).length;
          const active = mobileEstado === estado.key;
          return (
            <button key={estado.key} type="button"
              className={`mobile-board-tab${active ? ' active' : ''}`}
              onClick={() => setMobileEstado(estado.key)}
              role="tab" aria-selected={active}>
              <span className="mobile-board-tab-dot" style={{ background: estado.color }} />
              <span className="mobile-board-tab-label">{estado.label}</span>
              <span className="mobile-board-tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      {COLUMNAS.map((estado) => {
        const list = cotizaciones.filter((c) => c.estado === estado.key);
        const isOver = overCol === estado.key;
        const esCancelada = estado.key === CANCELADA.key;
        const visibleOnMobile = mobileEstado === estado.key;
        return (
          <div className={`col${esCancelada ? ' col-cancelada' : ''}${visibleOnMobile ? ' mobile-col-active' : ''}`}
            key={estado.key}
            onDragOver={canDrag ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overCol !== estado.key) setOverCol(estado.key);
            } : undefined}
            onDragLeave={canDrag ? () => setOverCol((prev) => prev === estado.key ? null : prev) : undefined}
            onDrop={canDrag ? (e) => onDropCol(e, estado.key) : undefined}
            style={isOver ? { background: '#E4E9FB', outline: '2px dashed var(--primary)', outlineOffset: -2 } : undefined}>
            <div className="col-head">
              <span className="sw" style={{ background: estado.color }} />
              <h3>{estado.label}</h3>
              <span className="count">{list.length}</span>
            </div>
            {list.length === 0 && <div className="empty-col">{canDrag ? 'No hay cotizaciones aquí' : 'Sin cotizaciones'}</div>}
            {list.map((c) => (
              <CotizacionCard key={c.id} c={c} onOpen={onOpen} draggable={canDrag}
                onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={draggingId === c.id} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
