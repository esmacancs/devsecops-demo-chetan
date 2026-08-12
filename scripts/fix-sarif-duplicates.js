#!/usr/bin/env node
// Remove duplicate entries from SARIF taxonomy/rule arrays. Some scanners
// (e.g. KICS) emit repeated taxa inside a taxonomy, which GitHub's SARIF
// upload rejects with "taxonomies[].taxa contains duplicate item". Dedupes by
// id/guid keeping the first occurrence. Safe to run on any SARIF file; exits
// 0 (no change) when the file is missing or not valid SARIF.
//
// Usage: node scripts/fix-sarif-duplicates.js <file.sarif>

'use strict';

const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/fix-sarif-duplicates.js <file.sarif>');
  process.exit(1);
}

let doc;
try {
  doc = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  process.exit(0);
}

function dedupeByKey(items, keyFn) {
  if (!Array.isArray(items)) return { items, changed: false };
  const seen = new Set();
  const deduped = [];
  let changed = false;
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      changed = true;
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  return { items: deduped, changed };
}

let changed = false;

for (const run of doc.runs || []) {
  for (const taxonomy of run.taxonomies || []) {
    const res = dedupeByKey(taxonomy.taxa, (t) => t.id || t.guid || JSON.stringify(t));
    if (res.changed) {
      taxonomy.taxa = res.items;
      changed = true;
    }
  }

  const driver = (run.tool || {}).driver;
  if (driver) {
    const res = dedupeByKey(driver.rules, (r) => r.id || r.guid || JSON.stringify(r));
    if (res.changed) {
      driver.rules = res.items;
      changed = true;
    }
  }
}

if (changed) {
  // Write via a sibling temp file + rename: scanners running as root in a
  // container may leave the SARIF owned by root, so an in-place rewrite fails
  // with EACCES for the runner user. Renaming only needs write permission on
  // the directory (which the runner owns).
  const tmp = `${file}.fix.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
  fs.renameSync(tmp, file);
}
