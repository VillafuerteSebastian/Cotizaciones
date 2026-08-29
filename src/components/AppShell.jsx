import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api, logActividad } from '../supabaseClient.js';
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
const INTERVALO_CHEQUEO = 20000;

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

  const loadCotizaciones = useCallback(async () => {
    const data = await api.get(`cotizaciones?${SELECT_TABLERO}&order=created_at.desc`);

    if (primerCargaRef.current) {
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
    let ultimoCambio = '';
    for (const c of data) {
      snap.set(c.id, { estado: c.estado, updated_at: c.updated_at });
      if (c.updated_at > ultimoCambio) ultimoCambio = c.updated_at;
    }
    snapshotRef.current = snap;
    primerCargaRef.current = true;

    // Se calcula la firma con los datos que acabamos de recibir, con el mismo
    // formato que devuelve api.firma(), para no gastar una llamada extra.
    firmaRef.current = `${data.length}|${ultimoCambio}`;

    setCotizaciones(data);
  }, []);
  const loadProveedores = useCallback(async () => {
    const data = await api.get('proveedores?select=*&order=nombre.asc');
    setProveedores(data);
  }, []);
  const loadTrabajadoresCyber = useCallback(async () => {
    const data = await api.get('trabajadores_cyber?select=*&order=nombre.asc');
    setTrabajadoresCyber(data);
  }, []);
  const loadTrabajadoresOcampo = useCallback(async () => {
    const data = await api.get('trabajadores_ocampo?select=*&order=nombre.asc');
    setTrabajadoresOcampo(data);
  }, []);
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
  const loadActividad = useCallback(async () => {
    if (!isCotizador) return;
    const data = await api.get('actividad?select=*&order=created_at.desc&limit=100');
    setActividad(data);
  }, [isCotizador]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([
        loadCotizaciones(),
        loadProveedores(),
        loadTrabajadoresCyber(),
        loadTrabajadoresOcampo(),
        loadFaltantes(),
        loadApartados(),
        loadActividad(),
      ]);
      setLoading(false);
    })();
  }, [
    loadCotizaciones,
    loadProveedores,
    loadTrabajadoresCyber,
    loadTrabajadoresOcampo,
    loadFaltantes,
    loadApartados,
    loadActividad,
  ]);

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

    const revisarCambios = async () => {
      if (document.hidden || cancelado) return;
      try {
        const actual = await api.firma('cotizaciones');
        if (cancelado) return;
        if (actual !== firmaRef.current) await loadCotizaciones();
      } catch (ex) {
        // Un fallo de red puntual no debe romper nada: se reintenta al
        // siguiente ciclo.
      }
    };

    const interval = setInterval(revisarCambios, INTERVALO_CHEQUEO);
    const alVolver = () => {
      if (!document.hidden) revisarCambios();
    };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      cancelado = true;
      clearInterval(interval);
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
