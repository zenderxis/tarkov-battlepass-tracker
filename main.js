const { app, BrowserWindow, BrowserView, ipcMain, screen, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { DOCUMENT_TYPES, LEVELS } = require('./lib/battlepass-data');
const { buildWorkbook } = require('./lib/build-sheet');

app.setName('TarkovBattlepassTracker');

const DATA_FILE = path.join(app.getPath('userData'), 'data.json');
// The real, filled-in battlepass.xlsx has to live somewhere genuinely
// writable at runtime — userData, same as data.json — not inside the app's
// own install directory. A packaged, installed app's own directory is
// typically read-only (bundled into an asar archive, or just a location a
// standard user account shouldn't be writing into), so anything living
// there can only ever be read, never edited-and-reimported the way this
// file needs to be. The *template* is fine to stay bundled (read-only is
// all it ever needs).
const XLSX_SOURCE_PATH = path.join(app.getPath('userData'), 'battlepass.xlsx');
// Plain-CSV alternative to the .xlsx above, for anyone without Excel/
// LibreOffice/Sheets access — editable in literally any text editor,
// Notepad included. Same rows/columns, just no formulas (CSV has no such
// concept — a formula cell like "Doc Count" becomes whatever it last
// computed to when a .csv template is generated). Parsed identically to
// .xlsx (SheetJS handles both through the same API), so nothing downstream
// of resolveSheetSourcePath() needs to know or care which one a given user
// picked.
const CSV_SOURCE_PATH = path.join(app.getPath('userData'), 'battlepass.csv');
// Rolling daily backups of data.json — see maybeBackupBeforeSave() below.
// Cheap insurance against a bad edit or an accidental Full Reset, since
// there's otherwise exactly one copy of a user's progress/costs anywhere.
const BACKUPS_DIR = path.join(app.getPath('userData'), 'backups');
const MAX_BACKUPS = 14;
// Where battlepass.xlsx used to live, back when this only ever ran from
// source (`npm start`, no installer). migrateLegacyXlsx() below moves an
// existing file from here to XLSX_SOURCE_PATH once, so upgrading from the
// old layout doesn't lose anyone's already-filled-in document counts.
const LEGACY_XLSX_SOURCE_PATH = path.join(__dirname, 'data-source', 'battlepass.xlsx');
const APP_ICON_PATH = path.join(__dirname, 'data-source', 'app_resources', 'black_div.ico');
const XLSX_SHEET_NAME = 'pvp'; // misleadingly named — this one table applies to all three modes
const MAP_URL = 'https://tarkovdocsmap.com/';
const TITLEBAR_HEIGHT = 40;
const TABNAV_HEIGHT = 44;
const CONTENT_TOP = TITLEBAR_HEIGHT + TABNAV_HEIGHT;

let mainWindow;
let mapView = null;
let mapVisible = false;

const DEFAULT_STATE = {
  // Document types and each level's structure (page/reward/item) are the
  // season's fixed shape, not personal data — see lib/battlepass-data.js
  // and syncStructuralData() below, which keeps this in sync with that file
  // on every load rather than trusting whatever's already on disk.
  documentTypes: [...DOCUMENT_TYPES],
  modes: {
    pve: { label: 'PVE', dailyCap: 15, owned: {} },
    pvp: { label: 'PVP', dailyCap: 20, owned: {} },
    pvpSeason: { label: 'PVP Season', dailyCap: 30, owned: {} },
  },
  levels: LEVELS.map((l) => ({ id: l.id, page: l.page, reward: l.reward, itemName: l.itemName, totalDocuments: l.totalDocuments, cost: {} })),
  // Levels aren't claimed in strict order — the Battlepass is organized into pages
  // (the xlsx's Page column), and within an unlocked page any reward can be claimed
  // in any order. `claims` maps claimed level id -> { mode, forced }: which mode's
  // documents paid for it (account-wide claim status, shared across modes, but
  // per-claim mode tracked so unclaiming can refund the right mode's inventory),
  // and whether it was claimed via Claim Mode (forced: true means no documents were
  // actually deducted, so unclaiming it must not refund anything either).
  claims: {},
  // Claim Mode (toggled in Settings): while on, claiming any reward skips the
  // document-cost check and doesn't deduct anything — an override for
  // corrections/testing, not normal play.
  claimMode: false,
  // Unclaim Mode (toggled in Settings): the Unclaim button on a claimed tile
  // is only rendered at all while this is on — off by default, so a claimed
  // reward can't be accidentally unclaimed (and possibly refunded) during
  // normal play. Same "explicit override, not normal play" spirit as Claim
  // Mode, just gating the opposite action.
  unclaimMode: false,
  // UI language (Settings). See i18n.js for the string tables and which
  // languages are supported — 'en' is always a safe fallback for any key
  // missing from another language's table.
  language: 'en',
  // How many rewards must be claimed from page N-1 before page N's rewards can be
  // claimed at all (page 1 has no prerequisite). Not present anywhere in the
  // spreadsheet — hand-entered from the user 2026-08-17 — so it's editable state,
  // not derived, in case season rules change.
  pageThresholds: { 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 2, 8: 3, 9: 4, 10: 4, 11: 3, 12: 3 },
  // Gates the first-launch walkthrough overlay (see maybeShowWalkthrough()
  // in renderer.js) — true means "don't show it again". Only ever false for
  // a genuinely brand-new install (no data.json on disk yet at all); see
  // loadData() below for why an existing save always forces this true
  // regardless of what's actually stored in it.
  hasSeenWalkthrough: false,
};

// Older saves used `tiers`/`requirements`/`cap` for what's now `levels`/`cost`/`dailyCap`
// (cumulative-threshold model, since replaced by standalone per-level cost). Migrate in place.
// Also: progress used to be a single linear `currentLevel` (before that, one per mode),
// then a plain `claimedIds` array, then `claims: {levelId: modeKey}` with no record of
// whether Claim Mode was used. The Battlepass is actually page-gated, not linear, and
// unclaiming needs to know both which mode to refund and whether to refund at all — so
// claim values are now `{mode, forced}` objects. Best-effort migrate every older shape
// into that, defaulting forced: false (refund on unclaim) since Claim Mode didn't exist
// when those older shapes were current, except plain `claimedIds`/linear-level entries
// which get mode: null (unknown, can't be refunded — same as before, just reshaped).
function migrateState(parsed) {
  const out = { ...parsed };
  if (!out.levels && Array.isArray(out.tiers)) {
    out.levels = out.tiers.map((t) => ({ id: t.id, reward: t.reward, cost: t.requirements || {} }));
  }
  delete out.tiers;
  let maxOldLevel = 0;
  if (out.modes) {
    Object.values(out.modes).forEach((mode) => {
      if (mode.cap !== undefined && mode.dailyCap === undefined) mode.dailyCap = mode.cap;
      delete mode.cap;
      if (mode.currentLevel !== undefined) {
        maxOldLevel = Math.max(maxOldLevel, mode.currentLevel);
        delete mode.currentLevel;
      }
    });
  }
  if (out.currentLevel !== undefined) {
    maxOldLevel = Math.max(maxOldLevel, out.currentLevel);
    delete out.currentLevel;
  }
  if (out.claims) {
    // Reshape any pre-existing `claims[id] = modeKey|null` into `{mode, forced}`.
    Object.keys(out.claims).forEach((id) => {
      const v = out.claims[id];
      if (v === null || typeof v === 'string') {
        out.claims[id] = { mode: v, forced: false };
      }
    });
  } else {
    out.claims = {};
    if (Array.isArray(out.claimedIds)) {
      out.claimedIds.forEach((id) => { out.claims[id] = { mode: null, forced: false }; });
    } else if (maxOldLevel > 0 && Array.isArray(out.levels)) {
      out.levels.slice(0, maxOldLevel).forEach((l) => { out.claims[l.id] = { mode: null, forced: false }; });
    }
  }
  delete out.claimedIds;
  if (out.claimMode === undefined) out.claimMode = false;
  if (out.unclaimMode === undefined) out.unclaimMode = false;
  if (!out.language) out.language = 'en';
  if (!out.pageThresholds) out.pageThresholds = { ...DEFAULT_STATE.pageThresholds };
  delete out.lastMode;
  return out;
}

// Document types and every level's page/reward/item name are fixed for the
// season (lib/battlepass-data.js) — not something a save file should be
// trusted to define anymore. This rebuilds both from that single source of
// truth on every load, keeping only each level's cost (the one field that's
// actually personal) from whatever was already saved, matched by id. That
// also means a future correction to battlepass-data.js (a typo fix, a
// reward rename) reaches every existing save automatically, and it's what
// actually migrates old saves — built the old way, from parsing a real
// spreadsheet — onto the new model: their levels' ids and costs carry over
// untouched, page/reward/item name just get rebuilt to match.
function syncStructuralData(state) {
  const savedCostById = {};
  (state.levels || []).forEach((l) => {
    if (l && l.id !== undefined) savedCostById[l.id] = l.cost || {};
  });
  state.levels = LEVELS.map((l) => ({
    id: l.id,
    page: l.page,
    reward: l.reward,
    itemName: l.itemName,
    totalDocuments: l.totalDocuments,
    cost: savedCostById[l.id] || {},
  }));
  state.documentTypes = [...DOCUMENT_TYPES];
  return state;
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return DEFAULT_STATE;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = migrateState(JSON.parse(raw));
    // Merge with defaults so newly-added fields don't break older saves.
    const merged = {
      ...DEFAULT_STATE,
      ...parsed,
      modes: { ...DEFAULT_STATE.modes, ...(parsed.modes || {}) },
      pageThresholds: { ...DEFAULT_STATE.pageThresholds, ...(parsed.pageThresholds || {}) },
      claims: { ...(parsed.claims || {}) },
      // Any save that exists at all (even one from before this field
      // existed) means this isn't a first-time user — force it true unless
      // it was explicitly recorded as false (a save from a version that has
      // the walkthrough, where the user genuinely hasn't dismissed it yet).
      hasSeenWalkthrough: parsed.hasSeenWalkthrough === false ? false : true,
    };
    return syncStructuralData(merged);
  } catch {
    return DEFAULT_STATE;
  }
}

function saveData(state) {
  maybeBackupBeforeSave();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

// saveData() runs on nearly every keystroke (persist() in renderer.js), so
// backing up on every call would flood the folder with near-duplicates —
// instead, at most once per calendar day, snapshot whatever's currently on
// disk (the end state of the last save before today) before it gets
// overwritten. Best-effort: a backup failure should never block an actual
// save, so errors are swallowed rather than surfaced.
function maybeBackupBeforeSave() {
  if (!fs.existsSync(DATA_FILE)) return;
  const dateStamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const backupPath = path.join(BACKUPS_DIR, `data-${dateStamp}.json`);
  if (fs.existsSync(backupPath)) return;
  try {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    fs.copyFileSync(DATA_FILE, backupPath);
    pruneOldBackups();
  } catch {
    // Best-effort — see comment above.
  }
}

function pruneOldBackups() {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter((f) => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort(); // ISO date filenames sort chronologically as plain strings
    const excess = files.length - MAX_BACKUPS;
    if (excess > 0) {
      files.slice(0, excess).forEach((f) => fs.unlinkSync(path.join(BACKUPS_DIR, f)));
    }
  } catch {
    // Best-effort — see maybeBackupBeforeSave() comment above.
  }
}

// The document breakdown per level is personal — two players can need
// different types for the same level — but Kord Breach's overall total is
// 501 for everyone, confirmed against a friend's sheet. This is a sanity
// check for the spreadsheet, not a rule enforced anywhere else, and it's
// specific to this season: update it if a future season's total changes.
const EXPECTED_SEASON_TOTAL = 501;

// Either battlepass.xlsx or battlepass.csv counts as "the" source — same
// columns, parsed identically either way (SheetJS handles both through the
// same API). .xlsx wins if somehow both exist. Returns null if neither does.
function resolveSheetSourcePath() {
  if (fs.existsSync(XLSX_SOURCE_PATH)) return XLSX_SOURCE_PATH;
  if (fs.existsSync(CSV_SOURCE_PATH)) return CSV_SOURCE_PATH;
  return null;
}

// Reads whichever spreadsheet exists and pulls out ONLY costs, matched to
// the hardcoded level list by the sheet's Level column. Page/Display Name/
// Item Name/Total Documents in the sheet are never trusted as structure
// anymore (see syncStructuralData) — an incoming file only ever needs a
// Level column and the 9 known document-type columns to do anything useful,
// so this is robust to an old-style full sheet, a minimal costs-only sheet,
// or anything in between. Rows whose Level doesn't match a real level id are
// skipped (reported in the returned validation) rather than erroring the
// whole import.
function importCosts() {
  const sourcePath = resolveSheetSourcePath();
  if (!sourcePath) {
    throw new Error(`No spreadsheet found at ${XLSX_SOURCE_PATH} or ${CSV_SOURCE_PATH}`);
  }
  const wb = XLSX.readFile(sourcePath);
  const sheetName = wb.SheetNames.includes(XLSX_SHEET_NAME) ? XLSX_SHEET_NAME : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  if (!rows.length) throw new Error(`Sheet "${sheetName}" has no rows.`);

  const levelById = new Map(LEVELS.map((l) => [l.id, l]));
  const costsById = {};
  // mismatches: rows whose cost columns don't add up to that level's known
  // Total Documents. unknownLevels: Level values in the sheet that don't
  // match any real level id (typo, stray footer row, wrong sheet, etc.).
  const validation = { mismatches: [], unknownLevels: [], grandTotal: 0, expectedTotal: EXPECTED_SEASON_TOTAL, rowsChecked: 0 };

  rows.forEach((r) => {
    const levelId = Number(r['Level']);
    if (!Number.isFinite(levelId)) return; // blank/footer row — not an error, just skip
    const level = levelById.get(levelId);
    if (!level) {
      validation.unknownLevels.push(levelId);
      return;
    }
    const cost = {};
    let sum = 0;
    DOCUMENT_TYPES.forEach((type) => {
      const n = Number(r[type]) || 0;
      if (n > 0) cost[type] = n;
      sum += n;
    });
    costsById[levelId] = cost;
    validation.rowsChecked += 1;
    validation.grandTotal += sum;
    if (sum !== level.totalDocuments) {
      validation.mismatches.push({ level: levelId, reward: level.reward, sum, stated: level.totalDocuments });
    }
  });

  return { costsById, sheetName, validation };
}

// Default launch size as a fraction of the primary display's usable area
// (workAreaSize is already in logical/CSS pixels — Electron divides out the
// OS's own per-monitor DPI scaling for us) instead of a flat 1200x800. A
// fixed 1200x800 looks proportionate on a 1080p screen but leaves a 4K or
// ultrawide 1440p display mostly empty on first launch, and looks cramped
// on anything smaller. Clamped between the existing minimum (860x560) and a
// generous cap so it doesn't balloon to an unwieldy size on a huge display.
const LAUNCH_SIZE_FRACTION = 0.72;
const LAUNCH_MAX_WIDTH = 1700;
const LAUNCH_MAX_HEIGHT = 1050;

function getLaunchWindowSize() {
  const minWidth = 860;
  const minHeight = 560;
  try {
    const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.round(
      Math.min(LAUNCH_MAX_WIDTH, Math.max(minWidth, workWidth * LAUNCH_SIZE_FRACTION))
    );
    const height = Math.round(
      Math.min(LAUNCH_MAX_HEIGHT, Math.max(minHeight, workHeight * LAUNCH_SIZE_FRACTION))
    );
    return { width, height };
  } catch (err) {
    // screen API unavailable for some reason — fall back to the old default.
    return { width: 1200, height: 800 };
  }
}

function createWindow() {
  const { width, height } = getLaunchWindowSize();

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 860,
    minHeight: 560,
    center: true,
    frame: false,
    backgroundColor: '#14161a',
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('resize', () => {
    if (mapVisible && mapView) setMapBounds();
  });
}

function setMapBounds() {
  const [width, height] = mainWindow.getContentSize();
  mapView.setBounds({
    x: 0,
    y: CONTENT_TOP,
    width,
    height: Math.max(0, height - CONTENT_TOP),
  });
}

function ensureMapView() {
  if (mapView) return mapView;
  mapView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      partition: 'persist:tarkovdocsmap',
    },
  });
  mapView.webContents.loadURL(MAP_URL);
  return mapView;
}

ipcMain.handle('data:load', () => loadData());
ipcMain.handle('data:save', (e, state) => {
  saveData(state);
  return true;
});

// Full Reset in Settings. DEFAULT_STATE is the single source of truth for
// what "blank" looks like — returning it here (rather than renderer.js
// building an equivalent object by hand) means there's only ever one place
// that shape can drift. Doesn't touch battlepass.xlsx/.csv itself: only
// app state (claims, owned counts, imported levels/document types,
// settings) resets, so re-importing afterward is a single click, not a
// re-fill-in-the-spreadsheet ordeal.
ipcMain.handle('data:factoryReset', () => {
  saveData(DEFAULT_STATE);
  return DEFAULT_STATE;
});

ipcMain.handle('data:importCosts', () => importCosts());

// Editing costs in-app is the primary workflow now (levels/document types
// are fixed, so there's nothing structural left to import) — a spreadsheet
// is a secondary option for anyone who'd rather fill in ~9 numbers across
// 53 rows in a real grid, or wants a backup/export. format is 'xlsx' or
// 'csv' (CSV needs no spreadsheet software at all, just a text editor —
// see the CSV_SOURCE_PATH comment above).
ipcMain.handle('data:xlsxSourceExists', () => resolveSheetSourcePath() !== null);
// Creates a blank starter spreadsheet at the canonical userData location —
// built fresh via buildWorkbook() (no separate template file to keep in
// sync; it's the exact same function Export uses, just with no costs).
// Never overwrites an existing xlsx/csv.
ipcMain.handle('data:createStarterSheet', (e, format) => {
  const destPath = format === 'csv' ? CSV_SOURCE_PATH : XLSX_SOURCE_PATH;
  if (resolveSheetSourcePath()) return { copied: false, reason: 'already-exists' };
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  XLSX.writeFile(buildWorkbook(), destPath);
  return { copied: true };
});

// "Export spreadsheet" in Settings — builds a full sheet (season structure
// + the caller's current costsById) via the same lib/build-sheet.js the
// blank template uses, and lets the user pick exactly where to save it
// (a real Save dialog, not a silent overwrite) — useful as a backup before
// a Full Reset, or to hand a copy to someone else.
ipcMain.handle('data:exportSheet', async (e, { format, costsById }) => {
  const ext = format === 'csv' ? 'csv' : 'xlsx';
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export spreadsheet',
    defaultPath: path.join(app.getPath('documents'), `battlepass-export.${ext}`),
    filters: ext === 'csv' ? [{ name: 'CSV', extensions: ['csv'] }] : [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { exported: false, reason: 'canceled' };
  const wb = buildWorkbook(costsById || {});
  XLSX.writeFile(wb, filePath);
  return { exported: true, filePath };
});

// Used by Settings' Feedback button and the Reddit credit link — only ever
// opens in the user's real default browser (shell.openExternal), never
// inside the app window. Restricted to http(s) so this can't be abused as a
// generic "launch anything" hook.
ipcMain.handle('shell:openExternal', (e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
});

// "Open spreadsheet" button in Settings — opens whichever of
// battlepass.xlsx/.csv actually exists (userData, not the app's own
// directory — see migrateLegacyXlsx() above) in whatever app Windows has
// associated with that extension, same as double-clicking it in Explorer.
ipcMain.handle('shell:openXlsx', async () => {
  const sourcePath = resolveSheetSourcePath();
  if (!sourcePath) return { opened: false, reason: 'no-file' };
  const err = await shell.openPath(sourcePath);
  return err ? { opened: false, reason: 'shell-error', error: err } : { opened: true };
});

// Opens the rolling-backup folder in Explorer (see maybeBackupBeforeSave()
// above) — the recovery half of the automatic backup: if something goes
// wrong (a bad edit, an accidental Full Reset), a user can come here, copy
// the most recent data-YYYY-MM-DD.json over data.json themselves, and
// reload. No in-app restore flow — this is meant as a rare last resort, not
// a feature to build a UI around.
ipcMain.handle('shell:openBackupsFolder', async () => {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const err = await shell.openPath(BACKUPS_DIR);
  return err ? { opened: false, reason: 'shell-error', error: err } : { opened: true };
});

ipcMain.handle('map:open', () => {
  ensureMapView();
  mainWindow.setBrowserView(mapView);
  setMapBounds();
  mapVisible = true;
});

ipcMain.handle('map:close', () => {
  if (mapView) mainWindow.setBrowserView(null);
  mapVisible = false;
});

// Full relaunch (not just a renderer reload) so edits to main.js/preload.js take
// effect too, not just index.html/renderer.js/styles.css.
ipcMain.handle('app:reload', () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('win:minimize', () => mainWindow.minimize());
ipcMain.handle('win:maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('win:close', () => mainWindow.close());

// ---------- Auto-update ----------
// Checks GitHub Releases (see package.json's build.publish) for a newer
// version, downloads it in the background if found, and prompts to restart
// once it's ready. Packaged installs only — a dev run via `npm start` has
// no app-update.yml (electron-builder generates it at build time), so
// electron-updater would just log a confusing "cannot find update info"
// error every launch otherwise.
const { autoUpdater } = require('electron-updater');
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart the app to install it. Your data is untouched either way — it lives outside the app folder.',
    }).then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
  });

  // Failures (offline, GitHub unreachable, no releases published yet) are
  // logged, not surfaced to the user — a background check silently not
  // working shouldn't interrupt anyone's session. The manual "Check for
  // Updates" button in Settings (see app:checkForUpdates below) surfaces
  // errors explicitly, since that's an intentional user action.
  autoUpdater.on('error', (err) => {
    console.error('Auto-update check failed:', err);
  });

  // Short delay so this doesn't compete with the window's own startup.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => console.error('Auto-update check failed:', err));
  }, 3000);
}

// Settings' "Check for Updates" button — same underlying check as the
// automatic one above, just user-triggered and with a result the renderer
// can show feedback for instead of failing silently.
ipcMain.handle('app:checkForUpdates', async () => {
  if (!app.isPackaged) return { status: 'dev-mode' };
  try {
    const result = await autoUpdater.checkForUpdates();
    const current = app.getVersion();
    const latest = result && result.updateInfo && result.updateInfo.version;
    if (latest && latest !== current) return { status: 'available', version: latest };
    return { status: 'up-to-date', version: current };
  } catch (err) {
    return { status: 'error', error: err.message || String(err) };
  }
});

// One-time upgrade path from the pre-installer layout (running from source,
// battlepass.xlsx sitting in data-source/ next to the code) to the new one
// (userData, alongside data.json). Never overwrites — if something's
// already at the new location, this is a no-op.
function migrateLegacyXlsx() {
  // Also bail if the user's already set up a CSV source instead — don't
  // clobber that choice with a leftover legacy .xlsx nobody's used in a
  // while.
  if (resolveSheetSourcePath()) return;
  if (!fs.existsSync(LEGACY_XLSX_SOURCE_PATH)) return;
  fs.mkdirSync(path.dirname(XLSX_SOURCE_PATH), { recursive: true });
  fs.copyFileSync(LEGACY_XLSX_SOURCE_PATH, XLSX_SOURCE_PATH);
}

app.whenReady().then(() => {
  migrateLegacyXlsx();
  createWindow();
  setupAutoUpdater();
});
app.on('window-all-closed', () => app.quit());
