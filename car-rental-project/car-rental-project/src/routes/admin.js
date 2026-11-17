const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/stats', (_req, res) => {
  const one = (sql) => db.prepare(sql).get();
  res.json({
    cars: one('SELECT COUNT(*) c FROM cars').c,
    customers: one("SELECT COUNT(*) c FROM users WHERE role='customer'").c,
    owners: one('SELECT COUNT(*) c FROM owners').c,
    activeBookings: one("SELECT COUNT(*) c FROM bookings WHERE status='active'").c,
    revenue: one("SELECT COALESCE(SUM(bill),0) s FROM bookings WHERE status='returned'").s,
    pendingRevenue: one("SELECT COALESCE(SUM(bill),0) s FROM bookings WHERE status='active'").s,
  });
});

// ---- Customers (read-only list with their total billing) ----
router.get('/customers', (_req, res) => {
  res.json(db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.created_at,
      COUNT(b.id) AS bookings,
      COALESCE(SUM(CASE WHEN b.status != 'cancelled' THEN b.bill END), 0) AS bill
    FROM users u LEFT JOIN bookings b ON b.user_id = u.id
    WHERE u.role = 'customer' GROUP BY u.id ORDER BY u.created_at DESC`).all());
});

// ---- Car owners (CRUD) ----
router.get('/owners', (_req, res) => {
  res.json(db.prepare(`
    SELECT o.*, (SELECT COUNT(*) FROM cars c WHERE c.owner_id = o.id) AS cars
    FROM owners o ORDER BY o.name`).all());
});

function readOwner(b = {}) {
  if (!String(b.name || '').trim()) return { error: 'Owner name is required.' };
  return { owner: { name: String(b.name).trim(), cnic: b.cnic || null, contact_no: b.contact_no || null } };
}

router.post('/owners', (req, res) => {
  const { error, owner } = readOwner(req.body);
  if (error) return res.status(400).json({ error });
  const info = db.prepare('INSERT INTO owners (name,cnic,contact_no) VALUES (@name,@cnic,@contact_no)').run(owner);
  res.status(201).json(db.prepare('SELECT * FROM owners WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/owners/:id', (req, res) => {
  const { error, owner } = readOwner(req.body);
  if (error) return res.status(400).json({ error });
  const info = db.prepare('UPDATE owners SET name=@name, cnic=@cnic, contact_no=@contact_no WHERE id=@id')
    .run({ ...owner, id: Number(req.params.id) });
  if (!info.changes) return res.status(404).json({ error: 'Owner not found.' });
  res.json(db.prepare('SELECT * FROM owners WHERE id = ?').get(req.params.id));
});

router.delete('/owners/:id', (req, res) => {
  const info = db.prepare('DELETE FROM owners WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Owner not found.' });
  res.json({ ok: true });
});

// Owner payout: reset balance to zero after paying out
router.post('/owners/:id/payout', (req, res) => {
  const info = db.prepare('UPDATE owners SET balance = 0 WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Owner not found.' });
  res.json({ ok: true });
});

module.exports = router;
