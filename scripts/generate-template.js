// Regenerates data-source/battlepass.template.xlsx AND .template.csv from
// the real, live battlepass.xlsx/.csv.
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
// Level, Display Name, Item Name, Type, Total Documents, and any other
// non-document-type column like "Doc Count" — copied through completely
// unchanged, cell objects and all. That last part matters if a column like
// "Doc Count" is a live formula: this works directly on the sheet's cell
// objects (not a JSON round-trip through sheet_to_json/json_to_sheet, which
// only ever sees a formula's last computed value and would silently freeze
// it into a dead static number in the published template). Run again any
// time the real sheet's structure changes (new levels, renamed rewards,
// a new non-document-type column, etc.) — it does NOT need to be re-run
// just because your own document counts changed, since those never end up
// in the template anyway.
//
// Usage: node scripts/generate-template.js

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { NON_DOC_COLUMNS } = require('../lib/xlsx-columns');

// Prefers the real, live working copy in userData — the same location
// Electron's app.getPath('userData') resolves to for this app (see
// XLSX_SOURCE_PATH/CSV_SOURCE_PATH in main.js) — since that's where actual
// edits happen now via the app's "Open spreadsheet" button. Checks .csv too
// in case that's the format actually in use. Falls back to the legacy
// in-project .xlsx copy for anyone who hasn't launched the app since
// upgrading.
const USERDATA_DIR = path.join(process.env.APPDATA || '', 'TarkovBattlepassTracker');
const USERDATA_XLSX = path.join(USERDATA_DIR, 'battlepass.xlsx');
const USERDATA_CSV = path.join(USERDATA_DIR, 'battlepass.csv');
const LEGACY_SOURCE = path.join(__dirname, '..', 'data-source', 'battlepass.xlsx');
const SOURCE = fs.existsSync(USERDATA_XLSX) ? USERDATA_XLSX
  : fs.existsSync(USERDATA_CSV) ? USERDATA_CSV
  : LEGACY_SOURCE;
const OUTPUT_XLSX = path.join(__dirname, '..', 'data-source', 'battlepass.template.xlsx');
const OUTPUT_CSV = path.join(__dirname, '..', 'data-source', 'battlepass.template.csv');

function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`No source spreadsheet found at any of:\n  ${USERDATA_XLSX}\n  ${USERDATA_CSV}\n  ${LEGACY_SOURCE}`);
  }
  const wb = XLSX.readFile(SOURCE);
  const sheetName = wb.SheetNames.includes('pvp') ? 'pvp' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const headerRow = range.s.r;

  const docCols = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const headerCell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
    const header = headerCell ? String(headerCell.v).trim() : '';
    if (header && !NON_DOC_COLUMNS.has(header.toLowerCase())) {
      docCols.push({ index: c, name: header });
    }
  }

  let rowCount = 0;
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    rowCount += 1;
    docCols.forEach(({ index: c }) => {
      sheet[XLSX.utils.encode_cell({ r, c })] = { t: 'n', v: 0 };
    });
  }

  XLSX.writeFile(wb, OUTPUT_XLSX);
  // Same blanked-out workbook, written as CSV too — for anyone without
  // Excel/LibreOffice/Sheets access, editable in any text editor. CSV has
  // no formula concept, so a column like "Doc Count" bakes in as a plain
  // static number here (0, since every cost feeding it was just blanked)
  // rather than staying live the way it does in the .xlsx version.
  XLSX.writeFile(wb, OUTPUT_CSV);

  console.log(`Source: ${SOURCE}`);
  console.log(`Wrote ${OUTPUT_XLSX}`);
  console.log(`Wrote ${OUTPUT_CSV}`);
  console.log(`${rowCount} rows, ${docCols.length} document-type columns blanked: ${docCols.map((d) => d.name).join(', ')}`);
}

main();
