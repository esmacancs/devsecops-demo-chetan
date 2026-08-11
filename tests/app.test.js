'use strict';

const request = require('supertest');
const app = require('../src/app');
const store = require('../src/db/store');
const config = require('../src/config');

const API_KEY = config.apiKey;

beforeEach(() => {
  store.clear();
});

describe('app basics', () => {
  test('GET / returns service info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('DevSecOps Demo API');
  });

  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('todo endpoints require X-API-Key', async () => {
    const res = await request(app).get('/api/todos');
    expect(res.status).toBe(401);
  });

  test('unknown routes return 404', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });

  test('security headers are set by helmet', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('serves the web portal for HTML requests', async () => {
    const res = await request(app).get('/').set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('DevSecOps Demo');
  });

  test('serves portal static assets', async () => {
    const css = await request(app).get('/styles.css');
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toMatch(/css/);

    const js = await request(app).get('/app.js');
    expect(js.status).toBe(200);
  });

  test('serves the OpenAPI spec', async () => {
    const res = await request(app).get('/openapi.yaml');
    expect(res.status).toBe(200);
    expect(res.text).toContain('openapi: 3.0.3');
  });
});

describe('todos API', () => {
  test('creates and lists todos', async () => {
    const created = await request(app)
      .post('/api/todos')
      .set('x-api-key', API_KEY)
      .send({ title: 'Write unit tests' });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe('Write unit tests');

    const list = await request(app).get('/api/todos').set('x-api-key', API_KEY);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  test('rejects missing title', async () => {
    const res = await request(app).post('/api/todos').set('x-api-key', API_KEY).send({});
    expect(res.status).toBe(400);
  });

  test('rejects over-long title', async () => {
    const res = await request(app)
      .post('/api/todos')
      .set('x-api-key', API_KEY)
      .send({ title: 'x'.repeat(121) });
    expect(res.status).toBe(400);
  });

  test('rejects todos beyond the configured limit', async () => {
    const original = config.maxTodos;
    config.maxTodos = 2;
    try {
      await request(app).post('/api/todos').set('x-api-key', API_KEY).send({ title: 'one' });
      await request(app).post('/api/todos').set('x-api-key', API_KEY).send({ title: 'two' });
      const res = await request(app)
        .post('/api/todos')
        .set('x-api-key', API_KEY)
        .send({ title: 'three' });
      expect(res.status).toBe(429);
    } finally {
      config.maxTodos = original;
    }
  });

  test('malformed JSON is handled by the error handler', async () => {
    const res = await request(app)
      .post('/api/todos')
      .set('x-api-key', API_KEY)
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(res.status).toBe(400);
  });

  test('updates a todo', async () => {
    const created = (
      await request(app)
        .post('/api/todos')
        .set('x-api-key', API_KEY)
        .send({ title: 'temp' })
    ).body;

    const updated = await request(app)
      .put(`/api/todos/${created.id}`)
      .set('x-api-key', API_KEY)
      .send({ completed: true });
    expect(updated.status).toBe(200);
    expect(updated.body.completed).toBe(true);
  });

  test('deletes a todo', async () => {
    const created = (
      await request(app)
        .post('/api/todos')
        .set('x-api-key', API_KEY)
        .send({ title: 'to delete' })
    ).body;

    const del = await request(app)
      .delete(`/api/todos/${created.id}`)
      .set('x-api-key', API_KEY);
    expect(del.status).toBe(204);

    const gone = await request(app)
      .get(`/api/todos/${created.id}`)
      .set('x-api-key', API_KEY);
    expect(gone.status).toBe(404);
  });

  test('returns 404 for unknown todo', async () => {
    const res = await request(app).get('/api/todos/999').set('x-api-key', API_KEY);
    expect(res.status).toBe(404);
  });
});
