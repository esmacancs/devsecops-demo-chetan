'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

const app = express();

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.set('trust proxy', config.trustProxy ? 1 : false);

app.use(helmet());
app.use(morgan(config.env === 'development' ? 'dev' : 'combined'));

// Serve the OpenAPI spec from the repo root so clients can link to it.
app.get('/openapi.yaml', (req, res) => {
  res.type('application/yaml').sendFile(path.join(__dirname, '..', 'openapi.yaml'));
});

app.get('/', (req, res) => {
  // Browsers asking for HTML get the coffee-shop site; API clients get JSON.
  if ((req.get('Accept') || '').includes('text/html')) {
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  res.json({
    name: 'Coffee Shop',
    version: '1.0.0',
    health: '/health',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.use(express.static(PUBLIC_DIR));

app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

app.use(errorHandler);

module.exports = app;
