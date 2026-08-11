'use strict';

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const todosRouter = require('./routes/todos');
const { authenticate } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', config.trustProxy ? 1 : false);

app.use(helmet());
app.use(morgan(config.env === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '100kb' }));

app.get('/', (req, res) => {
  res.json({
    name: 'DevSecOps Demo API',
    version: '1.0.0',
    health: '/health',
    todos: '/api/todos',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api/todos', authenticate, todosRouter);

app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

app.use(errorHandler);

module.exports = app;
