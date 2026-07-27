const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total_houses,
         SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) AS paid_bills,
         SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending_bills,
         COALESCE(SUM(current_reading - previous_reading), 0) AS total_consumption_l
       FROM houses`
    )
    .get();

  // Bill totals are computed per-house (billable litres * rate), the same
  // formula as the House Details screen, so "Collected" / "Outstanding" stay
  // in sync with whatever a house's own billing form shows.
  const collection = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'Paid'
           THEN MAX(current_reading - previous_reading - free_limit_l, 0) * rate_per_litre ELSE 0 END), 0) AS collected,
         COALESCE(SUM(CASE WHEN status = 'Pending'
           THEN MAX(current_reading - previous_reading - free_limit_l, 0) * rate_per_litre ELSE 0 END), 0) AS outstanding
       FROM houses`
    )
    .get();

  const recentActivity = db
    .prepare(
      `SELECT h.id, h.house_number, b.name AS building, h.status, h.updated_at,
              MAX(h.current_reading - h.previous_reading - h.free_limit_l, 0) * h.rate_per_litre AS amount
       FROM houses h
       JOIN buildings b ON b.id = h.building_id
       ORDER BY h.updated_at DESC
       LIMIT 10`
    )
    .all();

  res.json({ ...totals, ...collection, recent_activity: recentActivity });
});

module.exports = router;
