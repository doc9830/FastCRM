import React, { useState, useCallback } from 'react';
import Modal from '../components/Modal';
import Icon from '../components/Icons';
import OrderDetailModal from '../components/OrderDetailModal';
import { useToast } from '../components/Toast';
import api from '../api/client';

const normalizePhone = (value = '') => String(value).replace(/\D/g, '');
const formatPhone = (value) => {
  const digits = normalizePhone(value);
  if (!digits) return '+7';

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

function ClientSearch({ clients, selected, onSelect, onClear }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q)
  );
  const sel = clients.find(c => c.id === selected);

  if (sel) return (
    <div className="selected-client-card">
      <div className="list-item-avatar" style={{ width: 32, height: 32, fontSize: '0.8rem' }}>
        {sel.name[0].toUpperCase()}
      </div>
      <div className="selected-client-info">
        <div className="selected-client-name">{sel.name}</div>
        <div className="selected-client-phone">{sel.phone}</div>
      </div>
      <button className="btn-icon-only" onClick={onClear}>✕</button>
    </div>
  );

  return (
    <div className="search-dropdown-wrap">
      <input
        className="form-input"
        placeholder="Имя или телефон клиента..."
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && q && (
        <div className="search-dropdown">
          {filtered.length === 0
            ? <div className="dropdown-empty">Клиенты не найдены</div>
            : filtered.slice(0, 8).map(c => (
              <div key={c.id} className="search-dropdown-item" onClick={() => { onSelect(c.id); setQ(''); }}>
                <div className="list-item-avatar" style={{ width: 32, height: 32, fontSize: '0.8rem' }}>
                  {c.name[0].toUpperCase()}
                </div>
                <div>
                  <div className="dropdown-item-name">{c.name}</div>
                  <div className="dropdown-item-phone">{c.phone}</div>
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

function OrderForm({ clients, products, statuses, initial, onSubmit, onClose }) {
  const isEditMode = Boolean(initial?.id);
  const [clientId, setClientId] = useState(initial?.client_id || null);
  const [status, setStatus] = useState(initial?.status || 'new');
  const [comment, setComment] = useState(initial?.comment || '');
  const [clientMode, setClientMode] = useState('search');
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('+7');
  const [matchedClientId, setMatchedClientId] = useState(null);
  const [items, setItems] = useState(
    initial?.items?.filter(i => i.product_id).map(i => ({
      product_id: String(i.product_id), quantity: i.quantity
    })) || [{ product_id: '', quantity: 1 }]
  );

  const addItem = () => setItems(p => [...p, { product_id: '', quantity: 1 }]);
  const removeItem = i => setItems(p => p.filter((_, j) => j !== i));
  const setItem = (i, k, v) => setItems(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));

  React.useEffect(() => {
    if (clientMode !== 'new') return;
    const normalizedInput = normalizePhone(newClientPhone);
    if (!normalizedInput) {
      setMatchedClientId(null);
      return;
    }
    const matchedClient = clients.find(c => normalizePhone(c.phone) === normalizedInput);
    if (!matchedClient) {
      setMatchedClientId(null);
      return;
    }
    setMatchedClientId(matchedClient.id);
    setClientId(matchedClient.id);
    setNewClientName(matchedClient.name);
    setNewClientPhone(matchedClient.phone);
  }, [clients, clientMode, newClientPhone]);

  React.useEffect(() => {
    if (clientMode !== 'new' || matchedClientId) return;
    setClientId(null);
  }, [clientMode, matchedClientId]);

  const total = items.reduce((s, item) => {
    const p = products.find(p => p.id === Number(item.product_id));
    return s + (p ? Number(p.price) * Number(item.quantity || 0) : 0);
  }, 0);

  const handle = e => {
    e.preventDefault();
    const trimmedName = newClientName.trim();
    const trimmedPhone = newClientPhone.trim();
    if (clientMode === 'search' && !clientId) { alert('Выберите клиента'); return; }
    if (clientMode === 'new' && !matchedClientId && (!trimmedName || normalizePhone(trimmedPhone).length < 11)) {
      alert('Укажите имя и корректный телефон клиента');
      return;
    }
    if (items.some(i => !i.product_id)) { alert('Выберите товар/услугу для каждой позиции'); return; }
    onSubmit({
      client_id: clientId,
      new_client: clientMode === 'new' && !matchedClientId
        ? { name: trimmedName, phone: trimmedPhone }
        : null,
      status,
      comment,
      items: items.map(i => ({ product_id: Number(i.product_id), quantity: Number(i.quantity) }))
    });
  };

  return (
    <form onSubmit={handle}>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">Клиент *</label>
          <div className="client-mode-toggle">
            <button
              type="button"
              className={`btn btn-sm ${clientMode === 'search' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setClientMode('search');
                setMatchedClientId(null);
              }}
            >
              Поиск клиента
            </button>
            {!isEditMode && (
              <button
                type="button"
                className={`btn btn-sm ${clientMode === 'new' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => {
                  setClientMode('new');
                  setClientId(null);
                  setMatchedClientId(null);
                  setNewClientName('');
                  setNewClientPhone('+7');
                }}
              >
                Новый клиент
              </button>
            )}
          </div>
          {clientMode === 'search' ? (
            <ClientSearch
              clients={clients}
              selected={clientId}
              onSelect={setClientId}
              onClear={() => setClientId(null)}
            />
          ) : (
            <div>
              <div style={{ display: 'grid', gap: 8 }}>
                <input
                  className="form-input"
                  placeholder="Имя клиента"
                  value={newClientName}
                  onChange={e => {
                    setNewClientName(e.target.value);
                    if (matchedClientId) setMatchedClientId(null);
                  }}
                  required={!matchedClientId}
                />
                <input
                  className="form-input"
                  placeholder="Телефон клиента"
                  value={newClientPhone}
                  onChange={e => {
                    setNewClientPhone(formatPhone(e.target.value));
                    setMatchedClientId(null);
                  }}
                  required={!matchedClientId}
                  type="tel"
                  inputMode="tel"
                />
              </div>
              {matchedClientId && (
                <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text2)' }}>
                  Клиент с таким номером уже существует — данные подгружены автоматически.
                </div>
              )}
            </div>
          )}
        </div>

        {initial && (
          <div className="form-group">
            <label className="form-label">Статус</label>
            <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
              {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>Товары/услуги *</label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>
              <Icon name="plus" size={14} /> Позиция
            </button>
          </div>
          <div className="order-items-form">
            {items.map((item, i) => (
              <div key={i} className="order-item-input">
                <select
                  className="form-select"
                  value={item.product_id}
                  onChange={e => setItem(i, 'product_id', e.target.value)}
                  required
                >
                  <option value="">Выберите товар/услугу</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type === 'product' ? 'Товар' : 'Услуга'}) — {Number(p.price).toLocaleString('ru-RU')} ₽
                    </option>
                  ))}
                </select>
                <input
                  className="form-input"
                  type="number" min="1"
                  value={item.quantity}
                  onChange={e => setItem(i, 'quantity', e.target.value)}
                  style={{ width: 70 }}
                />
                {items.length > 1 && (
                  <button type="button" className="btn-icon-only danger" onClick={() => removeItem(i)}>
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {total > 0 && (
            <div style={{ textAlign: 'right', marginTop: 10, fontSize: '1rem', fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
              Итого: {total.toLocaleString('ru-RU')} ₽
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Комментарий</label>
          <textarea
            className="form-textarea"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Дополнительные пожелания..."
          />
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button type="submit" className="btn btn-primary">Сохранить</button>
      </div>
    </form>
  );
}

function OrderNoteForm({ order, onSubmit, onClose }) {
  const [text, setText] = useState('');
  const [reminderDate, setReminderDate] = useState('');

  const handle = (e) => {
    e.preventDefault();
    onSubmit({
      text,
      order_id: order.id,
      reminder_date: reminderDate || null,
    });
  };

  return (
    <form onSubmit={handle}>
      <div className="modal-body">
        <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: 12 }}>
          Заказ #{order.id} · {order.client_name || 'Клиент не указан'}
        </div>
        <div className="form-group">
          <label className="form-label">Текст заметки *</label>
          <textarea
            className="form-textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            required
            placeholder="Что важно по этому заказу..."
            rows={4}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Напоминание</label>
          <input
            className="form-input"
            type="datetime-local"
            value={reminderDate}
            onChange={e => setReminderDate(e.target.value)}
          />
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button type="submit" className="btn btn-primary">Сохранить</button>
      </div>
    </form>
  );
}

export default function OrdersPage({ orders: initialOrders = [], clients = [], products = [], notes = [], statuses = [], onRefresh, onStatusChange, search, openOrderId, organizationSettings }) {
  const toast = useToast();
  // Local orders state for optimistic UI
  const [localOrders, setLocalOrders] = useState(Array.isArray(initialOrders) ? initialOrders : []);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [noteOrder, setNoteOrder] = useState(null);
  const [preClientId, setPreClientId] = useState(null);

  // Sync when parent refreshes
  React.useEffect(() => { setLocalOrders(Array.isArray(initialOrders) ? initialOrders : []); }, [initialOrders]);

  // Expose for parent (create order from client card)
  React.useEffect(() => {
    window.__openOrderForClient = (clientId) => { setPreClientId(clientId); setShowAdd(true); };
    window.__openOrderCreate = () => { setPreClientId(null); setShowAdd(true); };
    return () => {
      delete window.__openOrderForClient;
      delete window.__openOrderCreate;
    };
  }, []);

  React.useEffect(() => {
    if (!openOrderId) return;
    const orderToOpen = localOrders.find(o => o.id === openOrderId);
    if (orderToOpen) setDetail(orderToOpen);
  }, [openOrderId, localOrders]);

  const statusColors = Object.fromEntries(statuses.map(s => [s.value, s.color]));
  const statusLabels = Object.fromEntries(statuses.map(s => [s.value, s.label]));

  const normalizedSearch = search.toLowerCase();
  const matchesSearch = (order) => !search || (order.client_name || '').toLowerCase().includes(normalizedSearch);

  const activeOrders = localOrders.filter(o => o.status !== 'ready' && matchesSearch(o));
  const archivedOrders = localOrders.filter(o => o.status === 'ready' && matchesSearch(o));

  // ── Optimistic status update ───────────────────────────
  const handleStatus = useCallback(async (id, status, e) => {
    e?.stopPropagation?.();
    // Optimistic: update locally right away
    setLocalOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    if (detail?.id === id) setDetail(prev => ({ ...prev, status }));
    try {
      if (onStatusChange) {
        await onStatusChange(id, status);
      } else {
        const res = await api.patch(`/orders/${id}/status`, { status });
        // Sync with server response
        setLocalOrders(prev => prev.map(o => o.id === id ? { ...o, ...res.data } : o));
      }
    } catch (err) {
      // Revert on error
      toast('Ошибка обновления статуса: ' + (err.response?.data?.error || err.message), 'error');
      onRefresh();
    }
  }, [detail, toast, onRefresh, onStatusChange]);

  const handleAdd = async (data) => {
    try {
      let orderPayload = { ...data };
      if (data.new_client) {
        const clientRes = await api.post('/clients', data.new_client);
        const createdClient = clientRes.data;
        if (!createdClient?.id) throw new Error('Не удалось создать клиента');
        orderPayload = { ...orderPayload, client_id: createdClient.id };
      }
      delete orderPayload.new_client;

      const res = await api.post('/orders', orderPayload);
      setLocalOrders(prev => [res.data, ...prev]);
      toast('Заказ создан');
      setShowAdd(false);
      setPreClientId(null);
      onRefresh(); // refresh stats
    } catch (e) { toast(e.response?.data?.error || 'Ошибка создания заказа', 'error'); }
  };

  const handleEdit = async (data) => {
    try {
      const res = await api.put(`/orders/${editing.id}`, data);
      setLocalOrders(prev => prev.map(o => o.id === editing.id ? res.data : o));
      toast('Заказ обновлён');
      setEditing(null);
      onRefresh();
    } catch (e) { toast(e.response?.data?.error || 'Ошибка', 'error'); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Удалить заказ?')) return;
    try {
      await api.delete(`/orders/${id}`);
      setLocalOrders(prev => prev.filter(o => o.id !== id));
      toast('Заказ удалён');
      onRefresh();
    } catch (e) { toast('Ошибка', 'error'); }
  };

  const handleAddNote = async (data) => {
    try {
      await api.post('/notes', data);
      toast('Заметка добавлена');
      setNoteOrder(null);
      onRefresh();
    } catch (e) {
      toast(e.response?.data?.error || 'Ошибка добавления заметки', 'error');
    }
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-meta">
          <span className="count-badge">Всего заказов: {localOrders.length}</span>
        </div>
        <button className="btn btn-primary" onClick={() => { setPreClientId(null); setShowAdd(true); }}>
          <Icon name="plus" /> Создать заказ
        </button>
      </div>

      <div className="orders-layout">
        <div>
          {activeOrders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🛒</div>
              <div className="empty-text">{search ? 'Ничего не найдено' : 'Активных заказов пока нет'}</div>
            </div>
          ) : (
            activeOrders.map(order => {
              const color = statusColors[order.status] || '#888';
              return (
                <div
                  key={order.id}
                  className="order-card"
                  onClick={(e) => {
                    if (e.target.closest('.status-buttons, .btn-icon-only')) return;
                    setDetail(order);
                  }}
                >
                  <div className="order-card-header">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="order-card-title">{order.client_name || 'Неизвестный клиент'}</div>
                        <span className="status-badge" style={{ color, background: color + '22' }}>
                          <span className="status-dot-inline" />{statusLabels[order.status] || order.status}
                        </span>
                      </div>
                      <div className="order-card-date">
                        #{order.id} · {new Date(order.created_at).toLocaleString('ru-RU')}
                        {order.client_phone && ` · ${order.client_phone}`}
                      </div>
                    </div>
                    <button
                      className="btn-icon-only danger"
                      onClick={e => handleDelete(order.id, e)}
                      title="Удалить"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>

                  <div className="order-items-list">
                    {(order.items || []).slice(0, 3).map((item, i) => (
                      <div key={i} className="order-item-row">
                        <span>{item.product_name || 'Товар удалён'}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>
                          {item.quantity} × {Number(item.price || 0).toLocaleString('ru-RU')} ₽
                        </span>
                      </div>
                    ))}
                    {(order.items || []).length > 3 && (
                      <div className="order-item-row" style={{ color: 'var(--text3)' }}>
                        +{order.items.length - 3} позиций ещё
                      </div>
                    )}
                  </div>

                  <div className="order-card-footer">
                    <div className="status-buttons" onClick={e => e.stopPropagation()}>
                      {statuses.map(s => (
                        <button
                          key={s.value}
                          className={`status-btn ${order.status === s.value ? 'active' : ''}`}
                          style={order.status === s.value ? { background: s.color, borderColor: s.color } : {}}
                          onClick={e => handleStatus(order.id, s.value, e)}
                        >
                          {order.status === s.value && <Icon name="check" size={11} />} {s.label}
                        </button>
                      ))}
                    </div>
                    <div className="order-total">
                      {Number(order.total_amount || 0).toLocaleString('ru-RU')} ₽
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <aside className="orders-archive">
          <div className="orders-archive-title">Архив</div>
          {archivedOrders.length === 0 ? (
            <div className="orders-archive-empty">Готовых заказов нет</div>
          ) : (
            archivedOrders.map(order => (
              <button key={order.id} className="archive-order-item" onClick={() => setDetail(order)}>
                <div className="archive-order-head">
                  <span>#{order.id}</span>
                  <span>{Number(order.total_amount || 0).toLocaleString('ru-RU')} ₽</span>
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{order.client_name || 'Неизвестный клиент'}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>
                  {new Date(order.created_at).toLocaleDateString('ru-RU')}
                </div>
              </button>
            ))
          )}
        </aside>
      </div>

      {showAdd && (
        <Modal title="Новый заказ" onClose={() => { setShowAdd(false); setPreClientId(null); }} size="lg">
          <OrderForm
            clients={clients} products={products} statuses={statuses}
            initial={preClientId ? { client_id: preClientId } : null}
            onSubmit={handleAdd}
            onClose={() => { setShowAdd(false); setPreClientId(null); }}
          />
        </Modal>
      )}

      {editing && (
        <Modal title={`Редактировать заказ #${editing.id}`} onClose={() => setEditing(null)} size="lg">
          <OrderForm
            clients={clients} products={products} statuses={statuses}
            initial={editing}
            onSubmit={handleEdit}
            onClose={() => setEditing(null)}
          />
        </Modal>
      )}

      {detail && (
        <OrderDetailModal
          order={detail}
          notes={notes}
          statuses={statuses}
          onClose={() => setDetail(null)}
          onAddNote={() => { setNoteOrder(detail); setDetail(null); }}
          onEdit={() => { setEditing(detail); setDetail(null); }}
          onChangeStatus={handleStatus}
          organizationSettings={organizationSettings}
        />
      )}

      {noteOrder && (
        <Modal title={`Новая заметка к заказу #${noteOrder.id}`} onClose={() => setNoteOrder(null)}>
          <OrderNoteForm
            order={noteOrder}
            onSubmit={handleAddNote}
            onClose={() => setNoteOrder(null)}
          />
        </Modal>
      )}
    </div>
  );
}
