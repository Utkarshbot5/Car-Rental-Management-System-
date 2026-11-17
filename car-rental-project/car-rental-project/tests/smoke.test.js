// End-to-end API smoke test. Run with: npm test
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

let server, base;
test.before(async () => {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();

test('full rental flow', async () => {
  // health + public car list
  assert.equal((await api('/api/health')).data.status, 'ok');
  const cars = await api('/api/cars');
  assert.ok(cars.data.length >= 8);

  // auth
  const admin = (await api('/api/auth/login', { method: 'POST', body: { identifier: 'admin', password: 'admin123' } })).data;
  assert.equal(admin.user.role, 'admin');
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { identifier: 'admin', password: 'bad' } })).status, 401);

  const reg = await api('/api/auth/register', { method: 'POST', body: { name: 'Test User', email: 'test@x.com', password: 'secret1' } });
  assert.equal(reg.status, 201);
  const dup = await api('/api/auth/register', { method: 'POST', body: { name: 'T', email: 'test@x.com', password: 'secret1' } });
  assert.equal(dup.status, 409);
  const token = reg.data.token;

  // permissions
  assert.equal((await api('/api/admin/stats', { token })).status, 403);
  assert.equal((await api('/api/bookings')).status, 401);

  // booking + bill (2.5h -> 3 billable hours)
  const car = cars.data[0];
  const from = inHours(1), to = new Date(Date.now() + 3.5 * 3600000).toISOString();
  const quote = await api(`/api/bookings/quote?car_id=${car.id}&from=${from}&to=${to}`);
  assert.equal(quote.data.hours, 3);
  const b = await api('/api/bookings', { method: 'POST', token, body: { car_id: car.id, rent_time: from, return_time: to } });
  assert.equal(b.status, 201);
  assert.equal(b.data.bill, 3 * car.rent_per_hour);

  // double booking is rejected; past/invalid times rejected
  const clash = await api('/api/bookings', { method: 'POST', token, body: { car_id: car.id, rent_time: inHours(2), return_time: inHours(4) } });
  assert.equal(clash.status, 409);
  assert.equal((await api('/api/bookings', { method: 'POST', token, body: { car_id: car.id, rent_time: inHours(-5), return_time: inHours(-3) } })).status, 400);
  assert.equal((await api('/api/bookings', { method: 'POST', token, body: { car_id: car.id, rent_time: inHours(5), return_time: inHours(4) } })).status, 400);

  // availability filter hides the booked car
  const avail = await api(`/api/cars?from=${encodeURIComponent(inHours(2))}&to=${encodeURIComponent(inHours(3))}`);
  assert.ok(!avail.data.some((c) => c.id === car.id));

  // customer sees only own bookings, admin sees all
  assert.equal((await api('/api/bookings', { token })).data.length, 1);

  // cancel frees the slot
  assert.equal((await api(`/api/bookings/${b.data.id}/cancel`, { method: 'POST', token })).status, 200);
  const again = await api('/api/bookings', { method: 'POST', token, body: { car_id: car.id, rent_time: from, return_time: to } });
  assert.equal(again.status, 201);

  // admin returns the car -> owner is credited 80%
  const ownerBefore = (await api('/api/admin/owners', { token: admin.token })).data.find((o) => o.id === car.owner_id).balance;
  const ret = await api(`/api/bookings/${again.data.id}/return`, { method: 'POST', token: admin.token });
  assert.equal(ret.status, 200);
  const ownerAfter = (await api('/api/admin/owners', { token: admin.token })).data.find((o) => o.id === car.owner_id).balance;
  assert.equal(ownerAfter - ownerBefore, ret.data.bill * 0.8);

  // admin car CRUD
  const created = await api('/api/cars', { method: 'POST', token: admin.token, body: { name: 'Test', make: 'M', model: '2024', reg_no: 'zz-00-zz-0001', rent_per_hour: 100 } });
  assert.equal(created.status, 201);
  assert.equal((await api(`/api/cars/${created.data.id}`, { method: 'PUT', token: admin.token, body: { ...created.data, rent_per_hour: 120 } })).data.rent_per_hour, 120);
  assert.equal((await api(`/api/cars/${created.data.id}`, { method: 'DELETE', token: admin.token })).status, 200);

  const stats = (await api('/api/admin/stats', { token: admin.token })).data;
  assert.ok(stats.revenue > 0);
});
