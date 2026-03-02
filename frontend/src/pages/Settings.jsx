import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { useToast } from '../components/Toast';

export default function SettingsPage({ organizationSettings, onRefresh }) {
  const toast = useToast();
  const [form, setForm] = useState({
    legal_name: '',
    legal_address: '',
    inn: '',
    ogrn: '',
    telegram_admin_ids: '',
    telegram_bot_token: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      legal_name: organizationSettings?.legal_name || '',
      legal_address: organizationSettings?.legal_address || '',
      inn: organizationSettings?.inn || '',
      ogrn: organizationSettings?.ogrn || '',
      telegram_admin_ids: organizationSettings?.telegram_admin_ids || '',
      telegram_bot_token: organizationSettings?.telegram_bot_token || '',
    });
  }, [organizationSettings]);

  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings/organization', form);
      toast('Настройки организации сохранены');
      onRefresh();
    } catch (error) {
      toast(error.response?.data?.error || 'Не удалось сохранить настройки', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="section-header">
        <div className="section-meta">
          <span className="count-badge">Параметры организации</span>
        </div>
      </div>

      <form onSubmit={handleSave} className="modal-body" style={{ maxWidth: 760, padding: 0 }}>
        <div className="settings-group-card card card-static-hover">
          <div className="settings-group-head">
            <h3 className="settings-group-title">Данные организации</h3>
            <p className="settings-group-subtitle">Используются в чеках и документах.</p>
          </div>

          <div className="form-group">
            <label className="form-label">Наименование юридического лица</label>
            <input
              className="form-input"
              value={form.legal_name}
              onChange={(e) => setField('legal_name', e.target.value)}
              placeholder="ООО «Пример»"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Адрес юридического лица</label>
            <textarea
              className="form-textarea"
              value={form.legal_address}
              onChange={(e) => setField('legal_address', e.target.value)}
              placeholder="г. Москва, ул. Примерная, д. 1"
            />
          </div>

          <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">ИНН</label>
              <input
                className="form-input"
                value={form.inn}
                onChange={(e) => setField('inn', e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="7700000000"
                inputMode="numeric"
              />
            </div>

            <div>
              <label className="form-label">ОГРН</label>
              <input
                className="form-input"
                value={form.ogrn}
                onChange={(e) => setField('ogrn', e.target.value.replace(/\D/g, '').slice(0, 13))}
                placeholder="1027700000000"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        <div className="settings-group-card card card-static-hover">
          <div className="settings-group-head">
            <h3 className="settings-group-title">Настройки Telegram</h3>
            <p className="settings-group-subtitle">Уведомления о новых заказах и смене статусов.</p>
          </div>

          <div className="form-group">
            <label className="form-label">Telegram Bot Token</label>
            <input
              className="form-input"
              type="password"
              value={form.telegram_bot_token}
              onChange={(e) => setField('telegram_bot_token', e.target.value)}
              placeholder="123456789:AA..."
              autoComplete="new-password"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Telegram ID администраторов</label>
            <textarea
              className="form-textarea"
              value={form.telegram_admin_ids}
              onChange={(e) => setField('telegram_admin_ids', e.target.value)}
              placeholder="123456789, 987654321"
            />
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
              Можно указать несколько ID через запятую, пробел или с новой строки.
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ padding: 0, marginTop: 16 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}
