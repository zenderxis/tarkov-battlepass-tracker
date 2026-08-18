// Regenerates data-source/battlepass.template.xlsx and .template.csv from
// lib/battlepass-data.js — the season's fixed structure (which levels
// exist, their pages/rewards/Total Documents, and the 9 document types).
//
// This no longer reads any existing spreadsheet: since levels and document
// types are hardcoded in the app itself now (not personal, not something a
// spreadsheet defines), the "template" is just that hardcoded structure
// with every cost column blanked to 0 — generated directly, so it can never
// drift out of sync with what the app actually expects. Only run this again
// if lib/battlepass-data.js itself changes (a future season).
//
// Usage: node scripts/generate-template.js

const path = require('path');
const XLSX = require('xlsx');
const { buildWorkbook } = require('../lib/build-sheet');
const { LEVELS, DOCUMENT_TYPES } = require('../lib/battlepass-data');

const OUTPUT_XLSX = path.join(__dirname, '..', 'data-source', 'battlepass.template.xlsx');
const OUTPUT_CSV = path.join(__dirname, '..', 'data-source', 'battlepass.template.csv');

function main() {
  const wb = buildWorkbook(); // no costsById -> every cost column is 0

  XLSX.writeFile(wb, OUTPUT_XLSX);
  // CSV has no formula concept, so the live Doc Count SUM formula bakes in
  // as today's computed value (0, since every cost starts blank) here.
  XLSX.writeFile(wb, OUTPUT_CSV);

  console.log(`Wrote ${OUTPUT_XLSX}`);
  console.log(`Wrote ${OUTPUT_CSV}`);
  console.log(`${LEVELS.length} levels, ${DOCUMENT_TYPES.length} document types, all costs blanked to 0.`);
}

main();
