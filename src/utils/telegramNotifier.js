const https = require('https');
const pool = require('../config/database');
const logger = require('./logger');

const ENV_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

const STATUS_LABELS = {
  new: 'Новый',
  in_progress: 'В работе',
  ready: 'Готов',
  cancelled: 'Отменён',
};

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? String(value || '-')
    : date.toLocaleString('ru-RU', { hour12: false });
}

function splitAdminIds(raw) {
  return String(raw || '')
    .split(/[\s,;]+/)
    .map(v => v.trim())
    .filter(v => /^-?\d+$/.test(v));
}

function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken) return Promise.resolve(false);

  const payload = JSON.stringify({ chat_id: chatId, text });
  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${botToken}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
    timeout: 5000,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(true);
        reject(new Error(`Telegram send failed (${res.statusCode}): ${body.slice(0, 300)}`));
      });
    });

    req.on('timeout', () => req.destroy(new Error('Telegram send timeout')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function getTelegramConfig() {
  const result = await pool.query(
    'SELECT telegram_admin_ids, telegram_bot_token FROM organization_settings WHERE id = 1'
  );
  const row = result.rows[0] || {};
  return {
    botToken: String(row.telegram_bot_token || ENV_BOT_TOKEN || '').trim(),
    adminIds: splitAdminIds(row.telegram_admin_ids),
  };
}

function formatItems(items) {
  if (!Array.isArray(items) || items.length === 0) return '-';
  return items
    .map(item => {
      const qty = Number(item.quantity || 0);
      const lineTotal = Number(item.price || 0) * qty;
      return `• ${item.product_name || 'Позиция'} × ${qty} = ${lineTotal.toFixed(2)}`;
    })
    .join('\n');
}

function createOrderMessage(order, actorName) {
  return [
    '🆕 Новый заказ',
    `Дата/время: ${formatDateTime(order.created_at)}`,
    `Добавил: ${actorName || '-'}`,
    `Клиент: ${order.client_name || '-'}`,
    `Состав:\n${formatItems(order.items)}`,
    `Сумма: ${Number(order.total_amount || 0).toFixed(2)}`,
    `Статус: ${STATUS_LABELS[order.status] || order.status || '-'}`,
  ].join('\n');
}

function createOrderStatusMessage(order, actorName, previousStatus) {
  const prev = STATUS_LABELS[previousStatus] || previousStatus || '-';
  const current = STATUS_LABELS[order.status] || order.status || '-';
  return [
    '🔄 Обновление заказа',
    `Заказ #${order.id}`,
    `Дата/время создания: ${formatDateTime(order.created_at)}`,
    `Изменил: ${actorName || '-'}`,
    `Клиент: ${order.client_name || '-'}`,
    `Состав:\n${formatItems(order.items)}`,
    `Сумма: ${Number(order.total_amount || 0).toFixed(2)}`,
    `Статус: ${current}`,
    previousStatus ? `Было: ${prev}` : null,
  ].filter(Boolean).join('\n');
}

async function notifyAdmins(text) {
  const cfg = await getTelegramConfig();
  if (!cfg.botToken || !cfg.adminIds.length) return;

  await Promise.all(cfg.adminIds.map(async (chatId) => {
    try {
      await sendTelegramMessage(cfg.botToken, chatId, text);
    } catch (err) {
      logger.warn('Telegram notify failed', { chatId, err: err.message });
    }
  }));
}

module.exports = {
  notifyOrderCreated: async ({ order, actorName }) => {
    try {
      await notifyAdmins(createOrderMessage(order, actorName));
    } catch (err) {
      logger.warn('Telegram notifyOrderCreated skipped', { err: err.message });
    }
  },
  notifyOrderStatusChanged: async ({ order, actorName, previousStatus }) => {
    try {
      await notifyAdmins(createOrderStatusMessage(order, actorName, previousStatus));
    } catch (err) {
      logger.warn('Telegram notifyOrderStatusChanged skipped', { err: err.message });
    }
  },
};
