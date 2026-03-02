import React, { useMemo, useState } from 'react';

function fmt(n) { return Number(n || 0).toLocaleString('ru-RU'); }

function toDateInputValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function groupTopClients(orders) {
  const map = new Map();
  orders.forEach(order => {
    const key = order.client_id || `name:${order.client_name || 'unknown'}`;
    const prev = map.get(key) || {
      client_id: order.client_id || null,
      client_name: order.client_name || 'Неизвестный клиент',
      orders_count: 0,
      total_amount: 0,
    };
    prev.orders_count += 1;
    prev.total_amount += Number(order.total_amount || 0);
    map.set(key, prev);
  });
  return [...map.values()]
    .sort((a, b) => (b.orders_count - a.orders_count) || (b.total_amount - a.total_amount))
    .slice(0, 5);
}

function groupTopProducts(orders) {
  const map = new Map();
  orders.forEach(order => {
    (order.items || []).forEach(item => {
      const key = item.product_id || `name:${item.product_name || 'unknown'}`;
      const quantity = Number(item.quantity || 0);
      const totalRevenue = Number(item.price || 0) * quantity;
      const prev = map.get(key) || {
        product_id: item.product_id || null,
        product_name: item.product_name || 'Без названия',
        total_quantity: 0,
        total_revenue: 0,
      };
      prev.total_quantity += quantity;
      prev.total_revenue += totalRevenue;
      map.set(key, prev);
    });
  });
  return [...map.values()]
    .sort((a, b) => (b.total_quantity - a.total_quantity) || (b.total_revenue - a.total_revenue))
    .slice(0, 5);
}

export default function StatisticsPage({ orders = [], statuses = [] }) {
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [dateTo, setDateTo] = useState(toDateInputValue(now));

  const statusByValue = useMemo(
    () => Object.fromEntries(statuses.map(s => [s.value, s])),
    [statuses]
  );

  const filteredOrders = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return orders
      .filter(order => {
        const createdAt = new Date(order.created_at);
        if (from && createdAt < from) return false;
        if (to && createdAt > to) return false;
        return true;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [orders, dateFrom, dateTo]);

  const completedRevenue = filteredOrders.reduce(
    (sum, order) => (order.status === 'ready' ? sum + Number(order.total_amount || 0) : sum),
    0
  );

  const topClients = useMemo(() => groupTopClients(filteredOrders), [filteredOrders]);
  const topProducts = useMemo(() => groupTopProducts(filteredOrders), [filteredOrders]);

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14 }}>
          Период отчёта
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label className="form-label" style={{ marginBottom: 6 }}>С</label>
            <input className="form-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="form-label" style={{ marginBottom: 6 }}>По</label>
            <input className="form-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card" style={{ '--stat-color': '#a855f7' }}>
          <div className="stat-value" style={{ color: '#a855f7' }}>{fmt(filteredOrders.length)}</div>
          <div className="stat-label">Заказов за период</div>
        </div>
        <div className="stat-card" style={{ '--stat-color': '#10d98b' }}>
          <div className="stat-value" style={{ color: '#10d98b' }}>{fmt(completedRevenue)} ₽</div>
          <div className="stat-label">Сумма выполненных заказов</div>
        </div>
      </div>

      <div className="statistics-top-grid">
        <div className="card card-static-hover">
          <div className="statistics-top-title">Топ товаров (5)</div>
          {topProducts.length === 0 ? (
            <div className="statistics-top-empty">Нет данных за выбранный период</div>
          ) : (
            <div className="statistics-top-list">
              {topProducts.map((product, idx) => (
                <div key={`${product.product_id || product.product_name}-${idx}`} className="statistics-top-item">
                  <div>
                    <div className="statistics-top-name">{idx + 1}. {product.product_name}</div>
                    <div className="statistics-top-sub">Продано: {fmt(product.total_quantity)} шт</div>
                  </div>
                  <div className="statistics-top-meta">{fmt(product.total_revenue)} ₽</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card-static-hover">
          <div className="statistics-top-title">Топ клиентов (5)</div>
          {topClients.length === 0 ? (
            <div className="statistics-top-empty">Нет данных за выбранный период</div>
          ) : (
            <div className="statistics-top-list">
              {topClients.map((client, idx) => (
                <div key={`${client.client_id || client.client_name}-${idx}`} className="statistics-top-item">
                  <div>
                    <div className="statistics-top-name">{idx + 1}. {client.client_name}</div>
                    <div className="statistics-top-sub">Заказов: {fmt(client.orders_count)}</div>
                  </div>
                  <div className="statistics-top-meta">{fmt(client.total_amount)} ₽</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card statistics-orders-table-wrap">
        <div className="statistics-orders-head">
          <div>ID</div>
          <div>Клиент</div>
          <div>Дата</div>
          <div>Статус</div>
          <div style={{ textAlign: 'right' }}>Сумма</div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="empty-state" style={{ margin: 8 }}>
            <div className="empty-text">За выбранный период заказов нет</div>
          </div>
        ) : (
          filteredOrders.map(order => {
            const status = statusByValue[order.status];
            const color = status?.color || '#9aa3c0';
            return (
              <div
                key={order.id}
                className="statistics-order-row"
              >
                <div className="statistics-order-cell" data-label="ID" style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>#{order.id}</div>
                <div className="statistics-order-cell" data-label="Клиент">{order.client_name || 'Неизвестный клиент'}</div>
                <div className="statistics-order-cell" data-label="Дата" style={{ color: 'var(--text2)' }}>{new Date(order.created_at).toLocaleString('ru-RU')}</div>
                <div className="statistics-order-cell" data-label="Статус">
                  <span className="status-badge" style={{ color, background: color + '22' }}>
                    {status?.label || order.status}
                  </span>
                </div>
                <div className="statistics-order-cell statistics-order-amount" data-label="Сумма">
                  {fmt(order.total_amount)} ₽
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
