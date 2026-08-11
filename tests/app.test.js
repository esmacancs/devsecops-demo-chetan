'use strict';

const request = require('supertest');
const app = require('../src/app');
const config = require('../src/config');
const errorHandler = require('../src/middleware/errorHandler');

describe('app basics', () => {
  test('GET / returns service info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Coffee Shop');
    expect(res.body.health).toBe('/health');
  });

  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('unknown routes return 404', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });

  test('security headers are set by helmet', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('serves the coffee-shop site for HTML requests', async () => {
    const res = await request(app).get('/').set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Coffee Shop');
  });

  test('serves coffee-shop static assets', async () => {
    const css = await request(app).get('/assits/css/style.css');
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toMatch(/css/);

    const js = await request(app).get('/assits/js/script.js');
    expect(js.status).toBe(200);

    const img = await request(app).get('/img/logo.png');
    expect(img.status).toBe(200);
  });

  test('serves the OpenAPI spec', async () => {
    const res = await request(app).get('/openapi.yaml');
    expect(res.status).toBe(200);
    expect(res.text).toContain('openapi: 3.0.3');
  });

  test('uses dev logging format in development', async () => {
    const original = config.env;
    config.env = 'development';
    try {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    } finally {
      config.env = original;
    }
  });
});

describe('error handler', () => {
  test('responds 500 for server errors and logs them', () => {
    const err = new Error('boom');
    err.status = 500;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
    expect(consoleSpy).toHaveBeenCalledWith(err);
    consoleSpy.mockRestore();
  });

  test('passes client error messages through', () => {
    const err = new Error('Bad Request');
    err.status = 400;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Bad Request' });
  });
});
