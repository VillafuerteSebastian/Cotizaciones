// Lectura y exportación de Excel para Licitaciones.
//
// SheetJS pesa bastante, así que se carga solo cuando alguien sube o
// descarga un Excel (import dinámico), no al abrir la app.

const cargarXLSX = () => import('xlsx');

const quitarAcentos = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const vacio = (v) => v === null || v === undefined || String(v).trim() === '';

/** Lee todas las hojas de un archivo como matrices de celdas (texto/número). */
export async function leerExcel(file) {
  const XLSX = await cargarXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  return wb.SheetNames.map((nombre) => {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], {
      header: 1,
      raw: true,
      defval: '',
      blankrows: false,
    });
    return {
      nombre,
      filas: filas.map((f) => f.map((c) => (c instanceof Date ? c.toLocaleDateString('es-CR') : c))),
    };
  });
}

/**
 * Adivina qué fila es la de encabezados: muchas licitaciones traen arriba el
 * nombre de la institución, el número de trámite, etc. Se toma, entre las
 * primeras 25 filas, la que tenga más celdas de texto (no números) llenas.
 */
export function detectarEncabezado(filas) {
  let mejor = 0;
  let mejorPuntos = -1;
  const limite = Math.min(filas.length, 25);
  for (let i = 0; i < limite; i++) {
    const textos = filas[i].filter((c) => !vacio(c) && typeof c === 'string' && isNaN(Number(c))).length;
    if (textos > mejorPuntos) {
      mejor = i;
      mejorPuntos = textos;
    }
  }
  return mejor;
}

/** Arma columnas únicas y registros {columna: valor} a partir de la fila de encabezado. */
export function construirTabla(filas, filaEncabezado) {
  const enc = filas[filaEncabezado] || [];
  const ancho = Math.max(enc.length, ...filas.slice(filaEncabezado + 1).map((f) => f.length), 0);
  const usados = new Set();
  const columnas = [];
  for (let i = 0; i < ancho; i++) {
    let base = vacio(enc[i]) ? `Columna ${i + 1}` : String(enc[i]).replace(/\s+/g, ' ').trim();
    let nombre = base;
    let n = 2;
    while (usados.has(nombre)) nombre = `${base} (${n++})`;
    usados.add(nombre);
    columnas.push(nombre);
  }

  const registros = [];
  for (const fila of filas.slice(filaEncabezado + 1)) {
    if (fila.every(vacio)) continue;
    const r = {};
    columnas.forEach((col, i) => {
      if (!vacio(fila[i])) r[col] = fila[i];
    });
    registros.push(r);
  }

  // Columnas que vienen completamente vacías (bordes del Excel) se descartan.
  const conDatos = columnas.filter((c) => !vacio(enc[columnas.indexOf(c)]) || registros.some((r) => !vacio(r[c])));
  return { columnas: conDatos, registros };
}

/** Adivina cuál columna es la descripción, la cantidad y la unidad. */
export function detectarColumnas(columnas) {
  const buscar = (patrones) => columnas.find((c) => patrones.some((p) => p.test(quitarAcentos(c)))) || '';
  return {
    descripcion: buscar([/descrip/, /producto/, /articulo/, /detalle/, /bien/, /nombre/, /item/]) || columnas[0] || '',
    cantidad: buscar([/^cant/, /cantidad/, /qty/]),
    unidad: buscar([/unidad/, /medida/, /^u\.?m/, /presentacion/]),
  };
}

export const aNumero = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const limpio = String(v).replace(/[^\d.,-]/g, '');
  if (!/\d/.test(limpio)) return null;
  // "1.200" o "12.500.000" sin coma: puntos de miles (formato CR), no decimales.
  if (/^-?\d{1,3}(\.\d{3})+$/.test(limpio)) return Number(limpio.replace(/\./g, ''));
  // "1.234,50" (formato CR) o "1,234.50" (formato EE.UU.)
  const normal =
    limpio.lastIndexOf(',') > limpio.lastIndexOf('.')
      ? limpio.replace(/\./g, '').replace(',', '.')
      : limpio.replace(/,/g, '');
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
};

/** Descarga la licitación como Excel: columnas originales + lo cotizado. */
export async function exportarLicitacion(lic, items) {
  const XLSX = await cargarXLSX();
  const extra = ['Producto ofrecido', 'Proveedor', 'Precio unitario', 'Total', 'Notas'];
  const columnas = [...(lic.columnas || []), ...extra];
  const filas = items.map((it) => {
    const cant = lic.col_cantidad ? aNumero(it.datos?.[lic.col_cantidad]) : null;
    const precio = it.precio_unitario === null || it.precio_unitario === undefined ? null : Number(it.precio_unitario);
    return [
      ...(lic.columnas || []).map((c) => it.datos?.[c] ?? ''),
      it.producto_ofrecido || '',
      it.proveedor_nombre || '',
      precio ?? '',
      precio !== null ? precio * (cant ?? 1) : '',
      it.notas || '',
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([columnas, ...filas]);
  ws['!cols'] = columnas.map((c) => ({ wch: Math.min(Math.max(String(c).length + 2, 12), 48) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Licitación');
  const seguro = `${lic.folio ? `L${lic.folio} ` : ''}${lic.titulo || 'licitacion'}`.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
  XLSX.writeFile(wb, `${seguro}.xlsx`);
}

// ---------------------------------------------------------------------------
// Sugerencias: ¿ya se cotizó algo parecido antes?
// Compara palabras (sin acentos, de 3+ letras) entre la descripción del
// renglón y lo cotizado previamente.

const PALABRAS_VACIAS = new Set(['con', 'para', 'por', 'los', 'las', 'del', 'una', 'uno', 'que', 'tipo', 'color', 'unidad', 'marca']);

export function palabras(texto) {
  return Array.from(
    new Set(
      quitarAcentos(texto)
        .split(/[^a-z0-9ñ]+/)
        .filter((w) => w.length >= 3 && !PALABRAS_VACIAS.has(w))
    )
  );
}

/** Devuelve hasta `max` entradas del historial ordenadas por parecido. */
export function sugerir(texto, historial, max = 3) {
  const q = palabras(texto);
  if (!q.length) return [];
  const resultado = [];
  for (const h of historial) {
    if (!h._palabras) h._palabras = palabras(h.texto);
    let comunes = 0;
    for (const w of q) if (h._palabras.includes(w)) comunes++;
    const puntos = comunes / Math.max(q.length, 1);
    if (comunes >= 1 && puntos >= 0.5) resultado.push({ ...h, puntos });
  }
  resultado.sort((a, b) => b.puntos - a.puntos || (b.fecha || '').localeCompare(a.fecha || ''));
  // Una sola sugerencia por producto/proveedor (la más reciente gana por el sort).
  const vistos = new Set();
  return resultado
    .filter((r) => {
      const k = `${quitarAcentos(r.producto)}|${quitarAcentos(r.proveedor)}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, max);
}
