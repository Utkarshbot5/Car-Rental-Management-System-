/* DriveEase Car Rental - single-page frontend (vanilla JS, hash routing) */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

// ---------------------------------------------------------------- state
const store = {
  get token() { try { return localStorage.getItem('token'); } catch { return null; } },
  get user() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  save(token, user) { try { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); } catch {} },
  clear() { try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch {} },
};

// ---------------------------------------------------------------- helpers
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDT = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (store.token) headers.Authorization = 'Bearer ' + store.token;
  const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && store.token) { store.clear(); renderNav(); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, kind = 'success') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast ' + kind;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function openModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="box">${html}</div>`;
  m.classList.remove('hidden');
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  const x = $('.x', m); if (x) x.onclick = closeModal;
  return m;
}
const closeModal = () => $('#modal').classList.add('hidden');
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

const COLOURS = { white: '#ececec', black: '#23262b', blue: '#2f6fe4', red: '#d6342c', silver: '#b4bac2', grey: '#6d7581', gray: '#6d7581', green: '#2e9d62', yellow: '#e8c230', orange: '#e87a2c' };
function carSvg(colour = 'grey', type = '') {
  const c = COLOURS[String(colour).toLowerCase()] || '#6d7581';
  const tall = /suv|family/i.test(type), low = /sport|super/i.test(type);
  const roof = tall ? 'M62 78 L88 40 L176 40 L214 78 Z' : low ? 'M70 78 L112 52 L168 52 L206 78 Z' : 'M64 78 L96 48 L170 48 L206 78 Z';
  return `<svg viewBox="0 0 280 120" role="img" aria-label="${esc(colour)} ${esc(type)}">
    <ellipse cx="140" cy="106" rx="112" ry="8" fill="#000" opacity=".35"/>
    <path d="M24 92 Q24 72 52 70 L${tall ? 62 : 64} 78 L214 78 L246 80 Q262 84 262 96 L262 100 L24 100 Z" fill="${c}"/>
    <path d="${roof}" fill="${c}"/>
    <path d="${roof}" fill="#bfe3ff" opacity=".55" transform="translate(0 2) scale(.9 .9) translate(14 6)"/>
    <circle cx="82" cy="100" r="16" fill="#111"/><circle cx="82" cy="100" r="7" fill="#8b929c"/>
    <circle cx="204" cy="100" r="16" fill="#111"/><circle cx="204" cy="100" r="7" fill="#8b929c"/>
    <rect x="246" y="84" width="12" height="6" rx="2" fill="#ffd36b"/>
  </svg>`;
}

// ---------------------------------------------------------------- nav
function renderNav() {
  const u = store.user;
  const hash = location.hash || '#/';
  const link = (href, label) => `<a href="${href}" class="${hash.startsWith(href) && href !== '#/' || hash === href ? 'active' : ''}">${label}</a>`;
  let html = link('#/', 'Home') + link('#/cars', 'Browse Cars');
  if (u?.role === 'admin') html += link('#/admin', 'Admin Panel');
  if (u) html += link('#/bookings', 'My Bookings') + `<button id="logout">Log out (${esc(u.name.split(' ')[0])})</button>`;
  else html += link('#/login', 'Log in') + `<a href="#/register" class="btn small">Sign up</a>`;
  $('#navlinks').innerHTML = html;
  $('#navlinks').classList.remove('open');
  const lo = $('#logout');
  if (lo) lo.onclick = () => { store.clear(); toast('Logged out'); location.hash = '#/'; renderNav(); };
}
$('#burger').onclick = () => $('#navlinks').classList.toggle('open');
$('#year').textContent = new Date().getFullYear();

// ---------------------------------------------------------------- router
const routes = [
  [/^#\/?$/, viewHome],
  [/^#\/cars$/, viewCars],
  [/^#\/login$/, () => viewAuth('login')],
  [/^#\/register$/, () => viewAuth('register')],
  [/^#\/bookings$/, viewMyBookings],
  [/^#\/admin(?:\/(\w+))?$/, viewAdmin],
];

async function router() {
  const hash = location.hash || '#/';
  renderNav();
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) {
      app.innerHTML = '<p class="muted">Loading…</p>';
      try { await fn(m[1]); } catch (e) { app.innerHTML = `<div class="empty">⚠️ ${esc(e.message)}</div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  app.innerHTML = '<div class="empty"><h2>Page not found</h2><a class="btn" href="#/">Go home</a></div>';
}
window.addEventListener('hashchange', router);

function needLogin() {
  if (store.user) return false;
  toast('Please log in to continue', 'error');
  location.hash = '#/login';
  return true;
}

// ---------------------------------------------------------------- views: public
async function viewHome() {
  const cars = await api('/cars');
  app.innerHTML = `
    <section class="hero">
      <h1>RENT A CAR.<br><span>BY THE HOUR.</span></h1>
      <p>Pick a car, choose your time, drive away. Transparent hourly pricing with no hidden charges.</p>
      <div class="cta"><a class="btn" href="#/cars">Browse cars</a>${store.user ? '' : '<a class="btn ghost" href="#/register">Create account</a>'}</div>
      <svg class="art" viewBox="0 0 280 120" aria-hidden="true">${carSvg('orange', 'sports').replace(/<svg[^>]*>|<\/svg>/g, '')}</svg>
    </section>
    <div class="stats">
      <div class="stat"><b>${cars.length}</b><span>Cars available</span></div>
      <div class="stat"><b>${money(Math.min(...cars.map((c) => c.rent_per_hour)))}</b><span>Starting per hour</span></div>
      <div class="stat"><b>24/7</b><span>Online booking</span></div>
    </div>
    <div class="section-title"><h2>Featured cars</h2><a class="muted" href="#/cars">View all →</a></div>
    <div class="grid">${cars.slice(0, 4).map(carCard).join('')}</div>`;
  bindCarButtons(cars);
}

function carCard(c) {
  const unavailable = c.status === 'maintenance';
  const badge = unavailable ? '<span class="badge off">Maintenance</span>' : c.rented_now ? '<span class="badge warn">Rented now</span>' : '<span class="badge ok">Available</span>';
  return `<article class="card">
    <div class="pic">${carSvg(c.colour, c.type)}</div>
    <div class="body">
      <div class="title"><h3>${esc(c.make)} ${esc(c.name)}</h3>${badge}</div>
      <div class="tags"><span class="tag">${esc(c.type)}</span><span class="tag">${c.seating_capacity} seats</span><span class="tag">${esc(c.model)}</span><span class="tag">${esc(c.condition)}</span></div>
      <div class="price">${money(c.rent_per_hour)} <small>/ hour</small></div>
      <button class="btn" data-book="${c.id}" ${unavailable ? 'disabled' : ''}>Book now</button>
    </div></article>`;
}

function bindCarButtons(cars) {
  app.querySelectorAll('[data-book]').forEach((b) => {
    b.onclick = () => { if (needLogin()) return; openBooking(cars.find((c) => c.id == b.dataset.book)); };
  });
}

async function viewCars() {
  const types = await api('/cars/types');
  app.innerHTML = `
    <h2>Browse cars</h2>
    <form class="filters" id="filters">
      <div class="field"><label for="f-q">Search</label><input id="f-q" placeholder="Name, make or model"></div>
      <div class="field"><label for="f-type">Type</label><select id="f-type"><option value="">All types</option>${types.map((t) => `<option>${esc(t)}</option>`).join('')}</select></div>
      <div class="field"><label for="f-seats">Min. seats</label><select id="f-seats"><option value="">Any</option><option>2</option><option>4</option><option>5</option><option>7</option></select></div>
      <div class="field"><label for="f-price">Max price / hr</label><input id="f-price" type="number" min="0" placeholder="e.g. 500"></div>
      <div class="field"><label for="f-from">Available from</label><input id="f-from" type="datetime-local"></div>
      <div class="field"><label for="f-to">Available until</label><input id="f-to" type="datetime-local"></div>
      <button class="btn ghost" type="reset" id="reset">Reset</button>
    </form>
    <div id="results"></div>`;

  let timer;
  async function load() {
    const p = new URLSearchParams();
    const add = (k, v) => v && p.set(k, v);
    add('q', $('#f-q').value.trim()); add('type', $('#f-type').value); add('seats', $('#f-seats').value); add('maxPrice', $('#f-price').value);
    if ($('#f-from').value && $('#f-to').value) { p.set('from', new Date($('#f-from').value).toISOString()); p.set('to', new Date($('#f-to').value).toISOString()); }
    try {
      const cars = await api('/cars?' + p);
      $('#results').innerHTML = cars.length ? `<div class="grid">${cars.map(carCard).join('')}</div>` : '<div class="empty">No cars match your filters.</div>';
      bindCarButtons(cars);
    } catch (e) { $('#results').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  const form = $('#filters');
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  form.addEventListener('reset', () => setTimeout(load, 0));
  form.addEventListener('submit', (e) => e.preventDefault());
  load();
}

function openBooking(car) {
  const start = new Date(Date.now() + 3600000); start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 3 * 3600000);
  const m = openModal(`
    <div class="head"><div><h3>Book ${esc(car.make)} ${esc(car.name)}</h3><span class="muted">${money(car.rent_per_hour)} per hour · ${car.seating_capacity} seats</span></div><button class="x" aria-label="Close">&times;</button></div>
    <form id="book-form">
      <div class="field"><label for="b-from">Pick-up</label><input id="b-from" type="datetime-local" required value="${toLocalInput(start)}" min="${toLocalInput(new Date())}"></div>
      <div class="field"><label for="b-to">Return</label><input id="b-to" type="datetime-local" required value="${toLocalInput(end)}"></div>
      <div class="quote"><span class="muted" id="q-hours">–</span><b id="q-bill">–</b></div>
      <p class="muted" id="b-note" style="font-size:.8rem;margin-top:-6px">Billed per hour, rounded up.</p>
      <button class="btn" style="width:100%" id="b-submit">Confirm booking</button>
    </form>`);

  async function quote() {
    const f = $('#b-from', m).value, t = $('#b-to', m).value;
    const btn = $('#b-submit', m);
    if (!f || !t || new Date(t) <= new Date(f)) { $('#q-hours', m).textContent = 'Return must be after pick-up'; $('#q-bill', m).textContent = '–'; btn.disabled = true; return; }
    try {
      const q = await api(`/bookings/quote?car_id=${car.id}&from=${encodeURIComponent(new Date(f).toISOString())}&to=${encodeURIComponent(new Date(t).toISOString())}`);
      $('#q-hours', m).textContent = `${q.hours} hour${q.hours > 1 ? 's' : ''}`; $('#q-bill', m).textContent = money(q.bill); btn.disabled = false;
    } catch { btn.disabled = true; }
  }
  m.querySelectorAll('input').forEach((i) => i.addEventListener('input', quote));
  quote();

  $('#book-form', m).onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#b-submit', m); btn.disabled = true;
    try {
      await api('/bookings', { method: 'POST', body: { car_id: car.id, rent_time: new Date($('#b-from', m).value).toISOString(), return_time: new Date($('#b-to', m).value).toISOString() } });
      closeModal(); toast('Booking confirmed! 🎉'); location.hash = '#/bookings';
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  };
}

// ---------------------------------------------------------------- views: auth
function viewAuth(mode) {
  if (store.user) { location.hash = '#/cars'; return; }
  const reg = mode === 'register';
  app.innerHTML = `
    <div class="panel auth">
      <h2>${reg ? 'Create account' : 'Welcome back'}</h2>
      <p class="muted">${reg ? 'Sign up to start booking cars.' : 'Log in to book and manage your rentals.'}</p>
      <form id="auth-form" novalidate>
        ${reg ? '<div class="field"><label for="a-name">Full name</label><input id="a-name" required autocomplete="name"></div>' : ''}
        <div class="field"><label for="a-id">${reg ? 'Email' : 'Username or email'}</label><input id="a-id" ${reg ? 'type="email"' : ''} required autocomplete="username"></div>
        ${reg ? '<div class="field"><label for="a-phone">Phone (optional)</label><input id="a-phone" type="tel" autocomplete="tel"></div>' : ''}
        <div class="field"><label for="a-pass">Password</label><input id="a-pass" type="password" required minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}"></div>
        <button class="btn" style="width:100%">${reg ? 'Sign up' : 'Log in'}</button>
      </form>
      <p class="muted" style="margin-top:16px">${reg ? 'Already registered? <a href="#/login" style="color:var(--accent)">Log in</a>' : 'New here? <a href="#/register" style="color:var(--accent)">Create an account</a>'}</p>
      ${reg ? '' : '<p class="muted" style="font-size:.8rem">Demo: <code>demo</code> / <code>demo123</code> &nbsp;·&nbsp; Admin: <code>admin</code> / <code>admin123</code></p>'}
    </div>`;
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button', e.target); btn.disabled = true;
    try {
      const body = reg
        ? { name: $('#a-name').value, email: $('#a-id').value, phone: $('#a-phone').value, password: $('#a-pass').value }
        : { identifier: $('#a-id').value, password: $('#a-pass').value };
      const { token, user } = await api(`/auth/${reg ? 'register' : 'login'}`, { method: 'POST', body });
      store.save(token, user);
      toast(`Welcome, ${user.name.split(' ')[0]}!`);
      location.hash = user.role === 'admin' ? '#/admin' : '#/cars';
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  };
}

// ---------------------------------------------------------------- views: customer bookings
const statusBadge = (b) => {
  if (b.status === 'cancelled') return '<span class="badge off">Cancelled</span>';
  if (b.status === 'returned') return '<span class="badge ok">Returned</span>';
  return new Date(b.rent_time) > new Date() ? '<span class="badge warn">Upcoming</span>' : '<span class="badge bad">In progress</span>';
};

async function viewMyBookings() {
  if (needLogin()) return;
  const rows = await api('/bookings');
  const total = rows.filter((b) => b.status !== 'cancelled').reduce((s, b) => s + b.bill, 0);
  app.innerHTML = `
    <div class="section-title" style="margin-top:0"><h2>My bookings</h2><span class="muted">Total billed: <b style="color:var(--accent)">${money(total)}</b></span></div>
    ${rows.length ? bookingsTable(rows, false) : '<div class="empty">No bookings yet. <a href="#/cars" style="color:var(--accent)">Browse cars →</a></div>'}`;
  bindBookingActions();
}

function bookingsTable(rows, admin) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>#</th><th>Car</th>${admin ? '<th>Customer</th>' : ''}<th>Pick-up</th><th>Return</th><th>Hours</th><th>Bill</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map((b) => `<tr>
      <td>${b.id}</td><td><b>${esc(b.make)} ${esc(b.car_name)}</b><br><span class="muted">${esc(b.reg_no)}</span></td>
      ${admin ? `<td>${esc(b.customer_name)}<br><span class="muted">${esc(b.customer_phone || b.customer_email)}</span></td>` : ''}
      <td>${fmtDT(b.rent_time)}</td><td>${fmtDT(b.return_time)}</td><td>${b.hours}</td><td><b>${money(b.bill)}</b></td><td>${statusBadge(b)}</td>
      <td class="actions">${b.status === 'active' ? `${admin ? `<button class="btn small" data-return="${b.id}">Mark returned</button>` : ''}<button class="btn small danger" data-cancel="${b.id}">Cancel</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function bindBookingActions() {
  app.querySelectorAll('[data-cancel]').forEach((btn) => btn.onclick = async () => {
    if (!confirm('Cancel this booking?')) return;
    try { await api(`/bookings/${btn.dataset.cancel}/cancel`, { method: 'POST' }); toast('Booking cancelled'); router(); } catch (e) { toast(e.message, 'error'); }
  });
  app.querySelectorAll('[data-return]').forEach((btn) => btn.onclick = async () => {
    if (!confirm('Mark this car as returned and finalise the bill?')) return;
    try { const r = await api(`/bookings/${btn.dataset.return}/return`, { method: 'POST' }); toast(`Returned. Final bill ${money(r.bill)}`); router(); } catch (e) { toast(e.message, 'error'); }
  });
}

// ---------------------------------------------------------------- views: admin
async function viewAdmin(tab = 'dashboard') {
  if (needLogin()) return;
  if (store.user.role !== 'admin') { app.innerHTML = '<div class="empty"><h2>Admins only</h2></div>'; return; }
  const tabs = ['dashboard', 'cars', 'bookings', 'owners', 'customers'];
  if (!tabs.includes(tab)) tab = 'dashboard';
  app.innerHTML = `<h2>Admin panel</h2>
    <div class="tabs">${tabs.map((t) => `<a href="#/admin/${t}" class="${t === tab ? 'active' : ''}">${t[0].toUpperCase() + t.slice(1)}</a>`).join('')}</div>
    <div id="admin-body"></div>`;
  const body = $('#admin-body');
  ({ dashboard: adminDashboard, cars: adminCars, bookings: adminBookings, owners: adminOwners, customers: adminCustomers })[tab](body);
}

async function adminDashboard(el) {
  const s = await api('/admin/stats');
  const tile = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  el.innerHTML = `<div class="stats">${tile(s.cars, 'Cars')}${tile(s.owners, 'Car owners')}${tile(s.customers, 'Customers')}${tile(s.activeBookings, 'Active bookings')}${tile(money(s.revenue), 'Revenue (returned)')}${tile(money(s.pendingRevenue), 'Pending revenue')}</div>
    <p class="muted">Owners receive 80% of each finalised bill when a car is marked returned.</p>`;
}

async function adminBookings(el) {
  const rows = await api('/bookings');
  el.innerHTML = rows.length ? bookingsTable(rows, true) : '<div class="empty">No bookings yet.</div>';
  bindBookingActions();
}

async function adminCustomers(el) {
  const rows = await api('/admin/customers');
  el.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Bookings</th><th>Total bill</th><th>Joined</th></tr></thead><tbody>
    ${rows.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.email)}</td><td>${esc(c.phone || '–')}</td><td>${c.bookings}</td><td>${money(c.bill)}</td><td>${fmtDT(c.created_at + 'Z')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No customers yet.</div>';
}

async function adminOwners(el) {
  const rows = await api('/admin/owners');
  el.innerHTML = `<div class="section-title" style="margin-top:0"><span class="muted">${rows.length} owners</span><button class="btn" id="add-owner">+ Add owner</button></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>CNIC / ID</th><th>Contact</th><th>Cars</th><th>Balance</th><th></th></tr></thead><tbody>
    ${rows.map((o) => `<tr><td><b>${esc(o.name)}</b></td><td>${esc(o.cnic || '–')}</td><td>${esc(o.contact_no || '–')}</td><td>${o.cars}</td><td><b>${money(o.balance)}</b></td>
      <td class="actions"><button class="btn small ghost" data-edit="${o.id}">Edit</button>${o.balance > 0 ? `<button class="btn small" data-pay="${o.id}">Pay out</button>` : ''}<button class="btn small danger" data-del="${o.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>`;

  const form = (o = {}) => {
    const m = openModal(`<div class="head"><h3>${o.id ? 'Edit' : 'Add'} owner</h3><button class="x" aria-label="Close">&times;</button></div>
      <form id="of"><div class="field"><label>Name</label><input name="name" required value="${esc(o.name)}"></div>
      <div class="field"><label>CNIC / ID number</label><input name="cnic" value="${esc(o.cnic)}"></div>
      <div class="field"><label>Contact number</label><input name="contact_no" value="${esc(o.contact_no)}"></div>
      <button class="btn" style="width:100%">Save</button></form>`);
    $('#of', m).onsubmit = async (e) => {
      e.preventDefault();
      try { await api(o.id ? `/admin/owners/${o.id}` : '/admin/owners', { method: o.id ? 'PUT' : 'POST', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); toast('Owner saved'); router(); } catch (err) { toast(err.message, 'error'); }
    };
  };
  $('#add-owner').onclick = () => form();
  el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => form(rows.find((o) => o.id == b.dataset.edit)));
  el.querySelectorAll('[data-pay]').forEach((b) => b.onclick = async () => { if (confirm('Pay out and reset balance to ₹0?')) { await api(`/admin/owners/${b.dataset.pay}/payout`, { method: 'POST' }); toast('Payout recorded'); router(); } });
  el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Delete this owner? Their cars will be left without an owner.')) { try { await api(`/admin/owners/${b.dataset.del}`, { method: 'DELETE' }); toast('Owner deleted'); router(); } catch (e) { toast(e.message, 'error'); } } });
}

async function adminCars(el) {
  const [cars, owners] = await Promise.all([api('/cars'), api('/admin/owners')]);
  el.innerHTML = `<div class="section-title" style="margin-top:0"><span class="muted">${cars.length} cars</span><button class="btn" id="add-car">+ Add car</button></div>
    <div class="table-wrap"><table><thead><tr><th>Car</th><th>Reg. no</th><th>Type</th><th>Seats</th><th>Rate / hr</th><th>Owner</th><th>Status</th><th></th></tr></thead><tbody>
    ${cars.map((c) => `<tr><td><b>${esc(c.make)} ${esc(c.name)}</b><br><span class="muted">${esc(c.model)} · ${esc(c.colour || '')} · ${esc(c.condition)}</span></td><td>${esc(c.reg_no)}</td><td>${esc(c.type)}</td><td>${c.seating_capacity}</td><td>${money(c.rent_per_hour)}</td><td>${esc(c.owner_name || '–')}</td>
      <td>${c.status === 'maintenance' ? '<span class="badge off">Maintenance</span>' : c.rented_now ? '<span class="badge warn">Rented</span>' : '<span class="badge ok">Available</span>'}</td>
      <td class="actions"><button class="btn small ghost" data-edit="${c.id}">Edit</button><button class="btn small danger" data-del="${c.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>`;

  const form = (c = {}) => {
    const f = (name, label, type = 'text', extra = '') => `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(c[name])}" ${extra}></div>`;
    const m = openModal(`<div class="head"><h3>${c.id ? 'Edit' : 'Add'} car</h3><button class="x" aria-label="Close">&times;</button></div>
      <form id="cf"><div class="row">${f('name', 'Name', 'text', 'required')}${f('make', 'Make', 'text', 'required')}</div>
      <div class="row">${f('model', 'Model year', 'text', 'required')}${f('reg_no', 'Registration no.', 'text', 'required')}</div>
      <div class="row">${f('colour', 'Colour')}${f('type', 'Type (SUV, Sedan…)')}</div>
      <div class="row">${f('seating_capacity', 'Seats', 'number', 'min="1" max="20" required')}${f('rent_per_hour', 'Rent per hour (₹)', 'number', 'min="1" step="any" required')}</div>
      <div class="row"><div class="field"><label>Condition</label><select name="condition">${['Excellent', 'Good', 'Fair'].map((x) => `<option ${c.condition === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Status</label><select name="status"><option value="available">Available</option><option value="maintenance" ${c.status === 'maintenance' ? 'selected' : ''}>Maintenance</option></select></div></div>
      <div class="field"><label>Owner</label><select name="owner_id"><option value="">— none —</option>${owners.map((o) => `<option value="${o.id}" ${c.owner_id == o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></div>
      <button class="btn" style="width:100%">Save car</button></form>`);
    $('#cf', m).onsubmit = async (e) => {
      e.preventDefault();
      try { await api(c.id ? `/cars/${c.id}` : '/cars', { method: c.id ? 'PUT' : 'POST', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); toast('Car saved'); router(); } catch (err) { toast(err.message, 'error'); }
    };
  };
  $('#add-car').onclick = () => form({ seating_capacity: 4, type: 'Sedan' });
  el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => form(cars.find((c) => c.id == b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Delete this car permanently?')) { try { await api(`/cars/${b.dataset.del}`, { method: 'DELETE' }); toast('Car deleted'); router(); } catch (e) { toast(e.message, 'error'); } } });
}

// ---------------------------------------------------------------- boot
router();
