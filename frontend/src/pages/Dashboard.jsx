import React from 'react';

const STATUS_LABELS = { new: 'Новый', in_progress: 'В работе', ready: 'Готов', cancelled: 'Отменён' };
const STATUS_COLORS = { new: '#4f6ef7', in_progress: '#ffb340', ready: '#10d98b', cancelled: '#ff4f6a' };

function fmt(n) { return Number(n || 0).toLocaleString('ru-RU'); }

// Кликабельная карточка с переходом на вкладку
function QuickCard({ emoji, label, value, sub, color, onClick }) {
  return (
    <div
      className="stat-card"
      style={{ cursor: 'pointer', '--stat-color': color }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="stat-icon" style={{ background: color + '22', color, fontSize: 18 }}>{emoji}</div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text3)', marginTop: 2 }}>→</span>
      </div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard({ stats, orders = [], onNavigate, onOpenOrder, onCreateOrder }) {
  if (!stats) return (
    <div className="loading-spinner">
      <div className="spinner" />
      <span style={{ color: 'var(--text3)' }}>Загрузка...</span>
    </div>
  );

  const {
    overview = {},
  } = stats;

  // Только активные заказы (не отменённые и не готовые — в работе)
  const activeOrders = (orders || []).filter(o => o.status === 'new' || o.status === 'in_progress');
  const thisMonthRevenue = overview.revenue_this_month || 0;
  const thisMonthOrders = overview.orders_this_month || 0;

  return (
    <div>
      {/* Быстрые переходы */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <QuickCard
          emoji="👥"
          label="Клиентов"
          value={fmt(overview.total_clients)}
          color="#4f6ef7"
          onClick={() => onNavigate('clients')}
        />
        <QuickCard
          emoji="📦"
          label="Товаров"
          value={fmt(overview.total_products)}
          color="#10d98b"
          onClick={() => onNavigate('products')}
        />
        <QuickCard
          emoji="🛒"
          label="Заказов за месяц"
          value={fmt(thisMonthOrders)}
          sub={`Выручка: ${fmt(thisMonthRevenue)} ₽`}
          color="#a855f7"
          onClick={() => onNavigate('orders')}
        />
        <QuickCard
          emoji="📈"
          label="Всего выручка"
          value={fmt(thisMonthRevenue) + ' ₽'}
          sub={`Выполнено заказов: ${fmt(thisMonthOrders)}`}
          color="#ffb340"
          onClick={() => onNavigate('statistics')}
        />
      </div>

      {/* Текущие заказы (new + in_progress) */}
      <div className="card card-static-hover" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Текущие заказы
            {activeOrders.length > 0 && (
              <span style={{ marginLeft: 8, background: '#4f6ef722', color: '#4f6ef7', padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem' }}>
                {activeOrders.length}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={onCreateOrder}
              style={{ fontSize: '0.75rem' }}
            >
              Создать заказ
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onNavigate('orders')}
              style={{ fontSize: '0.75rem' }}
            >
              Все заказы →
            </button>
          </div>
        </div>

        {activeOrders.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: '0.85rem' }}>
            🎉 Нет активных заказов
          </div>
        ) : (
          activeOrders.slice(0, 8).map(order => {
            const color = STATUS_COLORS[order.status] || '#888';
            return (
              <div
                key={order.id}
                onClick={() => onOpenOrder(order.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '13px 20px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {order.client_name || 'Неизвестный клиент'}
                  </div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text3)', marginTop: 1 }}>
                    #{order.id} · {new Date(order.created_at).toLocaleDateString('ru-RU')}
                    {order.items?.length > 0 && ` · ${order.items.length} позиц.`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--mono)' }}>
                    {fmt(order.total_amount)} ₽
                  </div>
                  <div style={{ fontSize: '0.7rem', color, fontWeight: 600, marginTop: 1 }}>
                    {STATUS_LABELS[order.status]}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {activeOrders.length > 8 && (
          <div
            onClick={() => onNavigate('orders')}
            style={{ padding: '12px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Ещё {activeOrders.length - 8} заказов →
          </div>
        )}
      </div>
    </div>
  );
}
