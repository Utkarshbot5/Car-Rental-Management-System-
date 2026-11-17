const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'rental.db');
if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin','customer')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS owners (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  cnic       TEXT,
  contact_no TEXT,
  balance    REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cars (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  make             TEXT NOT NULL,
  model            TEXT NOT NULL,
  reg_no           TEXT NOT NULL UNIQUE,
  colour           TEXT,
  condition        TEXT NOT NULL DEFAULT 'Good',
  type             TEXT NOT NULL DEFAULT 'Sedan',
  seating_capacity INTEGER NOT NULL DEFAULT 4,
  rent_per_hour    REAL NOT NULL,
  status           TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','maintenance')),
  owner_id         INTEGER REFERENCES owners(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  car_id      INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  rent_time   TEXT NOT NULL,
  return_time TEXT NOT NULL,
  hours       INTEGER NOT NULL,
  bill        REAL NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','returned','cancelled')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_car ON bookings(car_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
`);

function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return;

  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const insUser = db.prepare(
    'INSERT INTO users (username,name,email,phone,password_hash,role) VALUES (?,?,?,?,?,?)'
  );
  insUser.run('admin', 'Administrator', 'admin@carrental.com', '0000000000', bcrypt.hashSync(adminPass, 10), 'admin');
  insUser.run('demo', 'Demo Customer', 'demo@carrental.com', '9876543210', bcrypt.hashSync('demo123', 10), 'customer');

  const insOwner = db.prepare('INSERT INTO owners (name,cnic,contact_no,balance) VALUES (?,?,?,0)');
  const o1 = insOwner.run('Rahul Sharma', '1234-5678-9012', '9811111111').lastInsertRowid;
  const o2 = insOwner.run('Priya Verma', '2345-6789-0123', '9822222222').lastInsertRowid;
  const o3 = insOwner.run('Amit Singh', '3456-7890-1234', '9833333333').lastInsertRowid;

  const insCar = db.prepare(`INSERT INTO cars
    (name,make,model,reg_no,colour,condition,type,seating_capacity,rent_per_hour,owner_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const cars = [
    ['Swift',      'Maruti Suzuki', '2021', 'DL-01-AB-1234', 'White',  'Excellent', 'Hatchback',  5, 150, o1],
    ['Creta',      'Hyundai',       '2022', 'MH-02-CD-5678', 'Blue',   'Excellent', 'SUV',        5, 300, o1],
    ['City',       'Honda',         '2020', 'KA-03-EF-9012', 'Silver', 'Good',      'Sedan',      5, 250, o2],
    ['Innova',     'Toyota',        '2019', 'UP-14-GH-3456', 'Grey',   'Good',      'Family car', 7, 350, o2],
    ['Thar',       'Mahindra',      '2023', 'RJ-14-IJ-7890', 'Red',    'Excellent', 'SUV',        4, 400, o3],
    ['Mustang',    'Ford',          '2018', 'HR-26-KL-2468', 'Black',  'Excellent', 'Sports car', 4, 900, o3],
    ['Corvette',   'Chevrolet',     '2015', 'DL-08-MN-1357', 'Blue',   'Good',      'Sports car', 2, 1100, o3],
    ['Veyron',     'Bugatti',       '2018', 'MH-12-OP-9753', 'Black',  'Excellent', 'Supercar',   2, 2500, o1],
  ];
  const tx = db.transaction(() => cars.forEach((c) => insCar.run(...c)));
  tx();
}
seed();

module.exports = db;
