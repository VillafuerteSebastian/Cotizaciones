import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api, logActividad } from '../supabaseClient.js';
import {
  leerCache,
  guardarCache,
  borrarCache,
  claveCompleta,
  otraPestanaYaPregunto,
  marcarChequeo,
} from '../cache.js';
import { estadoInfo } from '../utils.js';
import { soportaNotificaciones, permisoNotificaciones, pedirPermisoNotificaciones, mostrarNotificacion } from '../notify.js';
import Board from './Board.jsx';
import ProveedoresScreen from './ProveedoresScreen.jsx';
import TrabajadoresScreen from './TrabajadoresScreen.jsx';
import FaltantesScreen from './FaltantesScreen.jsx';
import ApartadosScreen from './ApartadosScreen.jsx';
import ActividadScreen from './ActividadScreen.jsx';
import CotizacionDetail from './CotizacionDetail.jsx';
import NuevaCotizacionModal from './NuevaCotizacionModal.jsx';
import { useUI } from './UIProvider.jsx';
import { motion, AnimatePresence, tabFade } from './Motion.jsx';

// Botón de navegación con un "pill" animado (Framer Motion, layoutId) que
// se desliza de una pestaña a otra en vez de simplemente aparecer/desaparecer.
function NavItem({ active, onClick, icon, label }) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick}>
      {active && (
        <motion.span
          layoutId="nav-active-bg"
          className="nav-item-active-bg"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        />
      )}
      <span className="mobile-nav-icon">{icon}</span>
      <span className="mobile-nav-label">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Consultas: pedir SOLO lo que se pinta en pantalla.
//
// El tablero únicamente muestra folio, escuela, título, quién solicita, estado,
// fecha, cuántos productos hay y el total. NO muestra fotos ni notas.
// Antes se pedía `select=*,cotizacion_items(*,...)`, lo que descargaba TODAS
// las imágenes (guardadas como base64 dentro de la base) en cada recarga: eso
// es lo que disparó el egreso a 10 GB. Con esta lista ligera cada recarga pesa
// unos pocos KB en lugar de varios MB.
const SELECT_TABLERO =
  'select=id,folio,escuela,titulo,solicitante_nombre,estado,created_at,updated_at,cotizacion_items(id,cantidad,precio_final)';

// Cada cuánto se comprueba si hubo cambios. La comprobación es una consulta
// diminuta (~100 bytes), así que 20 s no cuesta prácticamente nada; la lista
// completa solo se vuelve a bajar cuando esa firma cambió de verdad.
// Si pasa un rato sin novedades, la espera crece sola hasta INTERVALO_MAXIMO
// y vuelve a 20 s en cuanto aparece movimiento.
const INTERVALO_CHEQUEO = 20000;
const INTERVALO_MAXIMO = 120000;

// Red de seguridad: pase lo que pase, cada 10 minutos se baja la lista
// completa. Así, si el trigger de la base no está puesto o algo quedó
// desincronizado, el tablero se arregla solo en vez de quedarse viejo para
// siempre. Son 6 descargas por hora como mucho, de unos pocos KB.
const REFRESCO_COMPLETO = 10 * 60 * 1000;

// Hasta cuándo se considera que la caché sirve para comparar y avisar de
// cambios. Recargar la página o abrir otra pestaña cae dentro; volver al día
// siguiente, no.
const CACHE_CONFIABLE = 10 * 60 * 1000;

// Mínimo entre chequeos, incluso al volver a la pestaña. Sin esto, alternar
// entre ventanas con alt+tab dispara una petición por cada cambio de foco.
const MINIMO_ENTRE_CHEQUEOS = 5000;

// Proveedores y personal cambian rarísima vez. Se guardan en el navegador y
// solo se vuelven a pedir pasada media hora (o al editarlos, que fuerza la
// recarga desde su propia pantalla).
const VIDA_CATALOGO = 30 * 60 * 1000;

// Cada pestaña tiene su propio "agregar", pero todas se comportan igual que
// el tablero de cotizaciones: un solo botón en el encabezado que abre una
// ventana con el formulario. En móvil ese botón se vuelve un círculo con "+".
const ACCION_NUEVO = {
  tablero: { label: 'Nueva cotización', soloAdmin: false },
  proveedores: { label: 'Nuevo proveedor', soloAdmin: true },
  equipo: { label: 'Agregar persona', soloAdmin: true },
  faltantes: { label: 'Nuevo faltante', soloAdmin: false },
  apartados: { label: 'Nuevo apartado', soloAdmin: false },
  actividad: { label: 'Movimiento de caja', soloAdmin: false },
};

export default function AppShell({ profile, activeWorker, onChangeWorker, onLogout }) {
  const { toast } = useUI();
  const isCotizador = profile.role === 'cotizador';
  const [tab, setTab] = useState('tablero');
  const [cotizaciones, setCotizaciones] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [trabajadoresCyber, setTrabajadoresCyber] = useState([]);
  const [trabajadoresOcampo, setTrabajadoresOcampo] = useState([]);
  const [faltantes, setFaltantes] = useState([]);
  const [apartados, setApartados] = useState([]);
  const [actividad, setActividad] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifPermiso, setNotifPermiso] = useState(permisoNotificaciones());
  const isAdmin = Boolean(activeWorker && activeWorker.es_administrador);

  // Al cambiar de pestaña siempre se cierra el formulario abierto.
  useEffect(() => {
    setShowNuevo(false);
  }, [tab]);

  // Para avisar por notificación de escritorio cuando la otra parte hace un
  // cambio: si Ocampo agrega/actualiza una cotización, avisa a Cyber, y si
  // Cyber la actualiza, avisa a Ocampo. No se avisa a quien hizo el cambio
  // (se suprime por unos segundos en su propia sesión) ni en la primera carga.
  const snapshotRef = useRef(new Map()); // id -> { estado, updated_at }
  const primerCargaRef = useRef(false);
  const recienTocadosRef = useRef(new Map()); // id -> expira (timestamp)

  const marcarRecienTocado = useCallback((id) => {
    if (!id) return;
    recienTocadosRef.current.set(id, Date.now() + 8000);
  }, []);

  // Guarda la última "firma" conocida del tablero (total de filas + fecha del
  // último cambio). Sirve para no volver a bajar la lista si nada cambió.
  const firmaRef = useRef('');
  const ultimaCargaCompletaRef = useRef(0);

  // Las claves de caché llevan el id del perfil: Cyber y Ocampo ven cosas
  // distintas (las políticas de Supabase le ocultan los proveedores a Ocampo),
  // y en una computadora compartida no deben pisarse entre ellos.
  const claveTablero = useMemo(() => `tablero_${profile.id}`, [profile.id]);

  // Toma una lista de cotizaciones (recién bajada, leída de la caché, o
  // recibida de otra pestaña) y actualiza pantalla, snapshot y firma.
  // `avisar` es false cuando los datos vienen de la caché al arrancar: ahí no
  // hay nada nuevo que notificar, solo estamos pintando lo que ya sabíamos.
  const aplicarCotizaciones = useCallback((data, firma, avisar = true) => {
    if (avisar && primerCargaRef.current) {
      const prev = snapshotRef.current;
      const ahora = Date.now();
      for (const c of data) {
        const expiraTocado = recienTocadosRef.current.get(c.id);
        const esPropio = expiraTocado && expiraTocado > ahora;
        if (esPropio) continue;
        const antes = prev.get(c.id);
        if (!antes) {
          mostrarNotificacion('Nueva cotización', {
            body: `#${c.folio} · ${c.escuela} — ${c.titulo}`,
            tag: `cotizacion-${c.id}`,
          });
        } else if (antes.estado !== c.estado || antes.updated_at !== c.updated_at) {
          mostrarNotificacion('Cotización actualizada', {
            body: `#${c.folio} · ${c.escuela} → ${estadoInfo(c.estado).label}`,
            tag: `cotizacion-${c.id}`,
          });
        }
      }
    }

    const snap = new Map();
    for (const c of data) {
      snap.set(c.id, { estado: c.estado, updated_at: c.updated_at });
    }
    snapshotRef.current = snap;
    // Ojo con esta bandera: marca que ya tenemos con qué comparar. Al pintar
    // desde la caché la decisión se toma fuera (según lo vieja que sea), así
    // que aquí solo se sube, nunca se baja.
    if (avisar) primerCargaRef.current = true;

    firmaRef.current = firma;
    setCotizaciones(data);
  }, []);

  // `firmaConocida`: si quien llama acaba de pedir la firma (el chequeo
  // periódico siempre lo hace), se reutiliza en vez de pedirla otra vez. Eso
  // ahorra un viaje por recarga y, sobre todo, evita que un fallo intermitente
  // de la firma deje firmaRef vacía y provoque una descarga completa por ciclo.
  const loadCotizaciones = useCallback(
    async (firmaConocida) => {
      // Cuando hay que pedirla, se pide ANTES que la lista, y esto importa: si
      // alguien cambia algo justo entre las dos peticiones, la firma que
      // guardamos queda vieja y el siguiente chequeo detecta la diferencia. Al
      // revés, ese cambio se perdería hasta el refresco completo.
      // La firma siempre viene del servidor, nunca se recalcula aquí, así que
      // las dos comparaciones hablan literalmente el mismo idioma pase lo que
      // pase (por ejemplo, si PostgREST recorta la lista por su límite de
      // filas máximas, cosa que un cálculo local no vería).
      let firma = firmaConocida || '';
      if (!firma) {
        try {
          firma = await api.firma('cotizaciones');
        } catch (ex) {
          firma = ''; // sin firma no se cachea; el próximo ciclo lo reintenta
        }
      }
      const datos = await api.get(`cotizaciones?${SELECT_TABLERO}&order=created_at.desc`);
      aplicarCotizaciones(datos, firma);
      ultimaCargaCompletaRef.current = Date.now();
      // Se comparte con las demás pestañas y con la próxima recarga de página.
      if (firma) guardarCache(claveTablero, firma, datos);
      return firma;
    },
    [aplicarCotizaciones, claveTablero]
  );
  // Catálogos: proveedores y personal cambian una vez cada varias semanas,
  // pero se descargaban en cada carga de la página. Ahora se guardan en la
  // caché del navegador y solo se vuelven a pedir si pasó el tiempo de vida
  // o si alguien los edita (esas pantallas llaman a `reload` explícitamente).
  // La clave lleva el id del perfil, y una lista vacía no se guarda nunca:
  // si Supabase devuelve [] porque este rol no tiene permiso de ver esa tabla,
  // guardarlo dejaría al otro rol con la pantalla vacía durante media hora.
  const cargarCatalogo = useCallback(
    async (clave, consulta, setter, forzar = false) => {
      const claveUsuario = `${clave}_${profile.id}`;
      if (!forzar) {
        const guardado = leerCache(claveUsuario);
        if (
          guardado &&
          Array.isArray(guardado.datos) &&
          guardado.datos.length &&
          Number.isFinite(guardado.ts) &&
          Date.now() - guardado.ts < VIDA_CATALOGO
        ) {
          setter(guardado.datos);
          return;
        }
      }
      const data = await api.get(consulta);
      setter(data);
      // Una lista vacía puede ser real (se borró al último proveedor) o puede
      // ser que este rol no tenga permiso de leer esa tabla. En los dos casos
      // lo correcto es borrar la entrada, nunca guardarla: guardarla dejaría
      // la pantalla vacía para el otro rol, y no borrarla resucitaría
      // registros ya eliminados durante media hora.
      if (data.length) guardarCache(claveUsuario, '', data);
      else borrarCache(claveUsuario);
    },
    [profile.id]
  );

  // Solo Cyber puede leer proveedores (así está la política en Supabase), así
  // que para Ocampo esta consulta era una petición garantizada a devolver [].
  const loadProveedores = useCallback(
    (forzar = true) => {
      if (!isCotizador) return Promise.resolve();
      return cargarCatalogo('proveedores', 'proveedores?select=*&order=nombre.asc', setProveedores, forzar);
    },
    [cargarCatalogo, isCotizador]
  );
  const loadTrabajadoresCyber = useCallback(
    (forzar = true) =>
      cargarCatalogo(
        'trab_cyber',
        'trabajadores_cyber?select=*&order=nombre.asc',
        setTrabajadoresCyber,
        forzar
      ),
    [cargarCatalogo]
  );
  const loadTrabajadoresOcampo = useCallback(
    (forzar = true) =>
      cargarCatalogo(
        'trab_ocampo',
        'trabajadores_ocampo?select=*&order=nombre.asc',
        setTrabajadoresOcampo,
        forzar
      ),
    [cargarCatalogo]
  );
  const loadFaltantes = useCallback(async () => {
    if (!isCotizador) return;
    const data = await api.get('productos_faltantes?select=*&order=created_at.desc');
    setFaltantes(data);
  }, [isCotizador]);
  const loadApartados = useCallback(async () => {
    if (!isCotizador) return;
    const data = await api.get('apartados?select=*&order=created_at.desc');
    setApartados(data);
  }, [isCotizador]);
  // Se pide columna por columna en vez de `select=*` (sobra profile_id), pero
  // el límite se queda en 100: con menos, los totales de caja del mes que
  // calcula ActividadScreen empezarían a quedarse cortos, y son cifras de
  // dinero. Ahorrar unos KB no vale ese riesgo.
  const loadActividad = useCallback(async () => {
    if (!isCotizador) return;
    const data = await api.get(
      'actividad?select=id,profile_role,trabajador_nombre,accion,detalle,created_at&order=created_at.desc&limit=100'
    );
    setActividad(data);
  }, [isCotizador]);

  // Arranque. El tablero se pinta al instante desde la caché del navegador y
  // después se comprueba la firma: si nadie cambió nada desde la última vez
  // (el caso normal al recargar la página o abrir otra pestaña), no se
  // descarga la lista. Antes cada F5 costaba la tabla entera.
  useEffect(() => {
    (async () => {
      setLoading(true);

      let guardado = null;
      try {
        const leido = leerCache(claveTablero);
        if (
          leido &&
          Array.isArray(leido.datos) &&
          typeof leido.firma === 'string' &&
          leido.firma &&
          typeof leido.ts === 'number' &&
          Number.isFinite(leido.ts)
        ) {
          guardado = leido;
        }
      } catch (ex) {
        guardado = null; // entrada corrupta: se ignora y se carga de cero
      }

      if (guardado) {
        aplicarCotizaciones(guardado.datos, guardado.firma, false);
        // La caché cuenta como carga completa reciente: si no, el primer tick
        // del temporizador dispararía la descarga completa 20 s después y se
        // perdería justo el ahorro de haber recargado la página.
        // El Math.min protege de un reloj que vaya adelantado: una marca en el
        // futuro dejaría el refresco de seguridad congelado.
        const marca = Math.min(guardado.ts, Date.now());
        ultimaCargaCompletaRef.current = marca;

        // Si la caché es de hace un momento (recargar la página, abrir otra
        // pestaña), el snapshot sirve para comparar y las notificaciones
        // siguen funcionando desde el primer cambio. Si es de hace horas, se
        // trata como primera carga para no soltar de golpe una notificación
        // por cada cotización que se movió mientras la app estuvo cerrada.
        primerCargaRef.current = Date.now() - marca < CACHE_CONFIABLE;
        setLoading(false);
      }

      const tableroAlDia = async () => {
        try {
          const actual = await api.firma('cotizaciones');
          marcarChequeo();
          if (actual !== firmaRef.current) await loadCotizaciones(actual);
        } catch (ex) {
          // Si la firma falla, se cae de vuelta a la carga completa para no
          // dejar la pantalla con datos viejos.
          await loadCotizaciones();
        }
      };

      await Promise.all([
        guardado ? tableroAlDia() : loadCotizaciones(),
        loadProveedores(false),
        loadTrabajadoresCyber(false),
        loadTrabajadoresOcampo(false),
        loadFaltantes(),
        loadApartados(),
        loadActividad(),
      ]);
      setLoading(false);
    })();
    // Solo al montar: las recargas posteriores las manejan el temporizador y
    // las acciones de cada pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Otra pestaña del mismo navegador bajó datos nuevos: los aprovechamos sin
  // pedirle absolutamente nada a Supabase.
  useEffect(() => {
    const alCambiarCache = (e) => {
      if (e.key !== claveCompleta(claveTablero) || !e.newValue) return;
      try {
        const guardado = JSON.parse(e.newValue);
        if (!Array.isArray(guardado.datos) || !guardado.firma) return;
        // Fuera del if: otra pestaña acaba de bajar la lista completa, así que
        // esta ya no necesita hacerlo aunque los datos vinieran iguales. Con
        // tres pestañas abiertas eso es una descarga cada 10 min en vez de tres.
        const marca = Number.isFinite(guardado.ts) ? Math.min(guardado.ts, Date.now()) : Date.now();
        ultimaCargaCompletaRef.current = marca;
        if (guardado.firma !== firmaRef.current) {
          aplicarCotizaciones(guardado.datos, guardado.firma);
        }
      } catch (ex) {
        // json corrupto: se ignora, el temporizador lo arreglará
      }
    };
    window.addEventListener('storage', alCambiarCache);
    return () => window.removeEventListener('storage', alCambiarCache);
  }, [aplicarCotizaciones, claveTablero]);

  // Recarga la actividad al entrar a esa pestaña y mientras se está viendo,
  // para reflejar cambios de otras sesiones sin apretar F5. Se detiene si la
  // ventana está en segundo plano: una pestaña olvidada abierta toda la tarde
  // consumía cuota sin que nadie la estuviera mirando.
  useEffect(() => {
    if (tab !== 'actividad' || !isCotizador) return;
    loadActividad();
    const interval = setInterval(() => {
      if (!document.hidden) loadActividad();
    }, 30000);
    return () => clearInterval(interval);
  }, [tab, isCotizador, loadActividad]);

  // Igual que actividad: mientras se está viendo la pestaña de apartados,
  // se refresca sola para reflejar cambios de la otra sesión sin F5.
  useEffect(() => {
    if (tab !== 'apartados' || !isCotizador) return;
    loadApartados();
    const interval = setInterval(() => {
      if (!document.hidden) loadApartados();
    }, 30000);
    return () => clearInterval(interval);
  }, [tab, isCotizador, loadApartados]);

  // El tablero se mantiene al día sin apretar F5, pero SIN volver a bajar la
  // lista completa cada vez. Primero se pide la firma (total de cotizaciones +
  // fecha del último cambio), que pesa unos 100 bytes; solo si esa firma
  // cambió respecto a la que ya tenemos se descarga la lista otra vez.
  // Además no se comprueba nada si la ventana está en segundo plano, y se
  // comprueba de inmediato en cuanto vuelve al frente.
  useEffect(() => {
    let cancelado = false;
    let temporizador = null;
    let espera = INTERVALO_CHEQUEO;
    // Cada vez que se reinicia el ciclo (al volver a la pestaña) sube el
    // número de generación. Una cadena vieja que estaba a mitad de una
    // petición se da cuenta al terminar y se apaga, en vez de dejar dos
    // temporizadores corriendo en paralelo.
    let generacion = 0;

    const revisarCambios = async (miGeneracion, forzado) => {
      if (cancelado || document.hidden) return;

      // Si otra pestaña de este mismo navegador ya preguntó hace un momento,
      // esta se ahorra la petición: el resultado le llega por el evento
      // `storage`. Tres pestañas abiertas cuestan lo mismo que una.
      // Cuando la persona acaba de volver a la pestaña (`forzado`) se salta esa
      // cortesía, porque ahí lo que importa es ver los datos frescos — pero
      // siempre respetando un mínimo, o alternar ventanas con alt+tab dispara
      // una petición por cada cambio de foco.
      const ventana = forzado ? MINIMO_ENTRE_CHEQUEOS : espera * 0.8;
      if (otraPestanaYaPregunto(ventana)) return;
      marcarChequeo();

      try {
        // Red de seguridad: cada tanto se recarga la lista completa aunque la
        // firma diga que no hubo cambios. Cubre el caso de que el trigger de
        // la base no esté puesto, o de que algo se haya desincronizado.
        const tocaCompleta = Date.now() - ultimaCargaCompletaRef.current > REFRESCO_COMPLETO;
        if (tocaCompleta) {
          const guardada = await loadCotizaciones();
          if (cancelado || miGeneracion !== generacion) return;
          espera = guardada ? INTERVALO_CHEQUEO : Math.min(Math.round(espera * 1.5), INTERVALO_MAXIMO);
          return;
        }

        const actual = await api.firma('cotizaciones');
        if (cancelado || miGeneracion !== generacion) return;
        if (actual !== firmaRef.current) {
          // Se le pasa la firma que acabamos de obtener: es anterior a la
          // lista que va a bajar, así que sigue siendo válida, y así no se
          // gasta otra petición ni se corre el riesgo de quedarse sin firma.
          const guardada = await loadCotizaciones(actual);
          // Si por lo que sea no quedó firma, se espacia igual: sin esto, una
          // firma inestable bajaría la lista entera cada 20 s para siempre.
          espera = guardada ? INTERVALO_CHEQUEO : Math.min(Math.round(espera * 1.5), INTERVALO_MAXIMO);
        } else {
          // Nada cambió: se espacia poco a poco, hasta el tope. En una tarde
          // tranquila esto baja los chequeos a la mitad o menos.
          espera = Math.min(Math.round(espera * 1.5), INTERVALO_MAXIMO);
        }
      } catch (ex) {
        // Un fallo de red puntual no rompe nada: se reintenta al siguiente
        // ciclo, un poco más despacio.
        espera = Math.min(Math.round(espera * 1.5), INTERVALO_MAXIMO);
      }
    };

    // Se reprograma cada vez en lugar de usar setInterval, porque la espera
    // va cambiando según haya o no movimiento.
    const programar = async (miGeneracion, forzado = false) => {
      if (cancelado || miGeneracion !== generacion) return;
      await revisarCambios(miGeneracion, forzado);
      if (cancelado || miGeneracion !== generacion) return;
      temporizador = setTimeout(() => programar(miGeneracion), espera);
    };
    temporizador = setTimeout(() => programar(generacion), espera);

    // Al volver a la pestaña se comprueba de inmediato y se reinicia el ritmo,
    // que es justo cuando a la persona le importa ver los datos frescos.
    const alVolver = () => {
      if (document.hidden || cancelado) return;
      espera = INTERVALO_CHEQUEO;
      generacion += 1;
      clearTimeout(temporizador);
      programar(generacion, true);
    };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [loadCotizaciones]);

  const activarNotificaciones = async () => {
    const resultado = await pedirPermisoNotificaciones();
    setNotifPermiso(resultado);
  };

  const moverEstado = async (cotizacionId, nuevoEstado, cotizacion) => {
    try {
      marcarRecienTocado(cotizacionId);
      await api.patch(`cotizaciones?id=eq.${cotizacionId}`, { estado: nuevoEstado });
      await loadCotizaciones();
      await log('Cambió estado', `#${cotizacion.folio} → ${nuevoEstado} (arrastrado)`);
    } catch (ex) {
      toast('No se pudo mover: ' + ex.message, 'error');
    }
  };

  const escuelasSugeridas = useMemo(() => {
    const set = new Set(cotizaciones.map((c) => c.escuela).filter(Boolean));
    return Array.from(set).sort();
  }, [cotizaciones]);

  const log = async (accion, detalle) => {
    await logActividad(profile, activeWorker, accion, detalle);
    // Mantiene la pestaña de actividad al día automáticamente, sin F5,
    // sin importar desde qué pantalla se generó el registro.
    if (isCotizador) loadActividad();
  };

  const accionNuevo = ACCION_NUEVO[tab];
  const puedeAgregar = Boolean(accionNuevo && (!accionNuevo.soloAdmin || isAdmin));

  const botonNuevo = puedeAgregar ? (
      <button
        type="button"
        className="btn btn-primary header-action"
        onClick={() => setShowNuevo(true)}
        title={accionNuevo.label}
        aria-label={accionNuevo.label}
      >
        <span className="header-action-label">+ {accionNuevo.label}</span>
      <span className="header-action-icon" aria-hidden="true">+</span>
    </button>
  ) : null;

  return (
    <div className="shell">
      <div className="sidebar">
        <div className="brand">Cotizaciones</div>
        <div className="brand-sub">y encargos</div>
        <NavItem active={tab === 'tablero'} onClick={() => setTab('tablero')} icon="⌂" label="Tablero" />
        {isCotizador && (
          <NavItem active={tab === 'proveedores'} onClick={() => setTab('proveedores')} icon="▣" label="Proveedores" />
        )}
        <NavItem active={tab === 'equipo'} onClick={() => setTab('equipo')} icon="♟" label="Equipo" />
        {isCotizador && (
          <NavItem active={tab === 'faltantes'} onClick={() => setTab('faltantes')} icon="!" label="Faltantes" />
        )}
        {isCotizador && (
          <NavItem active={tab === 'apartados'} onClick={() => setTab('apartados')} icon="▢" label="Apartados" />
        )}
        {isCotizador && (
          <NavItem active={tab === 'actividad'} onClick={() => setTab('actividad')} icon="↗" label="Actividad" />
        )}
        <div className="sidebar-footer">
          <div className="who">{activeWorker ? activeWorker.nombre : profile.nombre}</div>
          <div className="who-role">{isCotizador ? 'Cyber' : 'Ocampo'}</div>
          {soportaNotificaciones() && notifPermiso === 'default' && (
            <button
              className="btn btn-ghost btn-sm btn-block"
              style={{ marginBottom: 6 }}
              onClick={activarNotificaciones}
            >
              🔔 Activar notificaciones
            </button>
          )}
          {soportaNotificaciones() && notifPermiso === 'denied' && (
            <p className="hint" style={{ margin: '0 0 6px', fontSize: 10.5 }}>
              Notificaciones bloqueadas por el navegador. Actívalas en la configuración del sitio si las quieres.
            </p>
          )}
          <button className="btn btn-ghost btn-sm btn-block" style={{ marginBottom: 6 }} onClick={onChangeWorker}>
            Cambiar persona
          </button>
          <button className="btn btn-ghost btn-sm btn-block" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="main">
        <div className="mobile-account-bar">
          <div className="mobile-account-person">
            <div className="mobile-account-avatar">{(activeWorker ? activeWorker.nombre : profile.nombre).charAt(0).toUpperCase()}</div>
            <div>
              <strong>{activeWorker ? activeWorker.nombre : profile.nombre}</strong>
              <span>{isCotizador ? 'Cyber' : 'Ocampo'}</span>
            </div>
          </div>
          <div className="mobile-account-actions">
            <button type="button" className="mobile-account-btn" onClick={onChangeWorker}>Cambiar</button>
            <button type="button" className="mobile-account-btn danger" onClick={onLogout}>Salir</button>
          </div>
        </div>
        <AnimatePresence mode="wait">
          {tab === 'tablero' && (
            <motion.div key="tablero" {...tabFade}>
              <div className="main-header">
                <h2>Tablero de cotizaciones</h2>
                {botonNuevo}
              </div>
              {loading ? <div className="loading">Cargando…</div> : <Board cotizaciones={cotizaciones} onOpen={setOpenId} canDrag={true} onMoveEstado={moverEstado} />}
            </motion.div>
          )}
          {tab === 'proveedores' && isCotizador && (
            <motion.div key="proveedores" {...tabFade}>
              <div className="main-header">
                <h2>Proveedores</h2>
                {botonNuevo}
              </div>
              <ProveedoresScreen
                activeWorker={activeWorker}
                proveedores={proveedores}
                reload={loadProveedores}
                showForm={showNuevo}
                onCloseForm={() => setShowNuevo(false)}
              />
            </motion.div>
          )}
          {tab === 'equipo' && (
            <motion.div key="equipo" {...tabFade}>
              <div className="main-header">
                <h2>Equipo</h2>
                {botonNuevo}
              </div>
              <TrabajadoresScreen
                profile={profile}
                activeWorker={activeWorker}
                trabajadoresCyber={trabajadoresCyber}
                trabajadoresOcampo={trabajadoresOcampo}
                reload={isCotizador ? loadTrabajadoresCyber : loadTrabajadoresOcampo}
                log={log}
                showForm={showNuevo}
                onCloseForm={() => setShowNuevo(false)}
              />
            </motion.div>
          )}
          {tab === 'faltantes' && isCotizador && (
            <motion.div key="faltantes" {...tabFade}>
              <div className="main-header">
                <h2>Faltantes en tienda</h2>
                {botonNuevo}
              </div>
              <FaltantesScreen
                profile={profile}
                activeWorker={activeWorker}
                faltantes={faltantes}
                reload={loadFaltantes}
                log={log}
                showForm={showNuevo}
                onCloseForm={() => setShowNuevo(false)}
              />
            </motion.div>
          )}
          {tab === 'apartados' && isCotizador && (
            <motion.div key="apartados" {...tabFade}>
              <div className="main-header">
                <h2>Apartados en tienda</h2>
                {botonNuevo}
              </div>
              <ApartadosScreen
                activeWorker={activeWorker}
                trabajadoresCyber={trabajadoresCyber}
                apartados={apartados}
                reload={loadApartados}
                log={log}
                showForm={showNuevo}
                onCloseForm={() => setShowNuevo(false)}
              />
            </motion.div>
          )}
          {tab === 'actividad' && isCotizador && (
            <motion.div key="actividad" {...tabFade}>
              <div className="main-header">
                <h2>Actividad</h2>
                {botonNuevo}
              </div>
              <ActividadScreen
                profile={profile}
                activeWorker={activeWorker}
                actividad={actividad}
                reload={loadActividad}
                log={log}
                showForm={showNuevo}
                onCloseForm={() => setShowNuevo(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
      {openId && (
        <CotizacionDetail
          key="cotizacion-detail"
          id={openId}
          profile={profile}
          activeWorker={activeWorker}
          proveedores={proveedores}
          trabajadoresCyber={trabajadoresCyber}
          onClose={() => setOpenId(null)}
          onChanged={loadCotizaciones}
          onTouch={marcarRecienTocado}
          reloadProveedores={loadProveedores}
          log={log}
        />
      )}
      </AnimatePresence>
      <AnimatePresence>
      {showNuevo && tab === 'tablero' && (
        <NuevaCotizacionModal
          key="nueva-cotizacion"
          profile={profile}
          activeWorker={activeWorker}
          escuelasSugeridas={escuelasSugeridas}
          onClose={() => setShowNuevo(false)}
          onCreated={async (id, detalle) => {
            setShowNuevo(false);
            marcarRecienTocado(id);
            await loadCotizaciones();
            await log('Nueva cotización', detalle);
            setOpenId(id);
          }}
        />
      )}
      </AnimatePresence>
    </div>
  );
}
