const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const bills = db
    .prepare(
      `SELECT p.*, h.house_number, h.building_id, b.name AS building
       FROM payments p
       JOIN houses h ON h.id = p.house_id
       JOIN buildings b ON b.id = h.building_id
       ORDER BY p.created_at DESC`
    )
    .all();
  res.json(bills);
});

router.get('/:id', requireAuth, (req, res) => {
  const bill = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  res.json(bill);
});

router.post('/', requireAuth, (req, res) => {
  const { house_id, amount, status } = req.body || {};
  if (!house_id || amount === undefined) return res.status(400).json({ error: 'house_id and amount are required' });
  const info = db
    .prepare('INSERT INTO payments (house_id, amount, status, paid_at) VALUES (?, ?, ?, ?)')
    .run(house_id, amount, status || 'Pending', status === 'Paid' ? new Date().toISOString() : null);
  res.status(201).json(db.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireAuth, (req, res) => {
  const { amount, status } = req.body || {};
  const result = db
    .prepare(
      `UPDATE payments
       SET amount = COALESCE(?, amount),
           status = COALESCE(?, status),
           paid_at = CASE WHEN ? = 'Paid' THEN COALESCE(paid_at, datetime('now')) WHEN ? = 'Pending' THEN NULL ELSE paid_at END
       WHERE id = ?`
    )
    .run(amount, status, status, status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Bill not found' });
  res.json(db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Bill not found' });
  res.status(204).end();
});

module.exports = router;
