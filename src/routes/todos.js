'use strict';

const express = require('express');
const store = require('../db/store');
const config = require('../config');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(store.list());
});

router.post('/', (req, res) => {
  const { title, completed } = req.body || {};

  if (typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (title.trim().length > 120) {
    return res.status(400).json({ error: 'title must be 120 characters or fewer' });
  }
  if (store.list().length >= config.maxTodos) {
    return res.status(429).json({ error: 'todo limit reached' });
  }

  const todo = store.create({ title: title.trim(), completed });
  return res.status(201).json(todo);
});

router.get('/:id', (req, res) => {
  const todo = store.get(Number(req.params.id));
  if (!todo) {
    return res.status(404).json({ error: 'todo not found' });
  }
  return res.json(todo);
});

router.put('/:id', (req, res) => {
  const todo = store.get(Number(req.params.id));
  if (!todo) {
    return res.status(404).json({ error: 'todo not found' });
  }
  const { title, completed } = req.body || {};
  const updated = store.update(todo.id, {
    title: typeof title === 'string' && title.trim() ? title.trim() : todo.title,
    completed: typeof completed === 'boolean' ? completed : todo.completed,
  });
  return res.json(updated);
});

router.delete('/:id', (req, res) => {
  const removed = store.remove(Number(req.params.id));
  if (!removed) {
    return res.status(404).json({ error: 'todo not found' });
  }
  return res.status(204).end();
});

module.exports = router;
