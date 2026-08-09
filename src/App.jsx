import React, { useState, useEffect } from 'react';
import {
  S,
  loadManualConfig,
  loadSession,
  clearSession,
  fetchCurrentUser,
  fetchProfile,
  getActiveWorker,
  clearActiveWorker,
} from './supabaseClient.js';
import SetupScreen from './components/SetupScreen.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import QuienEresScreen from './components/QuienEresScreen.jsx';
import AppShell from './components/AppShell.jsx';

export default function App() {
  const [phase, setPhase] = useState('loading'); // loading | setup | login | quien-eres | app
  const [profile, setProfile] = useState(null);
  const [activeWorker, setActiveWorkerState] = useState(null);

  const enterAfterLogin = (p) => {
    setProfile(p);
    const saved = getActiveWorker(p.role);
    if (saved) {
      setActiveWorkerState(saved);
      setPhase('app');
    } else {
      setPhase('quien-eres');
    }
  };

  useEffect(() => {
    (async () => {
      const hasConfig = loadManualConfig();
      if (!hasConfig) {
        setPhase('setup');
        return;
      }
      if (!loadSession()) {
        setPhase('login');
        return;
      }
      try {
        const user = await fetchCurrentUser();
        const p = await fetchProfile(user.id);
        enterAfterLogin(p);
      } catch (ex) {
        clearSession();
        setPhase('login');
      }
    })();
  }, []);

  if (phase === 'loading') return <div className="loading">Cargando…</div>;
  if (phase === 'setup') return <SetupScreen onDone={() => setPhase('login')} />;
  if (phase === 'login')
    return (
      <LoginScreen
        onReconfigure={() => setPhase('setup')}
        onLogin={async (user) => {
          try {
            const p = await fetchProfile(user.id);
            enterAfterLogin(p);
          } catch (ex) {
            alert(ex.message);
          }
        }}
      />
    );
  if (phase === 'quien-eres')
    return <QuienEresScreen profile={profile} onSelect={(w) => { setActiveWorkerState(w); setPhase('app'); }} />;

  return (
    <AppShell
      profile={profile}
      activeWorker={activeWorker}
      onChangeWorker={() => {
        clearActiveWorker(profile.role);
        setActiveWorkerState(null);
        setPhase('quien-eres');
      }}
      onLogout={async () => {
        clearSession();
        setProfile(null);
        setActiveWorkerState(null);
        setPhase('login');
      }}
    />
  );
}
