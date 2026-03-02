import React, { useMemo, useState } from 'react';
import Modal from '../components/Modal';
import Icon from '../components/Icons';
import { useToast } from '../components/Toast';
import api from '../api/client';

function StockAdjustModal({ mode, products, onClose, onSubmit, loading }) {
  const [rows, setRows] = useState([{ productId: '', quantity: 1 }]);

  const updateRow = (index, key, value) => {
    setRows(prev => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const addRow = () => setRows(prev => [...prev, { productId: '', quantity: 1 }]);
  const removeRow = (index) => setRows(prev => prev.filter((_, i) => i !== index));

  const submit = (e) => {
    e.preventDefault();
    onSubmit(rows);
  };

  return (
    <form onSubmit={submit}>
      <div className="modal-body">
        <p className="empty-sub" style={{ marginBottom: 14 }}>
          {mode === 'in' ? 'Выберите товары и количество для прихода на склад.' : 'Выберите товары и количество для списания со склада.'}
        </p>
        <div className="stock-modal-grid stock-modal-head">
          <div>Товар</div>
          <div>Количество</div>
          <div />
        </div>

        {rows.map((row, index) => (
          <div className="stock-modal-grid" key={`adjust-${index}`}>
            <select
              className="form-select"
              value={row.productId}
              onChange={(e) => updateRow(index, 'productId', e.target.value)}
              required
            >
              <option value="">Выберите товар</option>
              {products.map((p) => (
                <option value={p.id} key={`opt-${p.id}`}>{p.name}</option>
              ))}
            </select>

            <input
              className="form-input"
              type="number"
              min="1"
              step="1"
              value={row.quantity}
              onChange={(e) => updateRow(index, 'quantity', e.target.value)}
              required
            />

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => removeRow(index)}
              disabled={rows.length === 1}
              title="Удалить строку"
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
        ))}

        <button type="button" className="btn btn-secondary btn-sm" onClick={addRow}>
          <Icon name="plus" size={12} /> Добавить позицию
        </button>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}

function ReservationModal({ product, rows, onClose, onOpenOrder }) {
  return (
    <Modal title={`Резерв по товару: ${product.name}`} onClose={onClose}>
      <div className="modal-body">
        {!rows.length ? (
          <div className="empty-text">Активных резервов нет</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Заказ</th>
                  <th>Клиент</th>
                  <th>Количество</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.order_id}-${row.quantity}`}>
                    <td>
                      <button type="button" className="btn-link" onClick={() => onOpenOrder(row.order_id)}>
                        #{row.order_id}
                      </button>
                    </td>
                    <td>{row.client_name || 'Без клиента'}</td>
                    <td>{Number(row.quantity || 0)} шт.</td>
                    <td>{new Date(row.created_at).toLocaleString('ru-RU')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

function HistoryModal({ product, rows, onClose, onOpenOrder }) {
  const getView = (entry) => {
    const actor = entry.actor_name || entry.actor_username || 'система';
    const orderId = Number(entry.order_id) || null;

    if (entry.action_type === 'manual_in') {
      return {
        title: 'ПРИХОД',
        amountColor: 'var(--green)',
        amountPrefix: '+',
        orderId: null,
        subtitle: 'Ручная корректировка',
        actor,
      };
    }

    if (entry.action_type === 'manual_out') {
      return {
        title: 'СПИСАНИЕ',
        amountColor: 'var(--red)',
        amountPrefix: '-',
        orderId: null,
        subtitle: 'Ручная корректировка',
        actor,
      };
    }

    if (entry.action_type === 'order_sale' || entry.action_type === 'order_writeoff') {
      return {
        title: 'ПРОДАЖА',
        amountColor: 'var(--red)',
        amountPrefix: '-',
        orderId,
        subtitle: 'Реализация по заказу',
        actor,
      };
    }

    if (entry.action_type === 'order_restore') {
      return {
        title: 'ПРИХОД',
        amountColor: 'var(--green)',
        amountPrefix: '+',
        orderId,
        subtitle: 'Возврат в остаток',
        actor,
      };
    }

    return {
      title: entry.action_type,
      amountColor: 'var(--text)',
      amountPrefix: '',
      orderId,
      subtitle: 'Операция склада',
      actor,
    };
  };

  return (
    <Modal title={`История товара: ${product.name}`} onClose={onClose}>
      <div className="modal-body">
        {!rows.length ? (
          <div className="empty-text">По этому товару пока нет движений</div>
        ) : (
          <div className="warehouse-history-list">
            {rows.map((entry) => {
              const view = getView(entry);
              return (
                <div key={entry.id} className="warehouse-history-item">
                  <div className="warehouse-history-time">{new Date(entry.created_at).toLocaleString('ru-RU')}</div>
                  <div className="warehouse-history-type">{view.title}</div>
                  {view.orderId ? (
                    <div className="warehouse-history-sub">
                      {view.subtitle}{' '}
                      <button type="button" className="btn-link" onClick={() => onOpenOrder(view.orderId)}>
                        #{view.orderId}
                      </button>
                    </div>
                  ) : (
                    <div className="warehouse-history-sub">{view.subtitle}</div>
                  )}
                  <div className="warehouse-history-meta">
                    <span>Пользователь: {view.actor}</span>
                    <span className="warehouse-history-balance">Остаток после операции: {entry.balance_after} шт.</span>
                  </div>
                  <div className="warehouse-history-amount" style={{ color: view.amountColor }}>
                    {view.amountPrefix}{entry.quantity} шт.
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function WarehousePage({ products = [], search, onRefresh, onOpenOrder }) {
  const toast = useToast();
  const [stockMode, setStockMode] = useState(null);
  const [stockSaving, setStockSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [reservationFor, setReservationFor] = useState(null);
  const [reservationRows, setReservationRows] = useState([]);

  const warehouseProducts = useMemo(() => products.filter((p) => {
    if (p.type !== 'product') return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
  }), [products, search]);

  const handleStockAdjust = async (rows) => {
    const payload = rows
      .map((row) => ({ productId: Number(row.productId), quantity: Number(row.quantity) }))
      .filter((row) => row.productId && Number.isInteger(row.quantity) && row.quantity > 0);

    if (payload.length === 0) {
      toast('Добавьте хотя бы одну корректную позицию', 'error');
      return;
    }

    const sign = stockMode === 'in' ? 1 : -1;

    try {
      setStockSaving(true);
      await Promise.all(payload.map((item) => api.post(`/products/${item.productId}/stock-adjust`, { delta: sign * item.quantity })));
      toast('Остатки на складе обновлены');
      setStockMode(null);
      onRefresh();
    } catch (e) {
      toast(e.response?.data?.error || 'Ошибка склада', 'error');
    } finally {
      setStockSaving(false);
    }
  };

  const openHistory = async (product) => {
    try {
      const response = await api.get(`/products/${product.id}/history`);
      setHistoryRows(response.data || []);
      setHistoryFor(product);
    } catch (e) {
      toast(e.response?.data?.error || 'Не удалось загрузить историю', 'error');
    }
  };

  const openReservations = async (product) => {
    try {
      const response = await api.get(`/products/${product.id}/reservations`);
      setReservationRows(response.data || []);
      setReservationFor(product);
    } catch (e) {
      toast(e.response?.data?.error || 'Не удалось загрузить резерв', 'error');
    }
  };

  const handleOpenOrder = (orderId) => {
    if (onOpenOrder) onOpenOrder(orderId);
    setReservationFor(null);
    setHistoryFor(null);
  };

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 8 }}>
        <div className="section-meta">
          <span className="count-badge">Складских позиций: {warehouseProducts.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setStockMode('in')}>
            <Icon name="plus" size={12} /> Приход
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setStockMode('out')}>
            <Icon name="trash" size={12} /> Списание
          </button>
        </div>
      </div>

      {warehouseProducts.length === 0 ? (
        <div className="empty-text">Нет товаров для склада</div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data-table warehouse-table">
            <thead>
              <tr>
                <th>Наименование</th>
                <th>Доступно (с резервом)</th>
                <th>Резерв</th>
                <th>Реальный остаток</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {warehouseProducts.map(p => (
                <tr key={`w-${p.id}`}>
                  <td>{p.name}</td>
                  <td>{Number(p.available_stock_quantity || 0)} шт.</td>
                  <td>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => openReservations(p)}
                      disabled={Number(p.reserved_quantity || 0) === 0}
                    >
                      {Number(p.reserved_quantity || 0)} шт.
                    </button>
                  </td>
                  <td>{Number((p.real_stock_quantity ?? p.stock_quantity) || 0)} шт.</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => openHistory(p)}>
                      <Icon name="receipt" size={12} /> История
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stockMode && (
        <Modal title={stockMode === 'in' ? 'Приход товаров' : 'Списание товаров'} onClose={() => setStockMode(null)}>
          <StockAdjustModal
            mode={stockMode}
            products={warehouseProducts}
            onClose={() => setStockMode(null)}
            onSubmit={handleStockAdjust}
            loading={stockSaving}
          />
        </Modal>
      )}

      {historyFor && (
        <HistoryModal product={historyFor} rows={historyRows} onClose={() => setHistoryFor(null)} onOpenOrder={handleOpenOrder} />
      )}

      {reservationFor && (
        <ReservationModal product={reservationFor} rows={reservationRows} onClose={() => setReservationFor(null)} onOpenOrder={handleOpenOrder} />
      )}
    </div>
  );
}
