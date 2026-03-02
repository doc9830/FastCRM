import React, { useState, useEffect, useCallback } from 'react';
import { ToastProvider } from '../components/Toast';
import Icon from '../components/Icons';
import Dashboard from './Dashboard';
import ClientsPage from './Clients';
import ProductsPage from './Products';
import WarehousePage from './Warehouse';
import OrdersPage from './Orders';
import { NotesPage, UsersPage } from './NotesUsers';
import StatisticsPage from './Statistics';
import SettingsPage from './Settings';
import api from '../api/client';

// Nav items available to all roles
const NAV_ALL = [
  { id: 'dashboard',  label: 'Главная',       icon: 'dashboard' },
  { id: 'clients',    label: 'Клиенты',        icon: 'clients' },
  { id: 'products',   label: 'Товары/услуги',  icon: 'products' },
  { id: 'warehouse',  label: 'Склад',          icon: 'warehouse' },
  { id: 'orders',     label: 'Заказы',         icon: 'orders' },
  { id: 'statistics', label: 'Статистика',     icon: 'trending' },
  { id: 'notes',      label: 'Заметки',        icon: 'notes' },
];

// Nav items only for admin
const NAV_ADMIN = [
  { id: 'users',    label: 'Пользователи', icon: 'users' },
  { id: 'settings', label: 'Настройки',    icon: 'settings' },
];

const PAGE_TITLES = {
  dashboard: 'Главная', clients: 'Клиенты', products: 'Товары/услуги', warehouse: 'Склад',
  orders: 'Заказы', statistics: 'Статистика', notes: 'Заметки',
  users: 'Пользователи', settings: 'Настройки',
};

function Sidebar({ active, onNav, user, onLogout, urgentNotes, isAdmin }) {
  const nav = isAdmin ? [...NAV_ALL, ...NAV_ADMIN] : NAV_ALL;
  const [showLogout, setShowLogout] = useState(false);

  const handleAvatarClick = () => {
    setShowLogout(prev => !prev);
  };

  const handleLogout = () => {
    setShowLogout(false);
    onLogout();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">
          <div className="logo-icon">F</div>
          <div>
            <div className="logo-text">FastCRM</div>
            <div className="logo-version">v2.0</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {nav.map(item => (
          <button
            key={item.id}
            className={`nav-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onNav(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.id === 'notes' && urgentNotes > 0 && (
              <span className="nav-badge">{urgentNotes}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className={`user-card ${showLogout ? 'menu-open' : ''}`}>
          <button
            type="button"
            className="user-avatar user-avatar-btn"
            onClick={handleAvatarClick}
            aria-label="Открыть меню пользователя"
            aria-expanded={showLogout}
          >
            {(user.name || user.username)[0].toUpperCase()}
          </button>
          <div>
            <div className="user-name">{user.name || user.username}</div>
            <div className="user-role">{user.role}</div>
          </div>
          <button className="btn-logout" onClick={handleLogout} title="Выйти">→</button>
        </div>
      </div>
    </aside>
  );
}

export default function CRM({ user, onLogout, onSessionExpired, theme, onThemeToggle }) {
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState('dashboard');
  const [search, setSearch] = useState('');
  const [openOrderId, setOpenOrderId] = useState(null);
  const [data, setData] = useState({
    clients: [], products: [], orders: [], notes: [],
    users: [], stats: null, statuses: [], organizationSettings: null,
  });
  const [loading, setLoading] = useState(true);

  // Safely extract array from both plain-array and paginated { data: [], total } responses
  const toArr = (r) => {
    const d = r?.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.data)) return d.data;
    return [];
  };

  const fetchAll = useCallback(async () => {
    try {
      // Base fetches — available to all roles
      const basePromises = [
        api.get('/clients').then(toArr),
        api.get('/products').then(toArr),
        api.get('/orders').then(toArr),
        api.get('/notes').then(toArr),
        api.get('/stats').then(r => r.data),
        api.get('/orders/statuses').then(toArr),
      ];

      // Admin-only fetches — skip entirely for non-admins to avoid 403
      const adminPromises = isAdmin
        ? [
            api.get('/users').then(toArr),
            api.get('/settings/organization').then(r => r.data),
          ]
        : [
            Promise.resolve([]),
            Promise.resolve(null),
          ];

      const [clients, products, orders, notes, stats, statuses, users, organizationSettings] =
        await Promise.all([...basePromises, ...adminPromises]);

      setData({ clients, products, orders, notes, users, stats, statuses, organizationSettings });
    } catch (e) {
      if (e?.response?.status === 401) {
        onSessionExpired?.();
        return;
      }
      console.error('Fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, onSessionExpired]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Selective refresh — admin-only keys silently skipped for non-admins
  const refresh = useCallback(async (...entities) => {
    const all = entities.length === 0
      ? ['clients', 'products', 'orders', 'notes', 'stats',
         ...(isAdmin ? ['users', 'organizationSettings'] : [])]
      : entities;

    const fetches = {
      clients:              () => api.get('/clients').then(r => ({ clients: toArr(r) })),
      products:             () => api.get('/products').then(r => ({ products: toArr(r) })),
      orders:               () => api.get('/orders').then(r => ({ orders: toArr(r) })),
      notes:                () => api.get('/notes').then(r => ({ notes: toArr(r) })),
      stats:                () => api.get('/stats').then(r => ({ stats: r.data })),
      // admin-only — only added when user is admin
      ...(isAdmin ? {
        users:                () => api.get('/users').then(r => ({ users: toArr(r) })),
        organizationSettings: () => api.get('/settings/organization').then(r => ({ organizationSettings: r.data })),
      } : {}),
    };

    try {
      const results = await Promise.all(
        all.filter(e => fetches[e]).map(e => fetches[e]())
      );
      setData(prev => Object.assign({}, prev, ...results));
    } catch (e) {
      if (e?.response?.status === 401) { onSessionExpired?.(); return; }
      console.error('Refresh error', e);
    }
  }, [isAdmin, onSessionExpired]);

  const urgentNotes = (data.notes || []).filter(
    n => n.reminder_date && new Date(n.reminder_date) < new Date() && !n.notified
  ).length;

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0f14' }}>
      <div className="loading-spinner">
        <div className="spinner" />
        <span style={{ color: '#9aa3c0' }}>Загрузка данных...</span>
      </div>
    </div>
  );

  const handleCreateOrderForClient = (clientId) => {
    setTab('orders');
    setOpenOrderId(null);
    setTimeout(() => { if (window.__openOrderForClient) window.__openOrderForClient(clientId); }, 50);
  };

  const handleCreateOrder = () => {
    setTab('orders');
    setOpenOrderId(null);
    setTimeout(() => { if (window.__openOrderCreate) window.__openOrderCreate(); }, 50);
  };

  const handleOpenClientOrder = (orderId) => handleNavigate('orders', { orderId });
  const handleDashboardOrderOpen = (orderId) => handleNavigate('orders', { orderId });

  const handleOrderStatusChange = async (orderId, status) => {
    const previousOrders = data.orders;
    setData(prev => ({
      ...prev,
      orders: prev.orders.map(o => o.id === orderId ? { ...o, status } : o),
    }));
    try {
      const res = await api.patch(`/orders/${orderId}/status`, { status });
      setData(prev => ({
        ...prev,
        orders: prev.orders.map(o => o.id === orderId ? { ...o, ...res.data } : o),
      }));
      await refresh('orders', 'products', 'stats');
    } catch (error) {
      console.error('Status update error', error);
      setData(prev => ({ ...prev, orders: previousOrders }));
    }
  };

  const handleNavigate = (id, options = {}) => {
    // Prevent non-admins from accessing admin pages
    if (!isAdmin && (id === 'users' || id === 'settings')) return;
    setTab(id);
    setSearch('');
    setOpenOrderId(id === 'orders' ? (options.orderId ?? null) : null);
  };

  const statusColors = Object.fromEntries((data.statuses || []).map(s => [s.value, s.color]));
  const statusLabels = Object.fromEntries((data.statuses || []).map(s => [s.value, s.label]));

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar
          active={tab}
          onNav={(id) => handleNavigate(id)}
          user={user}
          onLogout={onLogout}
          urgentNotes={urgentNotes}
          isAdmin={isAdmin}
        />

        <div className="main">
          <div className="topbar">
            <h1 className="topbar-title">{PAGE_TITLES[tab]}</h1>
            <div className="topbar-actions">
              <button
                type="button"
                className="btn-theme-toggle"
                onClick={onThemeToggle}
                title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
              >
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
                <span>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
              </button>
              {['clients', 'products', 'warehouse', 'orders'].includes(tab) && (
                <div className="search-wrap">
                  <Icon name="search" size={16} />
                  <input
                    className="search-input"
                    placeholder="Поиск..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="page">
            {tab === 'dashboard' && (
              <Dashboard
                stats={data.stats}
                orders={data.orders}
                onNavigate={handleNavigate}
                onOpenOrder={handleDashboardOrderOpen}
                onCreateOrder={handleCreateOrder}
              />
            )}
            {tab === 'clients' && (
              <ClientsPage
                clients={data.clients}
                orders={data.orders}
                onRefresh={() => refresh('clients', 'orders', 'stats')}
                onCreateOrder={handleCreateOrderForClient}
                onOpenOrder={handleOpenClientOrder}
                statusColors={statusColors}
                statusLabels={statusLabels}
                search={search}
              />
            )}
            {tab === 'products' && (
              <ProductsPage
                products={data.products}
                onRefresh={() => refresh('products', 'stats')}
                search={search}
              />
            )}
            {tab === 'warehouse' && (
              <WarehousePage
                products={data.products}
                onRefresh={() => refresh('products', 'stats')}
                search={search}
                onOpenOrder={(orderId) => handleNavigate('orders', { orderId })}
              />
            )}
            {tab === 'orders' && (
              <OrdersPage
                orders={data.orders}
                clients={data.clients}
                products={data.products}
                notes={data.notes}
                statuses={data.statuses}
                onRefresh={() => refresh('orders', 'stats', 'notes', 'clients')}
                onStatusChange={handleOrderStatusChange}
                search={search}
                openOrderId={openOrderId}
                organizationSettings={data.organizationSettings}
              />
            )}
            {tab === 'statistics' && (
              <StatisticsPage
                orders={data.orders}
                statuses={data.statuses}
              />
            )}
            {tab === 'notes' && (
              <NotesPage
                notes={data.notes}
                orders={data.orders}
                onRefresh={() => refresh('notes')}
              />
            )}
            {/* Admin-only tabs */}
            {tab === 'users' && isAdmin && (
              <UsersPage
                users={data.users}
                onRefresh={() => refresh('users')}
              />
            )}
            {tab === 'settings' && isAdmin && (
              <SettingsPage
                organizationSettings={data.organizationSettings}
                onRefresh={() => refresh('organizationSettings')}
              />
            )}
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
