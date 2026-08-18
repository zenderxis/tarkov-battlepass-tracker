// Builds an xlsx/csv-ready workbook from the hardcoded season structure
// (lib/battlepass-data.js) plus whatever cost values are handed in. Shared
// by scripts/generate-template.js (costsById omitted → an all-zero blank
// template) and the app's own Export feature (costsById = the user's real
// current costs) — one place that defines what these files look like,
// instead of two copies that could drift.
const XLSX = require('xlsx');
const { DOCUMENT_TYPES, LEVELS } = require('./battlepass-data');

const STRUCT_COLUMNS = ['Page', 'Level', 'Display Name', 'Item Name'];
const DOC_TYPE_START_COL = STRUCT_COLUMNS.length;
const DOC_COUNT_COL = DOC_TYPE_START_COL + DOCUMENT_TYPES.length;

function buildWorkbook(costsById = {}) {
  const headers = [...STRUCT_COLUMNS, ...DOCUMENT_TYPES, 'Doc Count', 'Total Documents'];

  const rows = LEVELS.map((level) => {
    const row = {
      Page: level.page,
      Level: level.id,
      'Display Name': level.reward,
      'Item Name': level.itemName,
    };
    const cost = costsById[level.id] || {};
    DOCUMENT_TYPES.forEach((type) => { row[type] = cost[type] || 0; });
    row['Doc Count'] = 0; // overwritten with a live formula below
    row['Total Documents'] = level.totalDocuments;
    return row;
  });

  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });

  // Doc Count = a real SUM formula over that row's document-type cells, not
  // a static number — a player added this to their own sheet as a running
  // self-check while filling in costs (does my row's sum match Total
  // Documents yet?), so every generated file gets it live by default. The
  // cell also carries today's actual sum as its cached value (`v`) — Excel
  // ignores that and recalculates the formula normally when the file is
  // opened, but CSV has no formula concept at all, so without a cached
  // value SheetJS's CSV writer would fall back to printing the literal
  // formula TEXT into the cell instead of a usable number.
  LEVELS.forEach((level, i) => {
    const r = i + 1; // header occupies row 0
    const startAddr = XLSX.utils.encode_cell({ r, c: DOC_TYPE_START_COL });
    const endAddr = XLSX.utils.encode_cell({ r, c: DOC_TYPE_START_COL + DOCUMENT_TYPES.length - 1 });
    const cellAddr = XLSX.utils.encode_cell({ r, c: DOC_COUNT_COL });
    const cost = costsById[level.id] || {};
    const sum = DOCUMENT_TYPES.reduce((s, type) => s + (cost[type] || 0), 0);
    sheet[cellAddr] = { t: 'n', f: `SUM(${startAddr}:${endAddr})`, v: sum };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'pvp');
  return wb;
}

module.exports = { buildWorkbook };
