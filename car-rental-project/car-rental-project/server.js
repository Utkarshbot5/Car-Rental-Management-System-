const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

require('./src/db'); // creates tables + seed data on first run

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/cars', require('./src/routes/cars'));
app.use('/api/bookings', require('./src/routes/bookings'));
app.use('/api/admin', require('./src/routes/admin'));

// Unknown API routes -> JSON 404
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Frontend
app.use(express.static(path.join(__dirname, 'public')));

// Central error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Car Rental running on http://localhost:${PORT}`));
}

module.exports = app;
