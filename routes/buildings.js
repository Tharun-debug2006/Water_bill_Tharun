const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const buildings = db
    .prepare(
      `SELECT b.*,
              COUNT(h.id) AS unit_count,
              COALESCE(SUM(h.current_reading - h.previous_reading), 0) AS total_usage_l
       FROM buildings b
       LEFT JOIN houses h ON h.building_id = b.id
       GROUP BY b.id
       ORDER BY b.name`
    )
    .all();
  res.json(buildings);
});

router.get('/:id', requireAuth, (req, res) => {
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id);
  if (!building) return res.status(404).json({ error: 'Building not found' });

  const houses = db
    .prepare('SELECT * FROM houses WHERE building_id = ? ORDER BY house_number')
    .all(req.params.id);

  res.json({ ...building, houses });
});

router.post('/', requireAuth, (req, res) => {
  const { name, location, image_url, status } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const info = db
    .prepare('INSERT INTO buildings (name, location, image_url, status) VALUES (?, ?, ?, ?)')
    .run(name, location || null, image_url || null, status || 'Active');

  db.prepare('INSERT INTO activity_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').run(
    req.admin.id,
    'create',
    'building',
    info.lastInsertRowid
  );

  res.status(201).json(db.prepare('SELECT * FROM buildings WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireAuth, (req, res) => {
  const { name, location, image_url, status, version } = req.body || {};
  if (version === undefined) return res.status(400).json({ error: 'version is required' });

  const result = db
    .prepare(
      `UPDATE buildings
       SET name = COALESCE(?, name),
           location = COALESCE(?, location),
           image_url = COALESCE(?, image_url),
           status = COALESCE(?, status),
           version = version + 1,
           updated_at = datetime('now')
       WHERE id = ? AND version = ?`
    )
    .run(name, location, image_url, status, req.params.id, version);

  if (result.changes === 0) {
    const current = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id);
    if (!current) return res.status(404).json({ error: 'Building not found' });
    return res.status(409).json({ error: 'Building was updated by someone else. Reload and try again.', current });
  }

  res.json(db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM buildings WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Building not found' });
  res.status(204).end();
});

module.exports = router;
