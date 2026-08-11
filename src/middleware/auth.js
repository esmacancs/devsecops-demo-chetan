'use strict';

const config = require('../config');

function authenticate(req, res, next) {
  const key = req.get('x-api-key');
  if (!key || key !== config.apiKey) {
    return res.status(401).json({ error: 'Unauthorized', hint: 'Provide a valid X-API-Key header' });
  }
  return next();
}

module.exports = { authenticate };
