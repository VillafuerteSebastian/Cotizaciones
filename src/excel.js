// Lectura y exportación de Excel para Licitaciones.
//
// SheetJS pesa bastante, así que se carga solo cuando alguien sube o
// descarga un Excel (import dinámico), no al abrir la app.
//
// Idea central: el Excel de una licitación ya trae las columnas que hay que
// llenar (Precio, Marca, Proveedor…) en blanco. La app las reconoce y escribe
// AHÍ lo cotizado, en vez de agregar columnas nuevas al lado. Así el archivo
// que se descarga es el mismo que mandó la institución, pero lleno.

import { storage } from './supabaseClient.js';

const cargarXLSX = () => import('xlsx');
// fflate (~8 KB) abre y vuelve a cerrar el .xlsx, que por dentro es un .zip.
const cargarZip = () => import('fflate');

/** Bucket privado de Supabase Storage con los Excel originales. */
export const BUCKET_LICITACIONES = 'licitaciones';

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

/**
 * Lee todas las hojas de un archivo como matrices de celdas (texto/número).
 * Además de las filas, guarda DÓNDE está cada una en el Excel real:
 * `numFila[i]` es el número de fila (1, 2, 3…) de `filas[i]`, y `colInicio`
 * es la columna (0 = A) donde arranca cada fila. Con eso, al descargar, lo
 * cotizado se escribe en la celda exacta del archivo original.
 */
export async function leerExcel(file) {
  const XLSX = await cargarXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  return wb.SheetNames.map((nombre) => {
    const ws = wb.Sheets[nombre];
    const rango = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 } };
    // Con las filas en blanco incluidas, el índice + la fila inicial del rango
    // da el número real de fila. Las vacías se quitan después.
    const todas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
    const filas = [];
    const numFila = [];
    todas.forEach((f, i) => {
      const limpia = f.map((c) => (c instanceof Date ? c.toLocaleDateString('es-CR') : limpiarCelda(c)));
      if (limpia.every(vacio)) return;
      filas.push(limpia);
      numFila.push(rango.s.r + i + 1);
    });
    return { nombre, filas, numFila, colInicio: rango.s.c };
  });
}

/** 0 → "A", 25 → "Z", 26 → "AA"… */
export function letraColumna(indice) {
  let n = indice + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
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

// Celda que es solo una etiqueta de totales: "SUB-TOTAL:", "I.V.A:", "TOTAL:".
const esCeldaDeTotales = (c) =>
  typeof c === 'string' &&
  /^(sub\s*-?\s*total|total(\s+general)?|i\.?\s*v\.?\s*a\.?|impuestos?)\s*:?$/.test(quitarAcentos(c));

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
  // Índice (dentro de `filas`) de donde salió cada registro.
  const origen = [];
  for (let f = filaEncabezado + 1; f < filas.length; f++) {
    const fila = filas[f];
    if (fila.every(vacio)) continue;
    // El pie de la tabla (SUB-TOTAL, I.V.A, TOTAL, firmas, porcentajes…) no son
    // renglones: desde la primera fila de totales en adelante se descarta todo.
    if (registros.length && fila.some(esCeldaDeTotales)) break;
    const r = {};
    columnas.forEach((col, i) => {
      if (!vacio(fila[i])) r[col] = fila[i];
    });
    registros.push(r);
    origen.push(f);
  }

  // Columnas sin encabezado y sin datos (los bordes del Excel) se descartan.
  // Las que tienen encabezado se quedan aunque vengan vacías: son justamente
  // las que hay que llenar.
  const conDatos = columnas.filter((c, i) => !vacio(enc[i]) || registros.some((r) => !vacio(r[c])));
  // Posición de cada columna dentro de la fila (0 = primera columna leída).
  const posicion = Object.fromEntries(conDatos.map((c) => [c, columnas.indexOf(c)]));
  return { columnas: conDatos, registros, origen, posicion };
}

/** Formatos que se pueden devolver con su diseño intacto (son un .zip con XML). */
export const esXlsx = (nombre) => /\.(xlsx|xlsm)$/i.test(nombre || '');

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
  // Todos los renglones salen con EXACTAMENTE las mismas llaves (null si no hay
  // valor). PostgREST rechaza un insert en lote si una fila trae una llave que
  // otra no trae (PGRST102 "All object keys must match").
  const item = {};
  for (const campo of CAMPOS_APP) {
    if (campo.item) item[campo.item] = null;
  }
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
 * Descarga la licitación como Excel.
 *
 * Si se guardó el archivo original (.xlsx), se devuelve ESE MISMO archivo con
 * su diseño intacto (membrete, logo, bordes, celdas combinadas, totales,
 * firma, área de impresión…) y solo se escriben las celdas de lo cotizado.
 *
 * Si no hay original (licitaciones viejas, o un .xls/.csv/.ods), se arma una
 * hoja simple con las columnas de la institución, como antes.
 *
 * Devuelve { fuera }: cuántos renglones agregados en la app no tienen fila en
 * el Excel original (no se pueden meter sin descuadrar el diseño).
 */
export async function exportarLicitacion(lic, items) {
  const conPosicion = items.some((it) => it.fila_excel);
  if (lic.archivo_path && lic.columnas_excel && conPosicion) {
    return exportarSobreOriginal(lic, items);
  }
  await exportarTablaSimple(lic, items);
  return { fuera: 0 };
}

const nombreDescarga = (lic) => {
  const base = `${lic.folio ? `L${lic.folio} ` : ''}${lic.titulo || 'licitacion'}`;
  return base.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
};

function descargarBytes(bytes, nombre, tipo) {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Valor que la app escribe en la celda de un campo para un renglón. */
function valorCampo(lic, campo, it) {
  if (campo.calculado) return totalDe(lic, it);
  const v = it[campo.item];
  if (v === null || v === undefined || v === '') return null;
  return campo.numerico ? Number(v) : String(v);
}

async function exportarSobreOriginal(lic, items) {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await cargarZip();
  const archivo = unzipSync(new Uint8Array(await storage.bajar(BUCKET_LICITACIONES, lic.archivo_path)));
  const xml = (ruta) => new DOMParser().parseFromString(strFromU8(archivo[ruta]), 'application/xml');
  const guardar = (ruta, doc) => {
    // Algunos navegadores conservan la declaración <?xml?> al serializar y
    // otros no: se quita y se pone una sola.
    const txt = new XMLSerializer().serializeToString(doc).replace(/^\s*<\?xml[^>]*\?>\s*/, '');
    archivo[ruta] = strToU8(XML_DECL + txt);
  };

  const libro = xml('xl/workbook.xml');
  const rutaHoja = rutaDeHoja(libro, xml('xl/_rels/workbook.xml.rels'), lic.hoja_nombre);
  if (!rutaHoja || !archivo[rutaHoja]) throw new Error('No se encontró la hoja original dentro del Excel.');
  const hoja = xml(rutaHoja);
  const hojaXml = new HojaXml(hoja);

  const mapa = mapaDeLicitacion(lic);
  const letras = lic.columnas_excel || {};
  const campos = CAMPOS_APP.map((campo) => ({ campo, letra: letras[mapa[campo.clave]] })).filter((x) => x.letra);

  let fuera = 0;
  for (const it of items) {
    if (!it.fila_excel) {
      fuera++;
      continue;
    }
    for (const { campo, letra } of campos) {
      const celda = hojaXml.celda(`${letra}${it.fila_excel}`);
      // El total del Excel suele ser una fórmula (=D10*G10): se respeta y
      // Excel la recalcula. Solo si es un valor fijo se escribe el total.
      if (campo.calculado && hojaXml.tieneFormula(celda)) continue;
      hojaXml.escribir(celda, valorCampo(lic, campo, it));
    }
  }

  // Las fórmulas guardan su último resultado; se borra para que Excel (y
  // LibreOffice) las recalculen con los precios nuevos al abrir.
  hojaXml.olvidarResultados();
  guardar(rutaHoja, hoja);

  // Pedirle a Excel que recalcule todo al abrir, y quitar la cadena de cálculo
  // vieja (si una celda dejó de ser fórmula, Excel la daría por "dañada").
  marcarRecalculo(libro);
  guardar('xl/workbook.xml', libro);
  quitarCalcChain(archivo, xml, guardar);

  const bytes = zipSync(archivo, { level: 6 });
  const nombre = lic.archivo_nombre && esXlsx(lic.archivo_nombre) ? lic.archivo_nombre : `${nombreDescarga(lic)}.xlsx`;
  descargarBytes(bytes, nombre, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return { fuera };
}

/** Exporta una hoja simple con las columnas de la institución (sin diseño). */
async function exportarTablaSimple(lic, items) {
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
  XLSX.writeFile(wb, `${nombreDescarga(lic)}.xlsx`);
}

// ---------------------------------------------------------------------------
// Edición del .xlsx original a nivel de XML
//
// Se toca únicamente <c> (celdas) de la hoja de la licitación. Estilos,
// combinadas, imágenes, formas, área de impresión, otras hojas… no se leen ni
// se reescriben, así que salen idénticos.

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_REL_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_XML = 'http://www.w3.org/XML/1998/namespace';

const hijos = (el, nombre) => Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.localName === nombre);

/** "AB12" → { col: 27, fila: 12 } (col 1 = A). */
function partirRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  const col = m[1].split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
  return { col, fila: Number(m[2]) };
}

/** Ruta interna (xl/worksheets/sheetN.xml) de la hoja con ese nombre; si no, la primera. */
function rutaDeHoja(libro, rels, nombreHoja) {
  const hojas = Array.from(libro.getElementsByTagNameNS('*', 'sheet'));
  const hoja = hojas.find((h) => h.getAttribute('name') === nombreHoja) || hojas[0];
  if (!hoja) return null;
  const rid = hoja.getAttributeNS(NS_REL_DOC, 'id') || hoja.getAttribute('r:id');
  const rel = Array.from(rels.getElementsByTagNameNS('*', 'Relationship')).find((r) => r.getAttribute('Id') === rid);
  if (!rel) return null;
  const destino = rel.getAttribute('Target');
  return destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`;
}

class HojaXml {
  constructor(doc) {
    this.doc = doc;
    this.ns = doc.documentElement.namespaceURI;
    this.datos = doc.getElementsByTagNameNS(this.ns, 'sheetData')[0];
    // Estilo por defecto de cada columna (<col min max style>), para celdas nuevas.
    this.estiloCol = [];
    for (const c of Array.from(doc.getElementsByTagNameNS(this.ns, 'col'))) {
      const s = c.getAttribute('style');
      if (!s) continue;
      for (let i = Number(c.getAttribute('min')); i <= Number(c.getAttribute('max')); i++) this.estiloCol[i] = s;
    }
  }

  nuevo(nombre) {
    return this.doc.createElementNS(this.ns, nombre);
  }

  fila(num) {
    const filas = hijos(this.datos, 'row');
    let f = filas.find((r) => Number(r.getAttribute('r')) === num);
    if (f) return f;
    f = this.nuevo('row');
    f.setAttribute('r', String(num));
    this.datos.insertBefore(f, filas.find((r) => Number(r.getAttribute('r')) > num) || null);
    return f;
  }

  /** Devuelve la celda <c r="G10">, creándola en su lugar si no existe. */
  celda(ref) {
    const { col, fila } = partirRef(ref);
    const f = this.fila(fila);
    const celdas = hijos(f, 'c');
    let c = celdas.find((x) => x.getAttribute('r') === ref);
    if (c) return c;
    c = this.nuevo('c');
    c.setAttribute('r', ref);
    const estilo = f.getAttribute('customFormat') === '1' ? f.getAttribute('s') : this.estiloCol[col];
    if (estilo) c.setAttribute('s', estilo);
    f.insertBefore(c, celdas.find((x) => partirRef(x.getAttribute('r')).col > col) || null);
    return c;
  }

  tieneFormula(c) {
    return hijos(c, 'f').length > 0;
  }

  /** Escribe un número o texto conservando el estilo (s) de la celda; null la vacía. */
  escribir(c, valor) {
    for (const n of [...hijos(c, 'f'), ...hijos(c, 'v'), ...hijos(c, 'is')]) c.removeChild(n);
    c.removeAttribute('t');
    if (valor === null || valor === undefined || valor === '') return;
    if (typeof valor === 'number') {
      if (!Number.isFinite(valor)) return;
      const v = this.nuevo('v');
      v.textContent = String(valor);
      c.appendChild(v);
      return;
    }
    // Texto en línea: no hace falta tocar sharedStrings.xml.
    c.setAttribute('t', 'inlineStr');
    const is = this.nuevo('is');
    const t = this.nuevo('t');
    t.setAttributeNS(NS_XML, 'xml:space', 'preserve');
    t.textContent = String(valor);
    is.appendChild(t);
    c.appendChild(is);
  }

  /** Borra el resultado guardado de cada fórmula para que se recalcule al abrir. */
  olvidarResultados() {
    for (const c of Array.from(this.datos.getElementsByTagNameNS(this.ns, 'c'))) {
      if (!this.tieneFormula(c)) continue;
      for (const v of hijos(c, 'v')) c.removeChild(v);
      c.removeAttribute('t');
    }
  }
}

function marcarRecalculo(libro) {
  const ns = libro.documentElement.namespaceURI;
  let calc = libro.getElementsByTagNameNS(ns, 'calcPr')[0];
  if (!calc) {
    calc = libro.createElementNS(ns, 'calcPr');
    // Va justo después de <definedNames> (o de <sheets> si no hay nombres).
    const ancla = libro.getElementsByTagNameNS(ns, 'definedNames')[0] || libro.getElementsByTagNameNS(ns, 'sheets')[0];
    libro.documentElement.insertBefore(calc, ancla ? ancla.nextSibling : null);
  }
  calc.setAttribute('fullCalcOnLoad', '1');
}

function quitarCalcChain(archivo, xml, guardar) {
  if (!archivo['xl/calcChain.xml']) return;
  delete archivo['xl/calcChain.xml'];
  const rels = xml('xl/_rels/workbook.xml.rels');
  for (const r of Array.from(rels.getElementsByTagNameNS('*', 'Relationship'))) {
    if (/calcChain/i.test(r.getAttribute('Target') || '')) r.parentNode.removeChild(r);
  }
  guardar('xl/_rels/workbook.xml.rels', rels);
  const tipos = xml('[Content_Types].xml');
  for (const o of Array.from(tipos.getElementsByTagNameNS('*', 'Override'))) {
    if (/calcChain/i.test(o.getAttribute('PartName') || '')) o.parentNode.removeChild(o);
  }
  guardar('[Content_Types].xml', tipos);
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
