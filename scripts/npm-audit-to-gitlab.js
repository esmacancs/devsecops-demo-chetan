#!/usr/bin/env node
// Convert an `npm audit --json` report into GitLab's dependency_scanning
// security report schema so findings appear in the GitLab Security tab.
//
// Usage: node scripts/npm-audit-to-gitlab.js <npm-audit.json> <output.json> [package-lock.json]
//   - stdin is used when <npm-audit.json> is '-'.

'use strict';

const fs = require('fs');

function readJson(file) {
  let raw;
  if (file === '-') {
    raw = fs.readFileSync(0, 'utf8');
  } else {
    raw = fs.readFileSync(file, 'utf8');
  }
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

const SEVERITY_MAP = {
  info: 'Info',
  low: 'Low',
  moderate: 'Medium',
  high: 'High',
  critical: 'Critical',
};

function severityFor(sev) {
  return SEVERITY_MAP[(sev || 'info').toLowerCase()] || 'Info';
}

// Map installed package paths from the lockfile: "node_modules/pkg" -> version
function readLockVersions(lockPath) {
  const versions = {};
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    for (const [key, entry] of Object.entries(lock.packages || {})) {
      if (key === 'node_modules/' + entry.name) {
        versions[key] = entry.version;
      } else if (key.startsWith('node_modules/') && entry.version) {
        versions[key] = entry.version;
      }
    }
    // Top-level dependency versions are not stored under packages[] entries,
    // read them from the classic dependencies map as a fallback.
    for (const [name, entry] of Object.entries(lock.dependencies || {})) {
      versions[`node_modules/${name}`] = entry.version;
    }
  } catch {
    // lockfile absent/unparsable: versions stay unknown
  }
  return versions;
}

function installedVersion(nodes, versions) {
  if (!nodes || nodes.length === 0) return '';
  const path = nodes[0];
  if (versions[path]) return versions[path];
  const base = 'node_modules/' + (path.split('/').pop() || '');
  return versions[base] || '';
}

function toReport(audit, lockPath) {
  const versions = readLockVersions(lockPath);
  const vulnerabilities = [];

  for (const [pkgName, vuln] of Object.entries(audit.vulnerabilities || {})) {
    const via = Array.isArray(vuln.via) ? vuln.via : [vuln.via].filter(Boolean);
    const version = installedVersion(vuln.nodes, versions);

    for (const entry of via) {
      if (typeof entry === 'string') {
        // Advisory title only, no structured details.
        vulnerabilities.push({
          id: `${pkgName}:${entry}`,
          category: 'dependency_scanning',
          name: `${pkgName}: ${entry}`,
          message: `${pkgName}: ${entry}`,
          description: entry,
          cve: '',
          severity: severityFor(vuln.severity),
          scanner: { id: 'npm_audit', name: 'npm audit' },
          location: {
            file: 'package-lock.json',
            dependency: { package: { name: pkgName, version } },
          },
          identifiers: [
            { type: 'advisory', name: entry, value: entry, url: '' },
          ],
          links: [],
        });
        continue;
      }

      const advisory = entry;
      const ghsa = (advisory.url || '').split('/').pop();
      const cves = advisory.cves || [];
      const id = `${advisory.source || ghsa || advisory.name}:${pkgName}`;
      const links = (advisory.url ? [{ url: advisory.url }] : []).concat(
        cves.map((c) => ({ url: `https://nvd.nist.gov/vuln/detail/${c}` }))
      );

      vulnerabilities.push({
        id,
        category: 'dependency_scanning',
        name: `${pkgName}: ${advisory.title || advisory.name}`,
        message: `${pkgName}: ${advisory.title || advisory.name}`,
        description: advisory.title || advisory.name || '',
        cve: cves[0] || '',
        severity: severityFor(advisory.severity || vuln.severity),
        scanner: { id: 'npm_audit', name: 'npm audit' },
        location: {
          file: 'package-lock.json',
          dependency: { package: { name: pkgName, version } },
        },
        identifiers: [
          {
            type: 'advisory',
            name: advisory.title || advisory.name,
            value: ghsa || String(advisory.source || ''),
            url: advisory.url || '',
          },
        ],
        links,
      });
    }
  }

  return {
    version: '14.0.0',
    vulnerabilities,
    dependency_files: ['package-lock.json'],
  };
}

function main() {
  const [input, output, lockPath] = process.argv.slice(2);
  const audit = readJson(input);
  const report = toReport(audit, lockPath);
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
}

main();
