'use strict';

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  port: parseInt(process.env.PORT, 10) || 3000,
  trustProxy: process.env.TRUST_PROXY === 'true',
};

module.exports = config;
