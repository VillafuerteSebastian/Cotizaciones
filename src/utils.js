export const ESTADOS = [
  { key: 'cotizacion', label: 'En cotización', color: 'var(--c-cotizacion)' },
  { key: 'pedido', label: 'Pedido', color: 'var(--c-pedido)' },
  { key: 'en_camino', label: 'En camino', color: 'var(--c-camino)' },
  { key: 'en_tienda', label: 'En tienda', color: 'var(--c-tienda)' },
  { key: 'entregado', label: 'Entregado', color: 'var(--c-entregado)' },
];

// Estado especial fuera del flujo lineal: una cotización cancelada no avanza
// más, así que no forma parte del stepper de progreso.
export const CANCELADA = { key: 'cancelada', label: 'Cancelada', color: 'var(--danger)' };

export const estadoInfo = (k) => ESTADOS.find((e) => e.key === k) || (k === CANCELADA.key ? CANCELADA : ESTADOS[0]);

// Flujo simplificado para apartados/pedidos hechos directamente en tienda
// (solo Cyber los ve): pedido -> en camino -> llegó a tienda -> entregado.
export const ESTADOS_APARTADO = [
  { key: 'pedido', label: 'Pedido', color: '#F59E0B' },
  { key: 'en_camino', label: 'En camino', color: '#004AAD' },
  { key: 'en_tienda', label: 'Llegó a tienda', color: '#7C3AED' },
  { key: 'entregado', label: 'Entregado', color: '#16A34A' },
];

export const estadoApartadoInfo = (k) => ESTADOS_APARTADO.find((e) => e.key === k) || ESTADOS_APARTADO[0];

// Prioridad de reposición de un faltante. Orden de más a menos urgente:
// se usa tanto para el color/etiqueta como para ordenar la lista de
// pendientes (alta primero).
export const PRIORIDADES_FALTANTE = [
  { key: 'alta', label: 'Alta', color: '#DC2626', soft: '#FEF2F2' },
  { key: 'media', label: 'Media', color: '#B45309', soft: '#FFFBEB' },
  { key: 'baja', label: 'Baja', color: '#15803D', soft: '#ECFDF3' },
];

export const prioridadFaltanteInfo = (k) => PRIORIDADES_FALTANTE.find((p) => p.key === k) || PRIORIDADES_FALTANTE[1];

export const fmtMoney = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0,
  }).format(n);
};

export const fmtDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })
  );
};

export const itemsTotal = (items) =>
  (items || []).reduce((sum, it) => sum + Number(it.precio_final || 0) * Number(it.cantidad || 1), 0);

// Licitaciones (Cyber y Ocampo). Igual que las cotizaciones: un flujo lineal
// (abierta → cotizando → oferta enviada → adjudicada) y un estado aparte,
// "No adjudicada", que funciona como la "Cancelada" de las cotizaciones.
export const FLUJO_LICITACION = [
  { key: 'abierta', label: 'Abierta', color: '#64748B' },
  { key: 'cotizando', label: 'Cotizando', color: '#C27A0E' },
  { key: 'enviada', label: 'Oferta enviada', color: '#004AAD' },
  { key: 'adjudicada', label: 'Adjudicada', color: '#15803D' },
];

export const NO_ADJUDICADA = { key: 'no_adjudicada', label: 'No adjudicada', color: '#C2282B' };

export const ESTADOS_LICITACION = [...FLUJO_LICITACION, NO_ADJUDICADA];

export const estadoLicitacionInfo = (k) => ESTADOS_LICITACION.find((e) => e.key === k) || ESTADOS_LICITACION[0];

// Días que faltan para una fecha (YYYY-MM-DD), contando desde hoy a medianoche.
export const diasHasta = (fecha) => {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(`${fecha}T00:00:00`);
  return Math.round((f - hoy) / 86400000);
};

export const fmtFecha = (fecha) =>
  fecha ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
