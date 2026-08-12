#!/usr/bin/env node
// Convert an `npm audit --json` report into SARIF 2.1.0 so findings appear in
// GitHub Code scanning (Security tab). GitHub-side equivalent of
// scripts/npm-audit-to-gitlab.js, which targets the GitLab Security tab.
//
// Usage: node scripts/npm-audit-to-sarif.js <npm-audit.json|-> <output.sarif>

'use strict';

const fs = require('fs');

function readJson(file) {
  const raw =
    file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

const LEVEL_MAP = {
  info: 'note',
  low: 'note',
  moderate: 'warning',
  high: 'error',
  critical: 'error',
};

function levelFor(sev) {
  return LEVEL_MAP[(sev || 'info').toLowerCase()] || 'note';
}

function slug(value) {
  return String(value).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function toSarif(audit) {
  const rules = [];
  const ruleById = new Map();
  const results = [];

  for (const [pkgName, vuln] of Object.entries(audit.vulnerabilities || {})) {
    const via = Array.isArray(vuln.via) ? vuln.via : [vuln.via].filter(Boolean);

    for (const entry of via) {
      const advisory = typeof entry === 'object' ? entry : null;
      const title = advisory ? advisory.title || advisory.name : String(entry);
      const id = advisory
        ? slug(advisory.url || advisory.source || '') || `${slug(advisory.name)}-${slug(pkgName)}`
        : `npm-audit-${slug(pkgName)}-${slug(title)}`;
      const severity = advisory ? advisory.severity || vuln.severity : vuln.severity;
      const url = advisory ? advisory.url || '' : '';
      const fix = vuln.fixAvailable
        ? typeof vuln.fixAvailable === 'object'
          ? vuln.fixAvailable.version
          : vuln.fixAvailable
        : '';

      if (!ruleById.has(id)) {
        const rule = {
          id,
          name: title,
          shortDescription: { text: title },
          fullDescription: { text: title },
          help: { text: url || title },
          defaultConfiguration: { level: levelFor(severity) },
          properties: { tags: ['security', 'dependency'] },
          ...(url ? { helpUri: url } : {}),
        };
        ruleById.set(id, { rule, ruleIndex: rules.length });
        rules.push(rule);
      }

      const range = vuln.range ? ` (vulnerable range: ${vuln.range})` : '';
      const fixText = fix ? `; fix: ${fix}` : '';
      results.push({
        ruleId: id,
        ruleIndex: ruleById.get(id).ruleIndex,
        level: levelFor(severity),
        message: { text: `${pkgName}: ${title}${range}${fixText}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'package-lock.json' },
            },
          },
        ],
      });
    }
  }

  return {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'npm-audit',
            informationUri: 'https://docs.npmjs.com/cli/v10/commands/npm-audit',
            version: String(audit.auditReportVersion || ''),
            rules,
          },
        },
        results,
      },
    ],
  };
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error(
      'Usage: node scripts/npm-audit-to-sarif.js <npm-audit.json|-> <output.sarif>'
    );
    process.exit(1);
  }
  const sarif = toSarif(readJson(input));
  fs.writeFileSync(output, JSON.stringify(sarif, null, 2));
}

main();
