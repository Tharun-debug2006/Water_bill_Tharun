require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db/db');

const seedAdmins = db.transaction(() => {
  const admins = [
    { full_name: 'Alexander Draper', email: 'alex.d@waterbill.admin', password: 'ChangeMe123!', role: 'super_admin' },
    { full_name: 'Alex Rivero', email: 'alex.rivero@waterbill.admin', password: 'ChangeMe123!', role: 'admin' },
  ];
  const insert = db.prepare(
    'INSERT OR IGNORE INTO admins (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  );
  for (const a of admins) {
    insert.run(a.full_name, a.email, bcrypt.hashSync(a.password, 12), a.role);
  }
});

const seedBuildingsAndHouses = db.transaction(() => {
  const insertBuilding = db.prepare(
    'INSERT OR IGNORE INTO buildings (id, name, location, status) VALUES (?, ?, ?, ?)'
  );
  insertBuilding.run(1, 'Prabhakar Building', 'Sector 4, Greenville', 'Active');
  insertBuilding.run(2, 'Bhaskar Building', 'Downtown', 'Active');

  const houses = [
    ['101', 'John Doe', 'Paid'], ['102', 'Jane Smith', 'Pending'], ['103', 'Michael Chen', 'Paid'],
    ['201', 'Sarah Wilson', 'Paid'], ['202', 'Robert Brown', 'Pending'], ['203', 'Emma Davis', 'Paid'],
    ['301', 'Alice Johnson', 'Paid'], ['302', 'David Miller', 'Pending'], ['303', 'Chris Evans', 'Paid'],
    ['401', 'Sophia Taylor', 'Paid'], ['402', 'Liam Garcia', 'Paid'], ['403', 'Olivia Moore', 'Pending'],
  ];
  const insertHouse = db.prepare(
    `INSERT OR IGNORE INTO houses
       (building_id, house_number, resident_name, previous_reading, current_reading, free_limit_l, rate_per_litre, status)
     VALUES (?, ?, ?, 0, ?, 5000, 0.20, ?)`
  );
  for (const [num, name, status] of houses) {
    const usageL = 15000 + Math.round(Math.random() * 20000); // arbitrary demo reading
    insertHouse.run(1, num, name, usageL, status);
  }
  for (const [num, name, status] of [
    ['A-101', 'Nisha Patel', 'Paid'],
    ['A-102', 'Rahul Verma', 'Pending'],
    ['B-201', 'Priya Sharma', 'Paid'],
    ['B-202', 'Arjun Rao', 'Pending'],
  ]) {
    const usageL = 12000 + Math.round(Math.random() * 18000);
    insertHouse.run(2, num, name, usageL, status);
  }
});

seedAdmins();
seedBuildingsAndHouses();

console.log('Seed complete.');
console.log('Demo login -> email: alex.d@waterbill.admin  password: ChangeMe123!');
