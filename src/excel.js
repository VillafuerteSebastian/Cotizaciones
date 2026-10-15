// Lectura y exportación de Excel para Licitaciones.
//
// SheetJS pesa bastante, así que se carga solo cuando alguien sube o
// descarga un Excel (import dinámico), no al abrir la app.
//
// Idea central: el Excel de una licitación ya trae las columnas que hay que
// llenar (Precio, Marca, Proveedor…) en blanco. La app las reconoce y escribe
// AHÍ lo cotizado, en vez de agregar columnas nuevas al lado. Así el archivo
// que se descarga es el mismo que mandó la institución, pero lleno.

const cargarXLSX = () => import('xlsx');

const quitarAcentos = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const vacio = (v) => v === null || v === undefined || String(v).trim() === '';

// Las celdas vienen con tabulaciones y saltos de línea pegados del PDF o del
// Word original ("Audífonos\tcon\nmicrófono"). Se dejan en una sola línea para
// que la tabla, la búsqueda y las sugerencias no se rompan.
const limpiarCelda = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v);

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
      filas: filas.map((f) => f.map((c) => (c instanceof Date ? c.toLocaleDateString('es-CR') : limpiarCelda(c)))),
    };
  });
}

// Palabras que delatan una fila de encabezados.
const PALABRAS_ENCABEZADO = [
  /detall/, /descrip/, /producto/, /articulo/, /^item/, /renglon/, /linea/,
  /cantidad/, /^cant/, /unidad/, /medida/, /precio/, /costo/, /marca/,
  /proveedor/, /oferente/, /total/, /observac/, /nota/,
];

/**
 * Adivina qué fila es la de encabezados: muchas licitaciones traen arriba el
 * nombre de la institución, el número de trámite, etc. Se puntea cada una de
 * las primeras 25 filas: cuenta cuántas celdas de texto corto tiene y suma
 * fuerte por cada palabra típica de encabezado (precio, marca, cantidad…).
 * Las celdas larguísimas (una descripción de producto) restan.
 */
export function detectarEncabezado(filas) {
  let mejor = 0;
  let mejorPuntos = -Infinity;
  const limite = Math.min(filas.length, 25);
  for (let i = 0; i < limite; i++) {
    const celdas = filas[i].filter((c) => !vacio(c));
    if (!celdas.length) continue;
    let puntos = 0;
    for (const c of celdas) {
      if (typeof c !== 'string' || !isNaN(Number(c))) continue; // números: no son encabezado
      const txt = String(c);
      puntos += txt.length > 60 ? -2 : 1;
      if (PALABRAS_ENCABEZADO.some((p) => p.test(quitarAcentos(txt)))) puntos += 3;
    }
    // Un encabezado tiene filas debajo; la última fila con datos no lo es.
    if (i === filas.length - 1) puntos -= 5;
    if (puntos > mejorPuntos) {
      mejor = i;
      mejorPuntos = puntos;
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

  // Columnas sin encabezado y sin datos (los bordes del Excel) se descartan.
  // Las que tienen encabezado se quedan aunque vengan vacías: son justamente
  // las que hay que llenar.
  const conDatos = columnas.filter((c, i) => !vacio(enc[i]) || registros.some((r) => !vacio(r[c])));
  return { columnas: conDatos, registros };
}

// ---------------------------------------------------------------------------
// Qué llena la app

/**
 * Campos que la app agrega a cada renglón. `clave` es el sufijo de la columna
 * `col_*` de la licitación: si `col_precio` dice "Precio", lo que se escriba
 * en la app vive en esa columna del Excel original.
 */
export const CAMPOS_APP = [
  { clave: 'producto', item: 'producto_ofrecido', etiqueta: 'Producto ofrecido' },
  { clave: 'marca', item: 'marca', etiqueta: 'Marca' },
  { clave: 'proveedor', item: 'proveedor_nombre', etiqueta: 'Proveedor' },
  { clave: 'precio', item: 'precio_unitario', etiqueta: 'Precio unitario', numerico: true },
  { clave: 'total', item: null, etiqueta: 'Total', numerico: true, calculado: true },
  { clave: 'notas', item: 'notas', etiqueta: 'Notas' },
];

// Columnas de referencia (las llena la institución, en la app se leen) y
// columnas que llena la app. Ojo con el orden: "PRODUCTO" como primera columna
// de la licitación es la descripción del renglón, no el producto ofrecido, así
// que la descripción se busca primero y lo ya tomado no se vuelve a usar.
const PATRONES = {
  descripcion: [/descrip/, /detall/, /producto/, /articulo/, /bien/, /servicio/, /^item/, /renglon/, /nombre/],
  cantidad: [/^cant/, /cantidad/, /qty/],
  unidad: [/unidad/, /medida/, /^u\.?m/, /presentacion/],
  total: [/^total/, /sub ?total/, /monto total/, /precio total/],
  precio: [/precio/, /costo/, /^valor/, /p\.? ?unit/],
  proveedor: [/proveedor/, /suplidor/, /oferente/, /distribuidor/],
  marca: [/marca/, /fabricante/],
  producto: [/ofrec/, /ofert/, /cotiza/, /modelo/, /equivalente/],
  notas: [/nota/, /observac/, /comentario/],
};

// El orden importa: lo más específico primero, y lo ya tomado no se reutiliza.
const ORDEN_DETECCION = ['descripcion', 'cantidad', 'unidad', 'total', 'precio', 'proveedor', 'marca', 'producto', 'notas'];

/**
 * Adivina para qué sirve cada columna del Excel. Devuelve el mapa completo:
 * las de referencia (descripción, cantidad, unidad) y las que llena la app
 * (precio, proveedor, marca…), sin repetir columna.
 */
export function detectarColumnas(columnas) {
  const tomadas = new Set();
  const buscar = (patrones) => {
    const col = columnas.find((c) => !tomadas.has(c) && patrones.some((p) => p.test(quitarAcentos(c))));
    if (col) tomadas.add(col);
    return col || '';
  };
  const mapa = {};
  for (const k of ORDEN_DETECCION) mapa[k] = buscar(PATRONES[k]);
  if (!mapa.descripcion) mapa.descripcion = columnas.find((c) => !tomadas.has(c)) || columnas[0] || '';
  return mapa;
}

/**
 * Qué columna del Excel llena cada campo de la app, para una licitación ya
 * guardada. Las que se subieron antes de que existiera este mapeo no tienen
 * `col_precio` ni los demás: se adivinan igual que al importar, para que al
 * descargarlas lo cotizado caiga donde corresponde.
 */
export function mapaDeLicitacion(lic) {
  const columnas = lic?.columnas || [];
  const guardado = CAMPOS_APP.some((c) => lic?.[`col_${c.clave}`]);
  const base = guardado ? lic : detectarColumnas(columnas);
  const valor = (clave) => (guardado ? base[`col_${clave}`] : base[clave]) || '';
  return Object.fromEntries(CAMPOS_APP.map((c) => [c.clave, columnas.includes(valor(c.clave)) ? valor(c.clave) : '']));
}

/** Columnas del Excel que la app va a llenar, en un Set para consultas rápidas. */
export function columnasQueLlenaLaApp(lic) {
  return new Set(Object.values(mapaDeLicitacion(lic)).filter(Boolean));
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

/** Cantidad del renglón (del Excel); null si la licitación no trae cantidades. */
export const cantidadDe = (lic, item) => {
  if (item.cantidad !== null && item.cantidad !== undefined) return Number(item.cantidad);
  if (!lic?.col_cantidad) return null;
  return aNumero(item.datos?.[lic.col_cantidad]);
};

/** Total del renglón: precio × cantidad, o el precio si no hay cantidades. */
export const totalDe = (lic, item) => {
  if (item.precio_unitario === null || item.precio_unitario === undefined) return null;
  const cant = cantidadDe(lic, item);
  return Number(item.precio_unitario) * (cant === null ? 1 : cant);
};

/**
 * Reparte una fila del Excel: lo que va en `datos` (columnas de referencia) y
 * lo que va en los campos propios del renglón. Si el archivo viene a medio
 * llenar, esos valores entran ya cotizados.
 */
export function repartirRegistro(registro, mapa) {
  const datos = { ...registro };
  const item = {};
  for (const campo of CAMPOS_APP) {
    const col = mapa[campo.clave];
    if (!col) continue;
    const valor = datos[col];
    delete datos[col]; // una sola fuente de verdad: el campo del renglón
    if (campo.calculado || vacio(valor)) continue;
    item[campo.item] = campo.numerico ? aNumero(valor) : String(valor).trim();
  }
  item.descripcion = mapa.descripcion ? String(datos[mapa.descripcion] ?? '') || null : null;
  item.cantidad = mapa.cantidad ? aNumero(datos[mapa.cantidad]) : null;
  return { datos, item };
}

/**
 * Descarga la licitación como Excel: exactamente las columnas que mandó la
 * institución, con lo cotizado escrito en los espacios que venían en blanco.
 * No se agrega ninguna columna; lo que no tiene columna se queda en la app.
 */
export async function exportarLicitacion(lic, items) {
  const XLSX = await cargarXLSX();
  const originales = lic.columnas || [];
  const mapa = mapaDeLicitacion(lic);

  // Columna original -> campo de la app que la llena.
  const porColumna = new Map();
  for (const campo of CAMPOS_APP) {
    if (mapa[campo.clave]) porColumna.set(mapa[campo.clave], campo);
  }

  const valorDe = (campo, it) => {
    if (campo.calculado) return totalDe(lic, it) ?? '';
    const v = it[campo.item];
    if (campo.numerico) return v === null || v === undefined ? '' : Number(v);
    return v ?? '';
  };

  // El archivo sale con las mismas columnas que entró: no se agrega ninguna.
  // Lo que no tiene columna (por ejemplo las notas) se queda en la app.
  // Única excepción: si el Excel no trae ninguna columna de precio, se agrega
  // al final; si no, la descarga saldría sin lo cotizado.
  const campoPrecio = CAMPOS_APP.find((c) => c.clave === 'precio');
  const faltaPrecio = !mapa.precio && items.some((it) => !vacio(valorDe(campoPrecio, it)));
  const columnas = faltaPrecio ? [...originales, campoPrecio.etiqueta] : [...originales];
  const filas = items.map((it) => {
    const fila = originales.map((c) => {
      const campo = porColumna.get(c);
      return campo ? valorDe(campo, it) : (it.datos?.[c] ?? '');
    });
    if (faltaPrecio) fila.push(valorDe(campoPrecio, it));
    return fila;
  });

  const ws = XLSX.utils.aoa_to_sheet([columnas, ...filas]);

  // Formato de número para precios y totales: 12.500 en vez de 12500.
  const numericas = [...originales.map((c) => Boolean(porColumna.get(c)?.numerico)), ...(faltaPrecio ? [true] : [])];
  numericas.forEach((esNum, col) => {
    if (!esNum) return;
    for (let fila = 1; fila <= filas.length; fila++) {
      const celda = ws[XLSX.utils.encode_cell({ r: fila, c: col })];
      if (celda && typeof celda.v === 'number') celda.z = '#,##0.##';
    }
  });

  ws['!cols'] = columnas.map((c, i) => {
    const largo = filas.reduce((m, f) => Math.max(m, String(f[i] ?? '').length), String(c).length);
    return { wch: Math.min(Math.max(largo + 2, 12), 48) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (lic.hoja_nombre || 'Licitación').slice(0, 31));
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
