import React, { useState } from 'react';
import Modal from '../components/Modal';
import Icon from '../components/Icons';
import { useToast } from '../components/Toast';
import api from '../api/client';

// ─── Notes ────────────────────────────────────────────────

function NoteForm({ orders, initial = {}, onSubmit, onClose }) {
  const [d, setD] = useState({ text: '', order_id: '', reminder_date: '', ...initial });
  const set = (k, v) => setD(p => ({ ...p, [k]: v }));
  const handle = (e) => {
    e.preventDefault();
    onSubmit({ text: d.text, order_id: d.order_id ? Number(d.order_id) : null, reminder_date: d.reminder_date || null });
  };
  return (
    <form onSubmit={handle}>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">Текст заметки *</label>
          <textarea className="form-textarea" value={d.text} onChange={e => set('text', e.target.value)} required placeholder="Текст заметки..." rows={4} />
        </div>
        <div className="form-group">
          <label className="form-label">Привязать к заказу</label>
          <select className="form-select" value={d.order_id} onChange={e => set('order_id', e.target.value)}>
            <option value="">Без привязки</option>
            {orders.map(o => <option key={o.id} value={o.id}>#{o.id} — {o.client_name} ({new Date(o.created_at).toLocaleDateString('ru-RU')})</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Напоминание</label>
          <input className="form-input" type="datetime-local" value={d.reminder_date} onChange={e => set('reminder_date', e.target.value)} />
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button type="submit" className="btn btn-primary">Сохранить</button>
      </div>
    </form>
  );
}

export function NotesPage({ notes = [], orders = [], onRefresh }) {
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = async (data) => {
    try { await api.post('/notes', data); toast('Заметка добавлена'); setShowAdd(false); onRefresh(); }
    catch (e) { toast(e.response?.data?.error || 'Ошибка', 'error'); }
  };
  const handleDelete = async (id) => {
    if (!confirm('Удалить заметку?')) return;
    try { await api.delete(`/notes/${id}`); toast('Удалено'); onRefresh(); }
    catch { toast('Ошибка', 'error'); }
  };
  const handleNotified = async (id) => {
    try { await api.patch(`/notes/${id}/notified`); onRefresh(); }
    catch { toast('Ошибка', 'error'); }
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-meta">
          <span className="count-badge">Заметок: {notes.length}</span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Icon name="plus" /> Добавить</button>
      </div>

      {notes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔔</div>
          <div className="empty-text">Заметок пока нет</div>
        </div>
      ) : (
        <div className="notes-grid">
          {notes.map(n => {
            const isPast = n.reminder_date && new Date(n.reminder_date) < new Date() && !n.notified;
            return (
              <div key={n.id} className={`note-card ${isPast ? 'urgent' : ''}`}>
                <div className="note-header">
                  <span style={{ fontSize: 20 }}>{isPast ? '🔴' : n.reminder_date ? '🔔' : '📝'}</span>
                  <div className="list-actions" style={{ opacity: 1 }}>
                    {!n.notified && n.reminder_date && (
                      <button className="btn-icon-only" onClick={() => handleNotified(n.id)} title="Отметить выполненным">
                        <Icon name="check" size={14} />
                      </button>
                    )}
                    <button className="btn-icon-only danger" onClick={() => handleDelete(n.id)} title="Удалить">
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
                <div className="note-text">{n.text}</div>
                {n.client_name && <div className="note-meta">📋 {n.client_name}</div>}
                {n.reminder_date && (
                  <div className={`note-reminder ${isPast ? 'past' : ''}`} style={{ marginTop: 8, display: 'inline-block' }}>
                    🔔 {new Date(n.reminder_date).toLocaleString('ru-RU')}
                    {n.notified && ' ✓'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <Modal title="Новая заметка" onClose={() => setShowAdd(false)}>
          <NoteForm orders={orders} onSubmit={handleAdd} onClose={() => setShowAdd(false)} />
        </Modal>
      )}
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────

function UserForm({ onSubmit, onClose }) {
  const [d, setD] = useState({ username: '', password: '', name: '' });
  const set = (k, v) => setD(p => ({ ...p, [k]: v }));
  const handle = (e) => { e.preventDefault(); onSubmit(d); };
  return (
    <form onSubmit={handle}>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">Логин *</label>
          <input className="form-input" value={d.username} onChange={e => set('username', e.target.value)} required placeholder="username" />
        </div>
        <div className="form-group">
          <label className="form-label">Пароль *</label>
          <input className="form-input" type="password" value={d.password} onChange={e => set('password', e.target.value)} required placeholder="••••••••" />
        </div>
        <div className="form-group">
          <label className="form-label">Имя</label>
          <input className="form-input" value={d.name} onChange={e => set('name', e.target.value)} placeholder="Полное имя" />
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button type="submit" className="btn btn-primary">Создать</button>
      </div>
    </form>
  );
}

function PasswordForm({ user, onSubmit, onClose }) {
  const [password, setPassword] = useState('');
  const handle = (e) => { e.preventDefault(); onSubmit(password); };
  return (
    <form onSubmit={handle}>
      <div className="modal-body">
        <p style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: 16 }}>Смена пароля для пользователя <b>{user.username}</b></p>
        <div className="form-group">
          <label className="form-label">Новый пароль *</label>
          <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Минимум 6 символов" minLength={6} />
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button type="submit" className="btn btn-primary">Сменить</button>
      </div>
    </form>
  );
}

export function UsersPage({ users = [], onRefresh }) {
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [changePw, setChangePw] = useState(null);

  const handleAdd = async (data) => {
    try { await api.post('/users', data); toast('Пользователь создан'); setShowAdd(false); onRefresh(); }
    catch (e) { toast(e.response?.data?.error || 'Ошибка', 'error'); }
  };
  const handlePw = async (password) => {
    try { await api.put(`/users/${changePw.id}/password`, { password }); toast('Пароль изменён'); setChangePw(null); }
    catch (e) { toast(e.response?.data?.error || 'Ошибка', 'error'); }
  };
  const handleDelete = async (id) => {
    if (!confirm('Удалить пользователя?')) return;
    try { await api.delete(`/users/${id}`); toast('Пользователь удалён'); onRefresh(); }
    catch (e) { toast(e.response?.data?.error || 'Ошибка', 'error'); }
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-meta">
          <span className="count-badge">Пользователей: {users.length}</span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Icon name="plus" /> Добавить</button>
      </div>

      <div className="list-wrap">
        {users.map(u => (
          <div key={u.id} className="list-item">
            <div className="list-item-avatar" style={{ background: 'linear-gradient(135deg, var(--purple-dim), var(--accent-dim))' }}>
              {(u.name || u.username)[0].toUpperCase()}
            </div>
            <div className="list-item-main">
              <div className="list-item-name">{u.name || u.username}</div>
              <div className="list-item-sub">@{u.username} · {u.role}</div>
            </div>
            <div className="list-item-meta">
              <div className="list-item-meta-sub">{new Date(u.created_at).toLocaleDateString('ru-RU')}</div>
            </div>
            <div className="list-actions" style={{ opacity: 1 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setChangePw(u)}>🔑 Пароль</button>
              <button className="btn-icon-only danger" onClick={() => handleDelete(u.id)} title="Удалить">
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <Modal title="Новый пользователь" onClose={() => setShowAdd(false)}>
          <UserForm onSubmit={handleAdd} onClose={() => setShowAdd(false)} />
        </Modal>
      )}
      {changePw && (
        <Modal title="Смена пароля" onClose={() => setChangePw(null)}>
          <PasswordForm user={changePw} onSubmit={handlePw} onClose={() => setChangePw(null)} />
        </Modal>
      )}
    </div>
  );
}
