'use strict';

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity.
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ error: status >= 500 ? 'Internal Server Error' : err.message });
}

module.exports = errorHandler;
