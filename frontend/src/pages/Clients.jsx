import React, { useState } from 'react';
import Modal from '../components/Modal';
import Icon from '../components/Icons';
import { useToast } from '../components/Toast';
import api from '../api/client';

const formatPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';

  let normalized = digits;
  if (normalized[0] === '8') normalized = `7${normalized.slice(1)}`;
  if (normalized[0] !== '7') normalized = `7${normalized}`;
  const cleaned = normalized.slice(0, 11);

  const country = cleaned[0] || '7';
  const p1 = cleaned.slice(1, 4);
  const p2 = cleaned.slice(4, 7);
  const p3 = cleaned.slice(7, 9);
  const p4 = cleaned.slice(9, 11);

  let result = `+${country}`;
  if (p1) result += ` ${p1}`;
  if (p2) result += ` ${p2}`;
  if (p3) result += `-${p3}`;
  if (p4) result += `-${p4}`;
  return result;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

function ClientForm({ initial = {}, onSubmit, onClose, title }) {
  const [d, setD] = useState({ name: '', phone: '', email: '', note: '', ...initial });
  const set = (k, v) => setD(p => ({ ...p, [k]: v }));
  const handle = (e) => { e.preventDefault(); onSubmit(d); };
  return (
    <form onSubmit={handle}>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">Имя *</label>
          <input className="form-input" value={d.name} onChange={e => set('name', e.target.value)} required placeholder="Иван Иванов" />
        </div>
        <div className="form-group">
          <label className="form-label">Телефон *</label>
          <input
            className="form-input"
            value={d.phone}
            onChange={e => set('phone', formatPhone(e.target.value))}
            required
            placeholder="+7 900 000-00-00"
            type="tel"
            inputMode="tel"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            className="form-input"
            type="email"
            value={d.email}
            onChange={e => set('email', normalizeEmail(e.target.value))}
            placeholder="email@example.com"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="email"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Примечание</label>
          <textarea className="form-textarea" value={d.note} onChange={e => set('note', e.target.value)} placeholder="Любые заметки о клиенте..." />
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button type="submit" className="btn btn-primary">Сохранить</button>
      </div>
    </form>
  );
}

function ClientDetail({ client, orders, onClose, onCreateOrder, onOpenOrder, statusColors, statusLabels }) {
  const clientOrders = orders.filter(o => o.client_id === client.id);
  const total = clientOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  return (
    <Modal title="Карточка клиента" onClose={onClose} size="lg">
      <div className="modal-body">
        <div className="detail-header">
          <div className="detail-avatar">{client.name[0].toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <div className="detail-name">{client.name}</div>
            <div className="detail-sub">{client.phone}{client.email ? ` · ${client.email}` : ''}</div>
            {client.note && <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--text2)' }}>{client.note}</div>}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => onCreateOrder(client.id)}>
            <Icon name="plus" /> Создать заказ
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div className="card" style={{ flex: 1, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent2)' }}>{clientOrders.length}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>заказов</div>
          </div>
          <div className="card" style={{ flex: 1, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)' }}>{total.toLocaleString('ru-RU')} ₽</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>потрачено</div>
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">История заказов</div>
          {clientOrders.length === 0 && <div style={{ color: 'var(--text3)', fontSize: '0.83rem' }}>Заказов пока нет</div>}
          {clientOrders.map(o => (
            <button
              key={o.id}
              type="button"
              className="mini-order"
              onClick={() => onOpenOrder(o.id)}
              style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="status-badge" style={{ color: statusColors[o.status] || '#888', background: statusColors[o.status] + '22' || '#88888822' }}>
                  <span className="status-dot-inline" />{statusLabels[o.status] || o.status}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{new Date(o.created_at).toLocaleDateString('ru-RU')}</span>
              </div>
              {(o.items || []).map((item, i) => (
                <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>{item.product_name} × {item.quantity}</div>
              ))}
              <div style={{ marginTop: 6, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                {Number(o.total_amount || 0).toLocaleString('ru-RU')} ₽
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default function ClientsPage({ clients = [], orders = [], onRefresh, onCreateOrder, onOpenOrder, statusColors = {}, statusLabels = {}, search }) {
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) || (c.note || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (data) => {
    try { await api.post('/clients', data); toast('Клиент добавлен'); setShowAdd(false); onRefresh(); }
    catch (e) { toast(e.response?.data?.error || 'Ошибка', 'error'); }
  };
  const handleEdit = async (data) => {
    try { await api.put(`/clients/${editing.id}`, data); toast('Клиент обновлён'); setEditing(null); onRefresh(); }
    catch (e) { toast(e.response?.data?.error || 'Ошибка', 'error'); }
  };
  const handleDelete = async (id) => {
    if (!confirm('Удалить клиента? Все его заказы тоже будут удалены.')) return;
    try { await api.delete(`/clients/${id}`); toast('Клиент удалён'); onRefresh(); }
    catch (e) { toast(e.response?.data?.error || 'Ошибка', 'error'); }
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-meta">
          <span className="count-badge">Клиентов: {clients.length}</span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Icon name="plus" /> Добавить
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <div className="empty-text">{search ? 'Ничего не найдено' : 'Клиентов пока нет'}</div>
          {!search && <div className="empty-sub">Нажмите «Добавить», чтобы создать первого клиента</div>}
        </div>
      ) : (
        <div className="list-wrap">
          {filtered.map(c => {
            const co = orders.filter(o => o.client_id === c.id);
            const spent = co.reduce((s, o) => s + Number(o.total_amount || 0), 0);
            return (
              <div key={c.id} className="list-item" onClick={() => setDetail(c)}>
                <div className="list-item-avatar">{c.name[0].toUpperCase()}</div>
                <div className="list-item-main">
                  <div className="list-item-name">{c.name}</div>
                  <div className="list-item-sub">{c.phone}{c.email ? ` · ${c.email}` : ''}{c.note ? ` · ${c.note}` : ''}</div>
                </div>
                <div className="list-item-meta">
                  <div className="list-item-meta-main" style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>{spent.toLocaleString('ru-RU')} ₽</div>
                  <div className="list-item-meta-sub">{co.length} заказ(ов)</div>
                </div>
                <div className="list-actions">
                  <button className="btn-icon-only" onClick={e => { e.stopPropagation(); setEditing(c); }} title="Редактировать">
                    <Icon name="edit" size={14} />
                  </button>
                  <button className="btn-icon-only danger" onClick={e => { e.stopPropagation(); handleDelete(c.id); }} title="Удалить">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <Modal title="Новый клиент" onClose={() => setShowAdd(false)}>
          <ClientForm onSubmit={handleAdd} onClose={() => setShowAdd(false)} />
        </Modal>
      )}

      {editing && (
        <Modal title="Редактировать клиента" onClose={() => setEditing(null)}>
          <ClientForm initial={editing} onSubmit={handleEdit} onClose={() => setEditing(null)} />
        </Modal>
      )}

      {detail && (
        <ClientDetail
          client={detail} orders={orders}
          onClose={() => setDetail(null)}
          onCreateOrder={(id) => { setDetail(null); onCreateOrder(id); }}
          onOpenOrder={(orderId) => { setDetail(null); onOpenOrder(orderId); }}
          statusColors={statusColors} statusLabels={statusLabels}
        />
      )}
    </div>
  );
}
