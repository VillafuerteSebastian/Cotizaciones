// Caché en localStorage compartida por todas las pestañas del mismo navegador.
//
// Resuelve tres gastos que no se ven a simple vista:
//
//   1. Recargar la página (F5) volvía a descargar el tablero completo, aunque
//      no hubiera cambiado nada desde hace una hora.
//   2. Con tres pestañas abiertas, cada una preguntaba por su cuenta. En los
//      logs se veía: un solo usuario generó 686 peticiones en dos horas,
//      bastante más de lo que da una sola pestaña.
//   3. Cuando una pestaña sí descarga datos nuevos, las demás pueden
//      aprovecharlos gratis a través del evento `storage` del navegador,
//      sin pedir nada a Supabase.
//
// Todo esto vive solo en el navegador de cada quien. Si se borra, la app
// simplemente vuelve a pedir los datos.

const PREFIJO = 'cache_v1_';

export function leerCache(clave) {
  try {
    const raw = localStorage.getItem(PREFIJO + clave);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (ex) {
    return null;
  }
}

// Guarda { firma, datos, ts }. Escribir aquí dispara el evento `storage`
// en las OTRAS pestañas del mismo navegador, que así se enteran gratis.
export function guardarCache(clave, firma, datos) {
  try {
    localStorage.setItem(
      PREFIJO + clave,
      JSON.stringify({ firma, datos, ts: Date.now() })
    );
  } catch (ex) {
    // Si localStorage está lleno o bloqueado, no pasa nada: la app sigue
    // funcionando, solo que pidiendo los datos cada vez.
  }
}

export function claveCompleta(clave) {
  return PREFIJO + clave;
}

// Se usa cuando una consulta devuelve una lista vacía de verdad (se eliminó
// al último proveedor, por ejemplo): hay que borrar la entrada, porque no
// guardar nada dejaría viva la lista anterior hasta que caduque.
export function borrarCache(clave) {
  try {
    localStorage.removeItem(PREFIJO + clave);
  } catch (ex) {
    // nada que borrar
  }
}

// Al cerrar sesión hay que dejar el navegador limpio: los dos roles (Cyber y
// Ocampo) ven cosas distintas, y las políticas de seguridad de Supabase le
// ocultan a Ocampo, por ejemplo, la lista de proveedores. Sin esto, la caché
// de una sesión se le quedaría pintada a la siguiente.
export function limpiarCache() {
  try {
    const aBorrar = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIJO)) aBorrar.push(k);
    }
    for (const k of aBorrar) localStorage.removeItem(k);
  } catch (ex) {
    // sin localStorage no hay nada que limpiar
  }
}

// ---------------------------------------------------------------------------
// "Turno" entre pestañas: antes de gastar una petición, una pestaña comprueba
// si otra ya preguntó hace poco. Si es así, se salta este ciclo.
// Es más simple y más robusto que elegir una pestaña líder, y con que una
// pregunte alcanza: el resultado se comparte por `storage`.
const CLAVE_TURNO = PREFIJO + 'ultimo_chequeo';

export function otraPestanaYaPregunto(ventanaMs) {
  try {
    const ultimo = Number(localStorage.getItem(CLAVE_TURNO) || 0);
    return Date.now() - ultimo < ventanaMs;
  } catch (ex) {
    return false;
  }
}

export function marcarChequeo() {
  try {
    localStorage.setItem(CLAVE_TURNO, String(Date.now()));
  } catch (ex) {
    // sin caché, cada pestaña pregunta por su cuenta
  }
}
