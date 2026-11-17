const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();

const BASE = `
  SELECT c.*, o.name AS owner_name,
    EXISTS (SELECT 1 FROM bookings b WHERE b.car_id = c.id AND b.status = 'active'
            AND b.rent_time <= :now AND b.return_time > :now) AS rented_now
  FROM cars c LEFT JOIN owners o ON o.id = c.owner_id`;

// Public: list / search cars. Optional ?from=ISO&to=ISO hides cars booked in that window.
router.get('/', (req, res) => {
  const { q, type, seats, maxPrice, from, to } = req.query;
  const where = [];
  const params = { now: new Date().toISOString() };

  if (q) { where.push('(c.name LIKE :q OR c.make LIKE :q OR c.model LIKE :q)'); params.q = `%${q}%`; }
  if (type) { where.push('c.type = :type'); params.type = type; }
  if (seats) { where.push('c.seating_capacity >= :seats'); params.seats = Number(seats); }
  if (maxPrice) { where.push('c.rent_per_hour <= :maxPrice'); params.maxPrice = Number(maxPrice); }
  if (from && to) {
    where.push(`c.status = 'available' AND NOT EXISTS (
      SELECT 1 FROM bookings b WHERE b.car_id = c.id AND b.status = 'active'
      AND b.rent_time < :to AND b.return_time > :from)`);
    params.from = new Date(from).toISOString();
    params.to = new Date(to).toISOString();
  }
  const sql = `${BASE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.rent_per_hour`;
  res.json(db.prepare(sql).all(params));
});

router.get('/types', (_req, res) => {
  res.json(db.prepare('SELECT DISTINCT type FROM cars ORDER BY type').all().map((r) => r.type));
});

router.get('/:id', (req, res) => {
  const car = db.prepare(`${BASE} WHERE c.id = :id`).get({ id: Number(req.params.id), now: new Date().toISOString() });
  if (!car) return res.status(404).json({ error: 'Car not found.' });
  car.upcoming = db
    .prepare(`SELECT rent_time, return_time FROM bookings WHERE car_id = ? AND status = 'active' AND return_time > ? ORDER BY rent_time`)
    .all(car.id, new Date().toISOString());
  res.json(car);
});

function readCar(body) {
  const b = body || {};
  const errors = [];
  for (const f of ['name', 'make', 'model', 'reg_no']) if (!String(b[f] || '').trim()) errors.push(`${f} is required`);
  const rate = Number(b.rent_per_hour);
  if (!(rate > 0)) errors.push('rent_per_hour must be greater than 0');
  const seats = Number(b.seating_capacity || 4);
  if (!(seats >= 1 && seats <= 20)) errors.push('seating_capacity must be between 1 and 20');
  return {
    errors,
    car: {
      name: String(b.name || '').trim(),
      make: String(b.make || '').trim(),
      model: String(b.model || '').trim(),
      reg_no: String(b.reg_no || '').trim().toUpperCase(),
      colour: b.colour || null,
      condition: b.condition || 'Good',
      type: b.type || 'Sedan',
      seating_capacity: seats,
      rent_per_hour: rate,
      status: b.status === 'maintenance' ? 'maintenance' : 'available',
      owner_id: b.owner_id ? Number(b.owner_id) : null,
    },
  };
}

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { errors, car } = readCar(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  try {
    const info = db.prepare(`INSERT INTO cars (name,make,model,reg_no,colour,condition,type,seating_capacity,rent_per_hour,status,owner_id)
      VALUES (@name,@make,@model,@reg_no,@colour,@condition,@type,@seating_capacity,@rent_per_hour,@status,@owner_id)`).run(car);
    res.status(201).json(db.prepare('SELECT * FROM cars WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'A car with this registration number already exists.' });
    throw e;
  }
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { errors, car } = readCar(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  try {
    const info = db.prepare(`UPDATE cars SET name=@name, make=@make, model=@model, reg_no=@reg_no, colour=@colour,
      condition=@condition, type=@type, seating_capacity=@seating_capacity, rent_per_hour=@rent_per_hour,
      status=@status, owner_id=@owner_id WHERE id=@id`).run({ ...car, id: Number(req.params.id) });
    if (!info.changes) return res.status(404).json({ error: 'Car not found.' });
    res.json(db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'A car with this registration number already exists.' });
    throw e;
  }
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const active = db.prepare("SELECT COUNT(*) c FROM bookings WHERE car_id = ? AND status = 'active'").get(id).c;
  if (active) return res.status(409).json({ error: 'This car has active bookings and cannot be deleted.' });
  const info = db.prepare('DELETE FROM cars WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'Car not found.' });
  res.json({ ok: true });
});

module.exports = router;
