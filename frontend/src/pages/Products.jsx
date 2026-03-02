import React, { useState } from 'react';
import Modal from '../components/Modal';
import Icon from '../components/Icons';
import { useToast } from '../components/Toast';
import api from '../api/client';

function ProductForm({ initial = {}, onSubmit, onClose }) {
  const [d, setD] = useState(() => ({
    name: initial.name || '',
    description: initial.description || '',
    price: initial.price ?? '',
    type: initial.type || 'service',
    stock_quantity: initial.stock_quantity ?? 0,
  }));

  const set = (k, v) => setD(p => ({ ...p, [k]: v }));
  const handle = (e) => {
    e.preventDefault();
    onSubmit({
      ...d,
      price: Number(d.price),
      stock_quantity: d.type === 'product' ? Number(d.stock_quantity) : 0,
    });
  };

  return (
    <form onSubmit={handle}>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">Тип *</label>
          <select className="form-select" value={d.type} onChange={e => set('type', e.target.value)}>
            <option value="service">Услуга</option>
            <option value="product">Товар</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Название *</label>
          <input className="form-input" value={d.name} onChange={e => set('name', e.target.value)} required placeholder="Название товара/услуги" />
        </div>
        <div className="form-group">
          <label className="form-label">Описание</label>
          <textarea className="form-textarea" value={d.description} onChange={e => set('description', e.target.value)} placeholder="Краткое описание..." />
        </div>
        <div className="form-group">
          <label className="form-label">Цена (₽) *</label>
          <input className="form-input" type="number" min="0" step="0.01" value={d.price} onChange={e => set('price', e.target.value)} required placeholder="0.00" />
        </div>
        {d.type === 'product' && (
          <div className="form-group">
            <label className="form-label">Начальный остаток *</label>
            <input className="form-input" type="number" min="0" step="1" value={d.stock_quantity} onChange={e => set('stock_quantity', e.target.value)} required />
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button type="submit" className="btn btn-primary">Сохранить</button>
      </div>
    </form>
  );
}

export default function ProductsPage({ products = [], onRefresh, search }) {
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase())
  );
  const grouped = {
    product: filtered.filter(p => p.type === 'product'),
    service: filtered.filter(p => p.type !== 'product'),
  };

  const handleAdd = async (data) => {
    try { await api.post('/products', data); toast('Позиция добавлена'); setShowAdd(false); onRefresh(); }
    catch (e) { toast(e.response?.data?.error || 'Ошибка', 'error'); }
  };
  const handleEdit = async (data) => {
    try { await api.put(`/products/${editing.id}`, data); toast('Позиция обновлена'); setEditing(null); onRefresh(); }
    catch (e) { toast(e.response?.data?.error || 'Ошибка', 'error'); }
  };
  const handleDelete = async (id) => {
    if (!confirm('Удалить позицию?')) return;
    try { await api.delete(`/products/${id}`); toast('Позиция удалена'); onRefresh(); }
    catch (e) { toast(e.response?.data?.error || 'Ошибка', 'error'); }
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-meta">
          <span className="count-badge">Позиций: {products.length}</span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Icon name="plus" /> Добавить
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <div className="empty-text">{search ? 'Ничего не найдено' : 'Пока нет товаров и услуг'}</div>
        </div>
      ) : (
        <div className="products-groups">
          {[
            { key: 'product', title: 'Товары', icon: '📦' },
            { key: 'service', title: 'Услуги', icon: '🛠️' },
          ].map(group => (
            <section key={group.key} className="products-group-section">
              <div className="products-group-header">
                <div className="products-group-title">{group.icon} {group.title}</div>
                <span className="count-badge">{grouped[group.key].length}</span>
              </div>

              {grouped[group.key].length === 0 ? (
                <div className="products-group-empty">Нет позиций</div>
              ) : (
                <div className="products-grid">
                  {grouped[group.key].map(p => (
                    <div key={p.id} className="product-card">
                      <div className="product-card-header">
                        <div className="product-icon">{p.type === 'product' ? '📦' : '🛠️'}</div>
                        <div className="product-actions">
                          <button className="btn-icon-only" onClick={() => setEditing(p)} title="Редактировать"><Icon name="edit" size={14} /></button>
                          <button className="btn-icon-only danger" onClick={() => handleDelete(p.id)} title="Удалить"><Icon name="trash" size={14} /></button>
                        </div>
                      </div>
                      <div className="product-name">{p.name}</div>
                      <div className="product-desc">{p.description || '—'}</div>
                      <div className="product-price">{Number(p.price).toLocaleString('ru-RU')} ₽</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="Новая позиция" onClose={() => setShowAdd(false)}>
          <ProductForm onSubmit={handleAdd} onClose={() => setShowAdd(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Редактировать позицию" onClose={() => setEditing(null)}>
          <ProductForm initial={editing} onSubmit={handleEdit} onClose={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}
