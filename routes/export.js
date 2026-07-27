const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const { buildBuildingExport, buildHouseExport, toCSV, toXLSX, toPDF } = require('../lib/exporters');

const router = express.Router();

const VALID_FORMATS = new Set(['pdf', 'xlsx', 'csv']);

function slug(str) {
  return String(str || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function sendExport(res, data, format, filenameBase, title) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
    return res.send(toCSV(data));
  }
  if (format === 'xlsx') {
    const buffer = await toXLSX(data, title);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
    return res.send(buffer);
  }
  const buffer = await toPDF(data, title);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);
  return res.send(buffer);
}

// GET /api/export/building/:id?format=pdf|xlsx|csv  -> whole building + every house
router.get('/building/:id', requireAuth, async (req, res) => {
  const format = String(req.query.format || 'pdf').toLowerCase();
  if (!VALID_FORMATS.has(format)) {
    return res.status(400).json({ error: 'format must be one of pdf, xlsx, csv' });
  }

  try {
    const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id);
    if (!building) return res.status(404).json({ error: 'Building not found' });

    const houses = db
      .prepare('SELECT * FROM houses WHERE building_id = ? ORDER BY house_number')
      .all(req.params.id);

    if (houses.length === 0) {
      return res.status(400).json({ error: 'This building has no houses to export yet.' });
    }

    const data = buildBuildingExport(building, houses);
    await sendExport(res, data, format, `${slug(building.name)}-export`, `${building.name} — Building Export`);
  } catch (err) {
    console.error('Building export failed:', err);
    res.status(500).json({ error: 'Export failed. Please try again.' });
  }
});

// GET /api/export/house/:id?format=pdf|xlsx|csv  -> a single house
router.get('/house/:id', requireAuth, async (req, res) => {
  const format = String(req.query.format || 'pdf').toLowerCase();
  if (!VALID_FORMATS.has(format)) {
    return res.status(400).json({ error: 'format must be one of pdf, xlsx, csv' });
  }

  try {
    const house = db.prepare('SELECT * FROM houses WHERE id = ?').get(req.params.id);
    if (!house) return res.status(404).json({ error: 'House not found' });

    const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(house.building_id);
    if (!building) return res.status(404).json({ error: 'Building not found' });

    const data = buildHouseExport(building, house);
    await sendExport(
      res,
      data,
      format,
      `house-${slug(house.house_number)}-export`,
      `${building.name} — House ${house.house_number}`
    );
  } catch (err) {
    console.error('House export failed:', err);
    res.status(500).json({ error: 'Export failed. Please try again.' });
  }
});

module.exports = router;
