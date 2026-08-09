import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, logActividad } from '../supabaseClient.js';
import Board from './Board.jsx';
import ProveedoresScreen from './ProveedoresScreen.jsx';
import TrabajadoresScreen from './TrabajadoresScreen.jsx';
import FaltantesScreen from './FaltantesScreen.jsx';
import ActividadScreen from './ActividadScreen.jsx';
import CotizacionDetail from './CotizacionDetail.jsx';
import NuevaCotizacionModal from './NuevaCotizacionModal.jsx';

export default function AppShell({ profile, activeWorker, onChangeWorker, onLogout }) {
  const isCotizador = profile.role === 'cotizador';
  const [tab, setTab] = useState('tablero');
  const [cotizaciones, setCotizaciones] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [trabajadoresCyber, setTrabajadoresCyber] = useState([]);
  const [trabajadoresOcampo, setTrabajadoresOcampo] = useState([]);
  const [faltantes, setFaltantes] = useState([]);
  const [actividad, setActividad] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [showNueva, setShowNueva] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCotizaciones = useCallback(async () => {
    const data = await api.get(
      'cotizaciones?select=*,cotizacion_items(*,proveedor:proveedores(nombre),cotizado:trabajadores_cyber(nombre))&order=created_at.desc'
    );
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
        loadActividad(),
      ]);
      setLoading(false);
    })();
  }, [loadCotizaciones, loadProveedores, loadTrabajadoresCyber, loadTrabajadoresOcampo, loadFaltantes, loadActividad]);

  const escuelasSugeridas = useMemo(() => {
    const set = new Set(cotizaciones.map((c) => c.escuela).filter(Boolean));
    return Array.from(set).sort();
  }, [cotizaciones]);

  const log = (accion, detalle) => logActividad(profile, activeWorker, accion, detalle);

  return (
    <div className="shell">
      <div className="sidebar">
        <div className="brand">Cotizaciones</div>
        <div className="brand-sub">y encargos</div>
        <button className={`nav-item ${tab === 'tablero' ? 'active' : ''}`} onClick={() => setTab('tablero')}>
          Tablero
        </button>
        {isCotizador && (
          <button className={`nav-item ${tab === 'proveedores' ? 'active' : ''}`} onClick={() => setTab('proveedores')}>
            Proveedores
          </button>
        )}
        <button className={`nav-item ${tab === 'equipo' ? 'active' : ''}`} onClick={() => setTab('equipo')}>
          Equipo
        </button>
        {isCotizador && (
          <button className={`nav-item ${tab === 'faltantes' ? 'active' : ''}`} onClick={() => setTab('faltantes')}>
            Faltantes en tienda
          </button>
        )}
        {isCotizador && (
          <button className={`nav-item ${tab === 'actividad' ? 'active' : ''}`} onClick={() => setTab('actividad')}>
            Actividad
          </button>
        )}
        <div className="sidebar-footer">
          <div className="who">{activeWorker ? activeWorker.nombre : profile.nombre}</div>
          <div className="who-role">{isCotizador ? 'Cyber' : 'Ocampo'}</div>
          <button className="btn btn-ghost btn-sm btn-block" style={{ marginBottom: 6 }} onClick={onChangeWorker}>
            Cambiar persona
          </button>
          <button className="btn btn-ghost btn-sm btn-block" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="main">
        {tab === 'tablero' && (
          <React.Fragment>
            <div className="main-header">
              <h2>Tablero de cotizaciones</h2>
              <button className="btn btn-primary" onClick={() => setShowNueva(true)}>
                + Nueva cotización
              </button>
            </div>
            {loading ? <div className="loading">Cargando…</div> : <Board cotizaciones={cotizaciones} onOpen={setOpenId} />}
          </React.Fragment>
        )}
        {tab === 'proveedores' && isCotizador && (
          <React.Fragment>
            <div className="main-header">
              <h2>Proveedores</h2>
            </div>
            <ProveedoresScreen proveedores={proveedores} reload={loadProveedores} />
          </React.Fragment>
        )}
        {tab === 'equipo' && (
          <React.Fragment>
            <div className="main-header">
              <h2>Equipo</h2>
            </div>
            <TrabajadoresScreen
              profile={profile}
              trabajadoresCyber={trabajadoresCyber}
              trabajadoresOcampo={trabajadoresOcampo}
              reload={isCotizador ? loadTrabajadoresCyber : loadTrabajadoresOcampo}
            />
          </React.Fragment>
        )}
        {tab === 'faltantes' && isCotizador && (
          <React.Fragment>
            <div className="main-header">
              <h2>Faltantes en tienda</h2>
            </div>
            <FaltantesScreen profile={profile} activeWorker={activeWorker} faltantes={faltantes} reload={loadFaltantes} log={log} />
          </React.Fragment>
        )}
        {tab === 'actividad' && isCotizador && (
          <React.Fragment>
            <div className="main-header">
              <h2>Actividad</h2>
            </div>
            <ActividadScreen actividad={actividad} />
          </React.Fragment>
        )}
      </div>

      {openId && (
        <CotizacionDetail
          id={openId}
          profile={profile}
          activeWorker={activeWorker}
          proveedores={proveedores}
          trabajadoresCyber={trabajadoresCyber}
          onClose={() => setOpenId(null)}
          onChanged={loadCotizaciones}
          reloadProveedores={loadProveedores}
          log={log}
        />
      )}
      {showNueva && (
        <NuevaCotizacionModal
          profile={profile}
          activeWorker={activeWorker}
          trabajadoresOcampo={trabajadoresOcampo}
          escuelasSugeridas={escuelasSugeridas}
          onClose={() => setShowNueva(false)}
          onCreated={async (id, detalle) => {
            setShowNueva(false);
            await loadCotizaciones();
            await log('Nueva cotización', detalle);
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}
