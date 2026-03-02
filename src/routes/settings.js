const router = require('express').Router();
const pool = require('../config/database');
const logger = require('../utils/logger');

// NOTE: roleGuard('admin') is applied in server.js for the entire /api/settings prefix.

const DEFAULT_SETTINGS = { legal_name: '', legal_address: '', inn: '', ogrn: '', telegram_admin_ids: '', telegram_bot_token: '' };

function normalizeTelegramAdminIds(raw) {
  const values = String(raw || '')
    .split(/[\s,;]+/)
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => v.replace(/^@/, ''));

  const unique = [];
  for (const value of values) {
    if (!/^-?\d+$/.test(value)) continue;
    if (!unique.includes(value)) unique.push(value);
    if (unique.length >= 50) break;
  }
  return unique.join(',');
}

router.get('/organization', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT legal_name, legal_address, inn, ogrn, telegram_admin_ids, telegram_bot_token FROM organization_settings WHERE id = 1'
    );
    res.json(result.rows[0] || DEFAULT_SETTINGS);
  } catch (err) {
    logger.error('Settings GET organization error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/organization', async (req, res) => {
  try {
    const legalName    = String(req.body.legal_name    || '').trim().slice(0, 500);
    const legalAddress = String(req.body.legal_address || '').trim().slice(0, 1000);
    const inn          = String(req.body.inn           || '').trim().slice(0, 12);
    const ogrn         = String(req.body.ogrn          || '').trim().slice(0, 15);
    const telegramAdminIds = normalizeTelegramAdminIds(req.body.telegram_admin_ids);
    const telegramBotToken = String(req.body.telegram_bot_token || '').trim().slice(0, 255);

    await pool.query(
      `UPDATE organization_settings SET legal_name=$1, legal_address=$2, inn=$3, ogrn=$4, telegram_admin_ids=$5, telegram_bot_token=$6, updated_at=NOW() WHERE id=1`,
      [legalName, legalAddress, inn, ogrn, telegramAdminIds, telegramBotToken]
    );

    logger.info('Organization settings updated', { actorId: req.user?.id });
    res.json({ legal_name: legalName, legal_address: legalAddress, inn, ogrn, telegram_admin_ids: telegramAdminIds, telegram_bot_token: telegramBotToken });
  } catch (err) {
    logger.error('Settings PUT organization error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
