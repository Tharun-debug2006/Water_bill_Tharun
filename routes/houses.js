const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function computeBill(house) {
  const consumed = Math.max(0, house.current_reading - house.previous_reading);
  const billable = Math.max(0, consumed - house.free_limit_l);
  const total = billable * house.rate_per_litre;
  return { consumed, billable, total };
}

router.get('/:id', requireAuth, (req, res) => {
  const house = db.prepare('SELECT * FROM houses WHERE id = ?').get(req.params.id);
  if (!house) return res.status(404).json({ error: 'House not found' });
  res.json({ ...house, bill: computeBill(house) });
});

router.post('/', requireAuth, (req, res) => {
  const { building_id, house_number, resident_name, phone_number, free_limit_l, rate_per_litre } = req.body || {};
  if (!building_id || !house_number) {
    return res.status(400).json({ error: 'building_id and house_number are required' });
  }
  try {
    const info = db
      .prepare(
        `INSERT INTO houses (building_id, house_number, resident_name, phone_number, free_limit_l, rate_per_litre)
         VALUES (?, ?, ?, ?, COALESCE(?, 5000), COALESCE(?, 0.20))`
      )
      .run(building_id, house_number, resident_name || null, phone_number || null, free_limit_l, rate_per_litre);
    res.status(201).json(db.prepare('SELECT * FROM houses WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'That house number already exists in this building' });
    }
    throw err;
  }
});

// This is the endpoint two admins are most likely to hit at once (both
// opening House #204's billing form). We use better-sqlite3's transaction
// wrapper plus the `version` optimistic-lock column so the second save
// either succeeds cleanly or is told to reload, never silently clobbers
// the first admin's numbers.
router.put('/:id', requireAuth, (req, res) => {
  const {
    previous_reading,
    current_reading,
    free_limit_l,
    rate_per_litre,
    resident_name,
    phone_number,
    notes,
    status,
    version,
  } = req.body || {};
  if (version === undefined) return res.status(400).json({ error: 'version is required' });

  const applyUpdate = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE houses
         SET previous_reading = COALESCE(?, previous_reading),
             current_reading  = COALESCE(?, current_reading),
             free_limit_l     = COALESCE(?, free_limit_l),
             rate_per_litre   = COALESCE(?, rate_per_litre),
             resident_name    = COALESCE(?, resident_name),
             phone_number     = COALESCE(?, phone_number),
             notes            = COALESCE(?, notes),
             status           = COALESCE(?, status),
             version          = version + 1,
             updated_by       = ?,
             updated_at       = datetime('now')
         WHERE id = ? AND version = ?`
      )
      .run(
        previous_reading,
        current_reading,
        free_limit_l,
        rate_per_litre,
        resident_name,
        phone_number,
        notes,
        status,
        req.admin.id,
        req.params.id,
        version
      );
    return result.changes;
  });

  const changes = applyUpdate();

  if (changes === 0) {
    const current = db.prepare('SELECT * FROM houses WHERE id = ?').get(req.params.id);
    if (!current) return res.status(404).json({ error: 'House not found' });
    return res.status(409).json({
      error: 'This house was updated by another admin in the meantime. Reload to see their changes before saving.',
      current: { ...current, bill: computeBill(current) },
    });
  }

  const updated = db.prepare('SELECT * FROM houses WHERE id = ?').get(req.params.id);
  db.prepare('INSERT INTO activity_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').run(
    req.admin.id,
    'update',
    'house',
    req.params.id
  );
  res.json({ ...updated, bill: computeBill(updated) });
});

// Deleting a house is destructive (it cascades to its payment history via
// ON DELETE CASCADE), so we block it whenever money is still owed rather
// than silently wiping out the record of an unpaid bill.
router.delete('/:id', requireAuth, (req, res) => {
  const house = db.prepare('SELECT * FROM houses WHERE id = ?').get(req.params.id);
  if (!house) return res.status(404).json({ error: 'House not found' });

  const pendingPayment = db
    .prepare("SELECT COUNT(*) AS n FROM payments WHERE house_id = ? AND status = 'Pending'")
    .get(req.params.id);

  if (house.status === 'Pending' || pendingPayment.n > 0) {
    return res.status(409).json({ error: 'Cannot delete this house because pending bills exist.' });
  }

  try {
    const deleteHouse = db.transaction(() => {
      db.prepare('DELETE FROM payments WHERE house_id = ?').run(req.params.id);
      const result = db.prepare('DELETE FROM houses WHERE id = ?').run(req.params.id);
      db.prepare('INSERT INTO activity_log (admin_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)').run(
        req.admin.id,
        'delete',
        'house',
        req.params.id,
        `House ${house.house_number} deleted`
      );
      return result.changes;
    });
    const changes = deleteHouse();
    if (changes === 0) return res.status(404).json({ error: 'House not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete house. Please try again.' });
  }
});

module.exports = router;
