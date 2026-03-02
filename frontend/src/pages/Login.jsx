import React, { useState } from 'react';
import api from '../api/client';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post('/auth/login', { username, password });
      onLogin(r.data.user);
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Неверные логин или пароль');
      } else {
        setError(err.response?.data?.error || 'Ошибка входа');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">F</div>
          <div>
            <div className="login-logo-text">FastCRM</div>
            <div className="login-logo-sub">Быстро и надёжно</div>
          </div>
        </div>

        <h2 className="login-title">Добро пожаловать</h2>
        <p className="login-subtitle">Войдите в систему управления</p>

        {error && <div className="login-error">⚠ {error}</div>}

        <form onSubmit={handleSubmit} autoComplete="on">
          <div className="form-group">
            <label className="form-label">Логин</label>
            <input
              className="form-input"
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input
              className="form-input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '12px' }}
            disabled={loading}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <p style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 20, textAlign: 'center' }}>
          Используйте учётные данные, выданные администратором системы
        </p>
      </div>
    </div>
  );
}
