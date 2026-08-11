'use strict';

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  port: parseInt(process.env.PORT, 10) || 3000,
  // DEMO ONLY: this key is intentionally hardcoded so the CI Secret Detection
  // scan (gitleaks) has a finding to show. In real projects, always inject via
  // a secret manager / CI variable. The pipeline is configured to not fail on
  // this (allow_failure) so you can inspect the Security tab.
  apiKey: process.env.API_KEY || 'sk-demo-0123456789abcdef0123456789abcdef-DEMO',
  maxTodos: parseInt(process.env.MAX_TODOS, 10) || 100,
  trustProxy: process.env.TRUST_PROXY === 'true',
};

module.exports = config;
