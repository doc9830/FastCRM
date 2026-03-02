const router = require('express').Router();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const { validateUser, validateUserPassword } = require('../middleware/validate');
const ROLES = require('../constants/roles');

// NOTE: roleGuard('admin') is applied in server.js for the entire /api/users prefix.

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, name, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    logger.error('Users GET error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', validateUser, async (req, res) => {
  try {
    const { username, password, name, role = ROLES.MANAGER } = req.body;

    // Only allow known roles
    if (!Object.values(ROLES).includes(role)) {
      return res.status(422).json({ errors: [`role must be one of: ${Object.values(ROLES).join(', ')}`] });
    }

    const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rows.length > 0)
      return res.status(400).json({ error: 'Username already exists' });

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, password, name, role) VALUES ($1, $2, $3, $4)',
      [username.trim(), hash, (name || username).trim(), role]
    );
    const user = result.rows[0] ||
      (await pool.query(
        'SELECT id, username, name, role, created_at FROM users WHERE username = $1',
        [username.trim()]
      )).rows[0];

    logger.info('User created', { actorId: req.user?.id, newUsername: username });
    res.status(201).json({
      id: user.id, username: user.username, name: user.name,
      role: user.role, created_at: user.created_at,
    });
  } catch (err) {
    logger.error('Users POST error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/password', validateUserPassword, async (req, res) => {
  try {
    const { password } = req.body;
    const check = await pool.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'User not found' });

    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.params.id]);

    logger.info('Password changed', { actorId: req.user?.id, targetUserId: req.params.id });
    res.json({ message: 'Password updated' });
  } catch (err) {
    logger.error('Users PUT password error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    // BUG-007: Prevent self-deletion
    if (String(req.user?.id) === String(req.params.id)) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const count = await pool.query('SELECT COUNT(*) as c FROM users');
    const total = parseInt(count.rows[0].c || count.rows[0].count);
    if (total <= 1) return res.status(400).json({ error: 'Cannot delete the last user' });

    const check = await pool.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'User not found' });

    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    logger.info('User deleted', { actorId: req.user?.id, deletedUserId: req.params.id });
    res.json({ message: 'User deleted' });
  } catch (err) {
    logger.error('Users DELETE error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
