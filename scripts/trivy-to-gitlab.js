#!/usr/bin/env node
// Convert a `trivy image|fs --format json` report into GitLab's
// container_scanning security report schema so findings appear in the
// GitLab Security tab.
//
// Usage: node scripts/trivy-to-gitlab.js <trivy.json> <output.json>
//   - stdin is used when <trivy.json> is '-'.

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
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  UNKNOWN: 'Info',
};

function idFor(vuln) {
  return vuln.VulnerabilityID || 'TRIVY-UNKNOWN';
}

function severityFor(vuln) {
  return SEVERITY_MAP[(vuln.Severity || 'UNKNOWN').toUpperCase()] || 'Info';
}

function identifiersFor(vuln) {
  const id = idFor(vuln);
  const type = id.startsWith('CVE-') ? 'cve' : id.startsWith('GHSA-') ? 'ghsa' : 'other';
  const url = vuln.PrimaryURL || (vuln.References && vuln.References[0]) || '';
  const out = [{ type, name: id, value: id }];
  if (url) out[0].url = url;
  return out;
}

function solutionFor(vuln) {
  if (vuln.FixedVersion) {
    return `Upgrade ${vuln.PkgName} to version ${vuln.FixedVersion} or later.`;
  }
  return vuln.Solution || '';
}

function toReport(trivy) {
  const vulnerabilities = [];
  const os = (trivy.Metadata && trivy.Metadata.OS) || {};

  for (const result of trivy.Results || []) {
    const target = result.Target || '';
    for (const vuln of result.Vulnerabilities || []) {
      const links = (vuln.References || []).map((url) => ({ url }));
      if (vuln.PrimaryURL && !links.some((l) => l.url === vuln.PrimaryURL)) {
        links.unshift({ url: vuln.PrimaryURL });
      }
      vulnerabilities.push({
        id: idFor(vuln),
        category: 'container_scanning',
        name: `${vuln.PkgName}: ${idFor(vuln)}`,
        message: `${idFor(vuln)} in ${vuln.PkgName}@${vuln.InstalledVersion}`,
        description: vuln.Description || vuln.Title || '',
        cve: idFor(vuln),
        severity: severityFor(vuln),
        confidence: 'High',
        scanner: { id: 'trivy', name: 'Trivy' },
        location: {
          image: trivy.ArtifactName || '',
          operating_system: `${os.Family || ''}${os.Name ? ' ' + os.Name : ''}`.trim(),
          dependency: {
            package: { name: vuln.PkgName, version: vuln.InstalledVersion },
          },
        },
        identifiers: identifiersFor(vuln),
        links,
        solution: solutionFor(vuln),
      });
    }
  }

  return {
    version: '4.0.0',
    vulnerabilities,
  };
}

function main() {
  const [input, output] = process.argv.slice(2);
  const trivy = readJson(input);
  const report = toReport(trivy);
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
}

main();
