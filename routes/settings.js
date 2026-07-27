const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM settings WHERE id = 1').get());
});

// Optimistic concurrency: the client must send back the `version` it last
// read. If another admin saved changes in the meantime, `version` will have
// moved on and this update matches zero rows -> we tell the client to
// refresh instead of silently overwriting their colleague's change.
router.put('/', requireAuth, (req, res) => {
  const { water_free_limit_l, rate_per_litre, billing_cycle, version } = req.body || {};
  if (version === undefined) return res.status(400).json({ error: 'version is required' });

  const result = db
    .prepare(
      `UPDATE settings
       SET water_free_limit_l = COALESCE(?, water_free_limit_l),
           rate_per_litre     = COALESCE(?, rate_per_litre),
           billing_cycle      = COALESCE(?, billing_cycle),
           version            = version + 1,
           updated_at         = datetime('now')
       WHERE id = 1 AND version = ?`
    )
    .run(water_free_limit_l, rate_per_litre, billing_cycle, version);

  if (result.changes === 0) {
    return res.status(409).json({
      error: 'Settings were updated by someone else. Reload and try again.',
      current: db.prepare('SELECT * FROM settings WHERE id = 1').get(),
    });
  }

  db.prepare('INSERT INTO activity_log (admin_id, action, entity, detail) VALUES (?, ?, ?, ?)').run(
    req.admin.id,
    'update',
    'settings',
    JSON.stringify(req.body)
  );

  res.json(db.prepare('SELECT * FROM settings WHERE id = 1').get());
});

module.exports = router;
