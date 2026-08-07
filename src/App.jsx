import React, { useState, useEffect } from 'react';
import { S, loadManualConfig, loadSession, clearSession, fetchCurrentUser, fetchProfile } from './supabaseClient.js';
import SetupScreen from './components/SetupScreen.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import AppShell from './components/AppShell.jsx';

export default function App() {
  const [phase, setPhase] = useState('loading'); // loading | setup | login | app
  const [profile, setProfile] = useState(null);

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
        setProfile(p);
        setPhase('app');
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
            setProfile(p);
            setPhase('app');
          } catch (ex) {
            alert(ex.message);
          }
        }}
      />
    );
  return (
    <AppShell
      profile={profile}
      onLogout={async () => {
        clearSession();
        setProfile(null);
        setPhase('login');
      }}
    />
  );
}
