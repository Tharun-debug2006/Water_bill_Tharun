require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const buildingRoutes = require('./routes/buildings');
const houseRoutes = require('./routes/houses');
const billRoutes = require('./routes/bills');
const settingsRoutes = require('./routes/settings');
const summaryRoutes = require('./routes/summary');
const exportRoutes = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 4000;

if (process.env.AUTO_SEED !== 'false') {
  require('./scripts/seed');
}

// Allow the frontend's origin(s) to call this API. Update ALLOWED_ORIGINS in
// .env for your real domain(s) when you deploy.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500').split(',');
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/', (req, res) => res.redirect('/dashboard.html'));

app.use('/api/auth', authRoutes);
app.use('/api/buildings', buildingRoutes);
app.use('/api/houses', houseRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/export', exportRoutes);

// Central error handler so a thrown error in any route (e.g. inside a
// transaction) returns JSON instead of crashing the process on one bad request.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Water Bill API listening on http://localhost:${PORT}`);
});
