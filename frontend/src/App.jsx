import React, { useState, useEffect, useCallback } from 'react';
import api from './api/client';
import Login from './pages/Login';
import CRM from './pages/CRM';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('crm_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('crm_theme', theme);
  }, [theme]);

  useEffect(() => {
    // Check if we have an active session.
    // /auth/verify is PUBLIC — returns 401 if no cookie, which is fine, we just show login.
    api.get('/auth/verify')
      .then(r => setUser(r.data.user))
      .catch(() => setUser(null))   // 401 = no session = show login, no redirect
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    setUser(null);
  };

  // Called by CRM when any API request gets 401 mid-session (token expired)
  const handleSessionExpired = useCallback(() => {
    setUser(null);
  }, []);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="loading-spinner">
        <div className="spinner" />
        <span style={{ color: 'var(--text2)' }}>Загрузка...</span>
      </div>
    </div>
  );

  return user
    ? <CRM
        user={user}
        onLogout={handleLogout}
        onSessionExpired={handleSessionExpired}
        theme={theme}
        onThemeToggle={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
      />
    : <Login onLogin={handleLogin} />;
}
