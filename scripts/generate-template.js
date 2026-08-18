// Regenerates data-source/battlepass.template.xlsx from data-source/battlepass.xlsx.
//
// Why this exists: the per-document-type breakdown on a level is personal —
// two players can need different types of documents for the exact same
// level, even though the level's own total document count is the same for
// everyone. That means the real, filled-in battlepass.xlsx (whoever's it
// is) can't be shipped to the community as-is — someone else importing it
// would get a possibly-wrong per-type breakdown. What *is* safe to publish
// is the season's structure: which levels exist, what page/reward each one
// is, and each level's correct "Total Documents" total (a self-check value
// useful while filling the sheet back in — if a player's own per-type
// numbers don't add up to it, they know they made a mistake).
//
// This script takes the real sheet and produces a template with every
// document-type cost column blanked out (0) but everything else — Page,
// Level, Display Name, Item Name, Type, Total Documents — copied through
// unchanged. Run it again any time the real sheet's structure changes
// (new levels, renamed rewards, etc.) to keep the published template
// in sync — it does NOT need to be re-run just because your own document
// counts changed, since those never end up in the template anyway.
//
// Usage: node scripts/generate-template.js

const path = require('path');
const XLSX = require('xlsx');

const SOURCE = path.join(__dirname, '..', 'data-source', 'battlepass.xlsx');
const OUTPUT = path.join(__dirname, '..', 'data-source', 'battlepass.template.xlsx');
const NON_DOC_COLUMNS = new Set(['page', 'level', 'display name', 'item name', 'type', 'total documents']);

function main() {
  const wb = XLSX.readFile(SOURCE);
  const sheetName = wb.SheetNames.includes('pvp') ? 'pvp' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  if (!rows.length) throw new Error(`Sheet "${sheetName}" has no rows.`);

  const headers = Object.keys(rows[0]);
  const docColumns = headers.filter((h) => !NON_DOC_COLUMNS.has(h.trim().toLowerCase()));

  const blanked = rows.map((r) => {
    const copy = { ...r };
    docColumns.forEach((col) => { copy[col] = 0; });
    return copy;
  });

  const newSheet = XLSX.utils.json_to_sheet(blanked, { header: headers });
  const newWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(newWb, newSheet, 'pvp');
  XLSX.writeFile(newWb, OUTPUT);

  console.log(`Wrote ${OUTPUT}`);
  console.log(`${rows.length} rows, ${docColumns.length} document-type columns blanked: ${docColumns.join(', ')}`);
}

main();
