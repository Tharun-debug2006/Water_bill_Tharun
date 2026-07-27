const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db/db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Slow down credential-stuffing / brute force attempts on login.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

// Anyone can self-register as an admin here; lock this down (e.g. require an
// existing super_admin to invite) before going to production.
router.post('/register', (req, res) => {
  const { full_name, email, password, role } = req.body || {};
  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'full_name, email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const password_hash = bcrypt.hashSync(password, 12);
  const info = db
    .prepare('INSERT INTO admins (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(full_name, email, password_hash, role === 'super_admin' ? 'super_admin' : 'admin');

  const admin = { id: info.lastInsertRowid, email, full_name, role: role === 'super_admin' ? 'super_admin' : 'admin' };
  const token = jwt.sign(admin, JWT_SECRET, { expiresIn: '12h' });
  res.status(201).json({ token, admin });
});

router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const row = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const admin = { id: row.id, email: row.email, full_name: row.full_name, role: row.role };
  const token = jwt.sign(admin, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, admin });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ admin: req.admin });
});

module.exports = router;
