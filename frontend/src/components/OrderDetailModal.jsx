import React from 'react';
import Modal from './Modal';
import Icon from './Icons';

export default function OrderDetailModal({
  order,
  notes,
  statuses,
  onClose,
  onAddNote,
  onEdit,
  onChangeStatus,
  showActions = true,
  organizationSettings,
}) {
  const statusColors = Object.fromEntries(statuses.map(s => [s.value, s.color]));
  const statusLabels = Object.fromEntries(statuses.map(s => [s.value, s.label]));
  const orderNotes = notes.filter(n => n.order_id === order.id);
  const color = statusColors[order.status] || '#888';

  const handleDownloadReceipt = () => {
    const createdDate = new Date(order.created_at).toLocaleDateString('ru-RU');
    const fullClientName = order.client_name || 'Клиент';
    const receiptHtml = `<!doctype html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<title>Товарный чек №${order.id}</title>
<style>
  body { font-family: Arial, sans-serif; color: #111; margin: 28px; }
  .header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
  .left, .right { font-size: 13px; line-height: 1.4; }
  .right { text-align: right; }
  h1 { text-align: center; font-size: 18px; margin: 10px 0 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #111; padding: 7px; }
  th { background: #f3f3f3; }
  .num { text-align: right; white-space: nowrap; }
  .total { margin-top: 12px; text-align: right; font-weight: 700; font-size: 16px; }
  .sign { margin-top: 42px; font-size: 13px; }
</style>
</head>
<body>
  <div class="header">
    <div class="left">
      <div><strong>${organizationSettings?.legal_name || 'Наименование юр. лица не заполнено'}</strong></div>
      <div>${organizationSettings?.legal_address || 'Адрес юр. лица не заполнен'}</div>
      <div>ИНН: ${organizationSettings?.inn || 'не указан'}</div>
      <div>ОГРН: ${organizationSettings?.ogrn || 'не указан'}</div>
    </div>
    <div class="right">
      <div><strong>${fullClientName}</strong></div>
      <div>${order.client_phone || ''}</div>
    </div>
  </div>

  <h1>Товарный чек №${order.id} от ${createdDate}</h1>

  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>Наименование</th>
        <th>Кол-во</th>
        <th>Цена</th>
        <th>Сумма</th>
      </tr>
    </thead>
    <tbody>
      ${(order.items || []).map((item, index) => {
        const price = Number(item.price || 0);
        const quantity = Number(item.quantity || 0);
        const sum = price * quantity;
        return `<tr>
          <td>${index + 1}</td>
          <td>${item.product_name || 'Товар удалён'}</td>
          <td class="num">${quantity.toLocaleString('ru-RU')}</td>
          <td class="num">${price.toLocaleString('ru-RU')} ₽</td>
          <td class="num">${sum.toLocaleString('ru-RU')} ₽</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <div class="total">Итого: ${Number(order.total_amount || 0).toLocaleString('ru-RU')} ₽</div>
  <div class="sign">Подпись клиента: __________________ /${fullClientName}/</div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    };
  };

  return (
    <Modal title={`Заказ #${order.id}`} onClose={onClose} size="lg">
      <div className="modal-body">
        <div className="detail-header">
          <div>
            <div className="detail-name">{order.client_name}</div>
            <div className="detail-sub">{order.client_phone}</div>
            <div style={{ marginTop: 6 }}>
              <span className="status-badge" style={{ color, background: color + '22' }}>
                <span className="status-dot-inline" />{statusLabels[order.status] || order.status}
              </span>
            </div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text3)', marginTop: 4 }}>
              {new Date(order.created_at).toLocaleString('ru-RU')}
              {order.created_by_name && ` · ${order.created_by_name}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleDownloadReceipt}>
              <Icon name="receipt" size={14} /> Печать / PDF
            </button>
            {showActions && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={onEdit}>
                  <Icon name="edit" size={14} /> Изменить
                </button>
                <button className="btn btn-primary btn-sm" onClick={onAddNote}>
                  <Icon name="plus" size={14} /> Заметка
                </button>
              </>
            )}
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Статус заказа</div>
          <div className="status-buttons">
            {statuses.map(s => (
              <button
                key={s.value}
                className={`status-btn ${order.status === s.value ? 'active' : ''}`}
                style={order.status === s.value ? { background: s.color, borderColor: s.color } : { color: s.color }}
                onClick={() => onChangeStatus(order.id, s.value)}
              >
                {order.status === s.value && <Icon name="check" size={11} />} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Состав заказа</div>
          <div style={{ background: 'var(--bg3)', borderRadius: 8, overflow: 'hidden' }}>
            {(order.items || []).map((item, i) => (
              <div key={i} className="order-item-row" style={{ padding: '10px 14px' }}>
                <span>{item.product_name || 'Товар удалён'}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
                  {item.quantity} × {Number(item.price || 0).toLocaleString('ru-RU')} ₽
                  {' = '}{(item.quantity * Number(item.price || 0)).toLocaleString('ru-RU')} ₽
                </span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right', marginTop: 8, fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
            {Number(order.total_amount || 0).toLocaleString('ru-RU')} ₽
          </div>
        </div>

        {order.comment && (
          <div className="detail-section">
            <div className="detail-section-title">Комментарий</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text2)', background: 'var(--bg3)', padding: '10px 14px', borderRadius: 8 }}>
              {order.comment}
            </div>
          </div>
        )}

        {orderNotes.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-title">Заметки</div>
            {orderNotes.map(n => (
              <div key={n.id} className="mini-order">
                <div style={{ fontSize: '0.85rem' }}>{n.text}</div>
                {n.reminder_date && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--amber)', marginTop: 4 }}>
                    🔔 {new Date(n.reminder_date).toLocaleString('ru-RU')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
