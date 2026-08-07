import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../supabaseClient.js';
import Board from './Board.jsx';
import ProveedoresScreen from './ProveedoresScreen.jsx';
import CotizacionDetail from './CotizacionDetail.jsx';
import NuevaCotizacionModal from './NuevaCotizacionModal.jsx';

export default function AppShell({ profile, onLogout }) {
  const [tab, setTab] = useState('tablero');
  const [cotizaciones, setCotizaciones] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [solicitantes, setSolicitantes] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [showNueva, setShowNueva] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCotizaciones = useCallback(async () => {
    const data = await api.get(
      'cotizaciones?select=*,cotizacion_items(*,proveedor:proveedores(nombre),agregado:profiles(nombre))&order=created_at.desc'
    );
    setCotizaciones(data);
  }, []);
  const loadProveedores = useCallback(async () => {
    const data = await api.get('proveedores?select=*&order=nombre.asc');
    setProveedores(data);
  }, []);
  const loadSolicitantes = useCallback(async () => {
    const data = await api.get('profiles?select=*&order=nombre.asc');
    setSolicitantes(data);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadCotizaciones(), loadProveedores(), loadSolicitantes()]);
      setLoading(false);
    })();
  }, [loadCotizaciones, loadProveedores, loadSolicitantes]);

  return (
    <div className="shell">
      <div className="sidebar">
        <div className="brand">Cotizaciones</div>
        <div className="brand-sub">y encargos</div>
        <button className={`nav-item ${tab === 'tablero' ? 'active' : ''}`} onClick={() => setTab('tablero')}>
          Tablero
        </button>
        <button className={`nav-item ${tab === 'proveedores' ? 'active' : ''}`} onClick={() => setTab('proveedores')}>
          Proveedores
        </button>
        <div className="sidebar-footer">
          <div className="who">{profile.nombre}</div>
          <div className="who-role">{profile.role === 'cotizador' ? 'Cotizador / jefe' : 'Solicitante'}</div>
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
        {tab === 'proveedores' && (
          <React.Fragment>
            <div className="main-header">
              <h2>Proveedores</h2>
            </div>
            <ProveedoresScreen proveedores={proveedores} reload={loadProveedores} />
          </React.Fragment>
        )}
      </div>

      {openId && (
        <CotizacionDetail
          id={openId}
          profile={profile}
          proveedores={proveedores}
          onClose={() => setOpenId(null)}
          onChanged={loadCotizaciones}
          reloadProveedores={loadProveedores}
        />
      )}
      {showNueva && (
        <NuevaCotizacionModal
          profile={profile}
          solicitantes={solicitantes}
          onClose={() => setShowNueva(false)}
          onCreated={async (id) => {
            setShowNueva(false);
            await loadCotizaciones();
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}
