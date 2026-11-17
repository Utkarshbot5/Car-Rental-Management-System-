const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();

const OWNER_SHARE = 0.8; // owner receives 80% of the bill when the car is returned
const MAX_HOURS = 24 * 30;

const SELECT = `
  SELECT b.*, c.name AS car_name, c.make, c.reg_no, c.rent_per_hour, c.type AS car_type,
         u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
         o.name AS owner_name
  FROM bookings b
  JOIN cars c ON c.id = b.car_id
  JOIN users u ON u.id = b.user_id
  LEFT JOIN owners o ON o.id = c.owner_id`;

// Bill = whole hours (rounded up, minimum 1) x rent per hour
function computeBill(startISO, endISO, rate) {
  const hours = Math.max(1, Math.ceil((new Date(endISO) - new Date(startISO)) / 3600000));
  return { hours, bill: hours * rate };
}

// Live quote (used by the booking form)
router.get('/quote', (req, res) => {
  const car = db.prepare('SELECT rent_per_hour FROM cars WHERE id = ?').get(Number(req.query.car_id));
  const s = new Date(req.query.from), e = new Date(req.query.to);
  if (!car || isNaN(s) || isNaN(e) || e <= s) return res.status(400).json({ error: 'Invalid quote request.' });
  res.json(computeBill(s.toISOString(), e.toISOString(), car.rent_per_hour));
});

router.post('/', requireAuth, (req, res) => {
  const { car_id, rent_time, return_time } = req.body || {};
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(Number(car_id));
  if (!car) return res.status(404).json({ error: 'Car not found.' });
  if (car.status !== 'available') return res.status(409).json({ error: 'This car is currently under maintenance.' });

  const start = new Date(rent_time), end = new Date(return_time);
  if (isNaN(start) || isNaN(end)) return res.status(400).json({ error: 'Please choose valid pick-up and return times.' });
  if (start.getTime() < Date.now() - 5 * 60000) return res.status(400).json({ error: 'Pick-up time cannot be in the past.' });
  if (end <= start) return res.status(400).json({ error: 'Return time must be after pick-up time.' });
  if ((end - start) / 3600000 > MAX_HOURS) return res.status(400).json({ error: 'Maximum rental period is 30 days.' });

  const s = start.toISOString(), e = end.toISOString();

  // Check + insert in one transaction so two users can't double-book the same slot
  const create = db.transaction(() => {
    const clash = db.prepare(`SELECT 1 FROM bookings WHERE car_id = ? AND status = 'active'
      AND rent_time < ? AND return_time > ?`).get(car.id, e, s);
    if (clash) return null;
    const { hours, bill } = computeBill(s, e, car.rent_per_hour);
    return db.prepare('INSERT INTO bookings (user_id,car_id,rent_time,return_time,hours,bill) VALUES (?,?,?,?,?,?)')
      .run(req.user.id, car.id, s, e, hours, bill).lastInsertRowid;
  });
  const id = create();
  if (!id) return res.status(409).json({ error: 'Sorry, this car is already booked for the selected time.' });
  res.status(201).json(db.prepare(`${SELECT} WHERE b.id = ?`).get(id));
});

// Customers see their own bookings; admins see all
router.get('/', requireAuth, (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare(`${SELECT} ORDER BY b.created_at DESC, b.id DESC`).all()
    : db.prepare(`${SELECT} WHERE b.user_id = ? ORDER BY b.created_at DESC, b.id DESC`).all(req.user.id);
  res.json(rows);
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(req.params.id));
  if (!b) return res.status(404).json({ error: 'Booking not found.' });
  if (req.user.role !== 'admin' && b.user_id !== req.user.id) return res.status(403).json({ error: 'Not your booking.' });
  if (b.status !== 'active') return res.status(409).json({ error: `Booking is already ${b.status}.` });
  if (req.user.role !== 'admin' && new Date(b.rent_time) <= new Date()) {
    return res.status(409).json({ error: 'Rental has already started and cannot be cancelled.' });
  }
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(b.id);
  res.json({ ok: true });
});

// Admin: mark the car as returned -> finalises the bill and credits the owner
router.post('/:id/return', requireAuth, requireAdmin, (req, res) => {
  const b = db.prepare('SELECT b.*, c.owner_id, c.rent_per_hour FROM bookings b JOIN cars c ON c.id = b.car_id WHERE b.id = ?')
    .get(Number(req.params.id));
  if (!b) return res.status(404).json({ error: 'Booking not found.' });
  if (b.status !== 'active') return res.status(409).json({ error: `Booking is already ${b.status}.` });

  const tx = db.transaction(() => {
    // If the customer kept the car longer than planned, bill the extra hours
    const actualEnd = new Date() > new Date(b.return_time) ? new Date().toISOString() : b.return_time;
    const { hours, bill } = computeBill(b.rent_time, actualEnd, b.rent_per_hour);
    db.prepare("UPDATE bookings SET status='returned', return_time=?, hours=?, bill=? WHERE id=?")
      .run(actualEnd, hours, bill, b.id);
    if (b.owner_id) db.prepare('UPDATE owners SET balance = balance + ? WHERE id = ?').run(bill * OWNER_SHARE, b.owner_id);
    return { hours, bill };
  });
  res.json({ ok: true, ...tx() });
});

module.exports = router;
