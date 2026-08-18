const { app, BrowserWindow, BrowserView, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { NON_DOC_COLUMNS } = require('./lib/xlsx-columns');

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
// Where battlepass.xlsx used to live, back when this only ever ran from
// source (`npm start`, no installer). migrateLegacyXlsx() below moves an
// existing file from here to XLSX_SOURCE_PATH once, so upgrading from the
// old layout doesn't lose anyone's already-filled-in document counts.
const LEGACY_XLSX_SOURCE_PATH = path.join(__dirname, 'data-source', 'battlepass.xlsx');
const XLSX_TEMPLATE_PATH = path.join(__dirname, 'data-source', 'battlepass.template.xlsx');
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
  documentTypes: [],
  modes: {
    pve: { label: 'PVE', dailyCap: 15, owned: {} },
    pvp: { label: 'PVP', dailyCap: 20, owned: {} },
    pvpSeason: { label: 'PVP Season', dailyCap: 30, owned: {} },
  },
  levels: [],
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
  // Levels saved before the Page column was captured (or manually added) default to
  // page 1 so pagination doesn't break — re-import from battlepass.xlsx to fix properly.
  if (Array.isArray(out.levels)) {
    out.levels.forEach((l) => { if (l.page === undefined || l.page === null) l.page = 1; });
  }
  delete out.lastMode;
  return out;
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return DEFAULT_STATE;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = migrateState(JSON.parse(raw));
    // Merge with defaults so newly-added fields don't break older saves.
    return {
      ...DEFAULT_STATE,
      ...parsed,
      modes: { ...DEFAULT_STATE.modes, ...(parsed.modes || {}) },
      pageThresholds: { ...DEFAULT_STATE.pageThresholds, ...(parsed.pageThresholds || {}) },
      claims: { ...(parsed.claims || {}) },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveData(state) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

// The document breakdown per level is personal — two players can need
// different types for the same level — but Kord Breach's overall total is
// 501 for everyone, confirmed against a friend's sheet. This is a sanity
// check for the spreadsheet, not a rule enforced anywhere else, and it's
// specific to this season: update it if a future season's total changes.
const EXPECTED_SEASON_TOTAL = 501;

function parseBattlepassXlsx() {
  if (!fs.existsSync(XLSX_SOURCE_PATH)) {
    throw new Error(`Spreadsheet not found at ${XLSX_SOURCE_PATH}`);
  }
  const wb = XLSX.readFile(XLSX_SOURCE_PATH);
  const sheetName = wb.SheetNames.includes(XLSX_SHEET_NAME) ? XLSX_SHEET_NAME : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  if (!rows.length) throw new Error(`Sheet "${sheetName}" has no rows.`);

  const headers = Object.keys(rows[0]);
  const docColumns = headers.filter((h) => !NON_DOC_COLUMNS.has(h.trim().toLowerCase()));

  // Drop the totals footer row (blank Level) and any other blank rows; sort by Level
  // in case the sheet isn't in row order.
  const levelRows = rows
    .filter((r) => r['Level'] !== null && r['Level'] !== '' && r['Level'] !== undefined)
    .sort((a, b) => Number(a['Level']) - Number(b['Level']));

  const documentTypes = docColumns.map((c) => c.trim());

  const levels = levelRows.map((r) => {
    const cost = {};
    docColumns.forEach((col) => {
      const n = Number(r[col]) || 0;
      if (n > 0) cost[col.trim()] = n;
    });
    return {
      id: Number(r['Level']),
      page: Number(r['Page']) || 1,
      reward: (r['Display Name'] || '').toString().trim(),
      itemName: (r['Item Name'] || '').toString().trim(),
      cost,
    };
  });

  // "Total Documents" is a column the sheet already has per level, meant as
  // a self-check while filling it in: the per-type breakdown is personal
  // (a friend's sheet had different numbers per type for the same level),
  // so this catches the far more likely mistake — a typo/skipped cell that
  // makes one row's costs not add up to what that row itself says it should.
  // Rows without a usable "Total Documents" value are skipped (older sheets
  // won't have this column at all) rather than treated as mismatches.
  const validation = { mismatches: [], grandTotal: 0, expectedTotal: EXPECTED_SEASON_TOTAL, rowsChecked: 0 };
  levelRows.forEach((r) => {
    const stated = Number(r['Total Documents']);
    if (!Number.isFinite(stated)) return;
    validation.rowsChecked += 1;
    validation.grandTotal += stated;
    const sum = docColumns.reduce((s, col) => s + (Number(r[col]) || 0), 0);
    if (sum !== stated) {
      validation.mismatches.push({
        level: Number(r['Level']),
        reward: (r['Display Name'] || '').toString().trim(),
        sum,
        stated,
      });
    }
  });

  return { documentTypes, levels, sheetName, validation };
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

ipcMain.handle('data:importXlsx', () => parseBattlepassXlsx());

// Fresh clone/install: data-source/battlepass.xlsx is gitignored (it's
// personal — see scripts/generate-template.js), so it won't exist until a
// user creates it. These two back the first-run "let's set you up" flow in
// the renderer instead of a raw file-not-found error the first time someone
// hits Import.
ipcMain.handle('data:xlsxSourceExists', () => fs.existsSync(XLSX_SOURCE_PATH));
ipcMain.handle('data:copyTemplateXlsx', () => {
  if (fs.existsSync(XLSX_SOURCE_PATH)) return { copied: false, reason: 'already-exists' };
  if (!fs.existsSync(XLSX_TEMPLATE_PATH)) return { copied: false, reason: 'no-template' };
  fs.mkdirSync(path.dirname(XLSX_SOURCE_PATH), { recursive: true });
  fs.copyFileSync(XLSX_TEMPLATE_PATH, XLSX_SOURCE_PATH);
  return { copied: true };
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

// "Open battlepass.xlsx" button in Settings — opens the real, writable
// spreadsheet (userData, not the app's own directory — see
// migrateLegacyXlsx() above) in whatever app Windows has associated with
// .xlsx, same as double-clicking it in Explorer.
ipcMain.handle('shell:openXlsx', async () => {
  if (!fs.existsSync(XLSX_SOURCE_PATH)) return { opened: false, reason: 'no-file' };
  const err = await shell.openPath(XLSX_SOURCE_PATH);
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

ipcMain.handle('win:minimize', () => mainWindow.minimize());
ipcMain.handle('win:maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('win:close', () => mainWindow.close());

// One-time upgrade path from the pre-installer layout (running from source,
// battlepass.xlsx sitting in data-source/ next to the code) to the new one
// (userData, alongside data.json). Never overwrites — if something's
// already at the new location, this is a no-op.
function migrateLegacyXlsx() {
  if (fs.existsSync(XLSX_SOURCE_PATH)) return;
  if (!fs.existsSync(LEGACY_XLSX_SOURCE_PATH)) return;
  fs.mkdirSync(path.dirname(XLSX_SOURCE_PATH), { recursive: true });
  fs.copyFileSync(LEGACY_XLSX_SOURCE_PATH, XLSX_SOURCE_PATH);
}

app.whenReady().then(() => {
  migrateLegacyXlsx();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
