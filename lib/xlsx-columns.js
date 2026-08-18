// Shared between main.js (the app's actual importer) and
// scripts/generate-template.js (the template-regeneration tool) so the two
// never drift apart — which is exactly what happened before this file
// existed: "Doc Count" got added to the real sheet, and only one of the two
// copies of this list would have needed updating, silently.
//
// Columns outside this set are treated as document-type columns, whatever
// they're named — robust to header typos/renames (e.g. "PMC personell files")
// and to the sheet gaining/losing document types.
const NON_DOC_COLUMNS = new Set([
  'page',
  'level',
  'display name',
  'item name',
  'type',
  'total documents',
  // Live formula column (=SUM of the document-type columns, for comparing
  // against Total Documents while filling the sheet in by hand) — not a
  // document type, and not something the app needs to read; it only needs
  // to not be mistaken for a document type.
  'doc count',
]);

module.exports = { NON_DOC_COLUMNS };
