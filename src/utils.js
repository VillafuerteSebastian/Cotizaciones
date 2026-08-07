export const ESTADOS = [
  { key: 'cotizacion', label: 'En cotización', color: 'var(--c-cotizacion)' },
  { key: 'pedido', label: 'Pedido', color: 'var(--c-pedido)' },
  { key: 'en_camino', label: 'En camino', color: 'var(--c-camino)' },
  { key: 'en_tienda', label: 'En tienda', color: 'var(--c-tienda)' },
  { key: 'entregado', label: 'Entregado', color: 'var(--c-entregado)' },
];

export const estadoInfo = (k) => ESTADOS.find((e) => e.key === k) || ESTADOS[0];

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
