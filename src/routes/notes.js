const router = require('express').Router();
const pool = require('../config/database');
const logger = require('../utils/logger');
const { validateNote } = require('../middleware/validate');

const NOTE_QUERY = `
  SELECT n.*, c.name as client_name, c.phone as client_phone
  FROM notes n
  LEFT JOIN orders o ON n.order_id = o.id
  LEFT JOIN clients c ON o.client_id = c.id
`;

router.get('/reminders', async (req, res) => {
  try {
    const result = await pool.query(
      NOTE_QUERY + " WHERE n.reminder_date <= datetime('now') AND n.notified = 0 ORDER BY n.reminder_date ASC"
    );
    res.json(result.rows);
  } catch (err) {
    logger.error('Notes GET reminders error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { order_id } = req.query;
    const params = order_id ? [order_id] : [];
    const where  = order_id ? ' WHERE n.order_id = $1' : '';
    const result = await pool.query(NOTE_QUERY + where + ' ORDER BY n.created_at DESC', params);
    res.json(result.rows);
  } catch (err) {
    logger.error('Notes GET error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', validateNote, async (req, res) => {
  try {
    const { text, order_id, reminder_date } = req.body;
    if (order_id) {
      const check = await pool.query('SELECT id FROM orders WHERE id = $1', [order_id]);
      if (!check.rows[0]) return res.status(404).json({ error: 'Order not found' });
    }
    const result = await pool.query(
      'INSERT INTO notes (text, order_id, reminder_date) VALUES ($1, $2, $3)',
      [text, order_id || null, reminder_date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Notes POST error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', validateNote, async (req, res) => {
  try {
    const { text, order_id, reminder_date, notified } = req.body;
    const check = await pool.query('SELECT id FROM notes WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Note not found' });
    await pool.query(
      'UPDATE notes SET text=$1, order_id=$2, reminder_date=$3, notified=$4 WHERE id=$5',
      [text, order_id || null, reminder_date || null, notified ? 1 : 0, req.params.id]
    );
    const updated = await pool.query('SELECT * FROM notes WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    logger.error('Notes PUT error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/notified', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM notes WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Note not found' });
    await pool.query('UPDATE notes SET notified=1 WHERE id=$1', [req.params.id]);
    const updated = await pool.query('SELECT * FROM notes WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    logger.error('Notes PATCH notified error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM notes WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Note not found' });
    await pool.query('DELETE FROM notes WHERE id=$1', [req.params.id]);
    res.json({ message: 'Note deleted' });
  } catch (err) {
    logger.error('Notes DELETE error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
