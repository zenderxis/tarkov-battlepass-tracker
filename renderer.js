const MODE_ORDER = ['pve', 'pvp', 'pvpSeason'];
const MODE_SHORT = { pve: 'PVE', pvp: 'PVP', pvpSeason: 'PVPS' };
const MODE_COLOR = { pve: '#abc4c9', pvp: '#f1a983', pvpSeason: '#55bb9b' };

const GITHUB_REPO_URL = 'https://github.com/zenderxis/tarkov-battlepass-tracker';
const REDDIT_URL = 'https://www.reddit.com/user/Zenderxis';

let state = null;
let viewedPage = null;
let sidebarMode = 'pvp';

// ---------- boot ----------

async function boot() {
  state = await window.tracker.loadData();
  populateLanguageSelect();
  applyTranslations();
  renderAll();
  wireStaticControls();
}

// ---------- i18n ----------
// Static markup (anything tagged data-i18n* in index.html) is (re)applied
// here — once at boot, and again whenever the language changes. Dynamic,
// JS-built strings (tile buttons, page-nav text, tooltips, etc.) call t()
// directly wherever they're constructed and don't need this — they're
// already re-rendered on every relevant state change via the normal render
// functions.
function applyTranslations() {
  const lang = state.language || 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(lang, el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(lang, el.getAttribute('data-i18n-title'));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(lang, el.getAttribute('data-i18n-aria')));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(lang, el.getAttribute('data-i18n-placeholder'));
  });
  document.getElementById('credits-created-by').textContent = t(lang, 'settings.credits', { name: 'Zenderxis' });
}

function populateLanguageSelect() {
  const select = document.getElementById('language-select');
  select.innerHTML = '';
  LANGUAGES.forEach((l) => {
    const opt = document.createElement('option');
    opt.value = l.code;
    opt.textContent = `${l.flag} ${l.native}`;
    select.appendChild(opt);
  });
  select.value = state.language || 'en';
}

function persist() {
  window.tracker.saveData(state);
}

// ---------- window controls ----------

function wireStaticControls() {
  document.getElementById('btn-reload').addEventListener('click', () => window.tracker.reloadApp());
  document.getElementById('btn-min').addEventListener('click', () => window.tracker.minimize());
  document.getElementById('btn-max').addEventListener('click', () => window.tracker.maximize());
  document.getElementById('btn-close').addEventListener('click', () => window.tracker.closeWindow());

  document.getElementById('language-select').addEventListener('change', (e) => {
    state.language = e.target.value;
    persist();
    applyTranslations();
    renderAll();
  });

  document.getElementById('report-issue-btn').addEventListener('click', () => {
    window.tracker.openExternal(`${GITHUB_REPO_URL}/issues/new`);
  });

  document.getElementById('credits-reddit').addEventListener('click', (e) => {
    e.preventDefault();
    window.tracker.openExternal(REDDIT_URL);
  });

  document.getElementById('btn-settings').addEventListener('click', () => setSettingsOpen(true));
  document.getElementById('settings-close').addEventListener('click', () => setSettingsOpen(false));
  document.getElementById('settings-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'settings-overlay') setSettingsOpen(false);
  });

  // Escape closes Settings immediately, same as the X button and clicking
  // the backdrop. No confirm — every edit in Settings already saves as it's
  // made (see persist() calls throughout), so there's nothing to lose by
  // closing, and whatever was changed stays changed either way.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('settings-overlay').classList.contains('open')) return;
    setSettingsOpen(false);
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('page-prev').addEventListener('click', () => stepPage(-1));
  document.getElementById('page-next').addEventListener('click', () => stepPage(1));

  // Second pair of page arrows, flanking the tile row itself (above the
  // adjacent-page previews) — same stepPage() as the ones in .page-nav below,
  // just a closer-to-hand way to flip pages without reaching down.
  document.getElementById('page-prev-side').addEventListener('click', () => stepPage(-1));
  document.getElementById('page-next-side').addEventListener('click', () => stepPage(1));

  document.getElementById('import-xlsx-btn').addEventListener('click', importFromSheet);

  document.getElementById('open-xlsx-btn').addEventListener('click', async () => {
    const result = await window.tracker.openBattlepassXlsx();
    if (!result.opened) {
      const lang = state.language || 'en';
      alert(result.reason === 'no-file' ? t(lang, 'settings.openXlsxMissing') : `Couldn't open battlepass.xlsx: ${result.error || 'unknown error'}`);
    }
  });

  document.getElementById('export-xlsx-btn').addEventListener('click', () => exportSheet('xlsx'));

  document.getElementById('create-xlsx-btn').addEventListener('click', () => createStarterSheet('xlsx'));
  document.getElementById('create-csv-btn').addEventListener('click', () => createStarterSheet('csv'));

  // Clears claims + owned counts only — levels, document types, and the
  // spreadsheet link stay exactly as they are, so this is "play through
  // the same Battlepass again from scratch", not a teardown.
  document.getElementById('reset-progress-btn').addEventListener('click', () => {
    const lang = state.language || 'en';
    if (!confirm(t(lang, 'settings.resetProgressConfirm'))) return;
    state.claims = {};
    MODE_ORDER.forEach((m) => { state.modes[m].owned = {}; });
    persist();
    viewedPage = null;
    setSettingsOpen(false);
    renderAll();
  });

  // Wipes app state back to DEFAULT_STATE (main.js is the single source of
  // truth for that shape — see data:factoryReset). Does NOT touch the real
  // battlepass.xlsx/.csv file on disk, only the app's own saved state, so
  // Import spreadsheet immediately after this reloads everything from the
  // same file — this is a reset of the app, not of your actual spreadsheet
  // work.
  document.getElementById('full-reset-btn').addEventListener('click', async () => {
    const lang = state.language || 'en';
    if (!confirm(t(lang, 'settings.fullResetConfirm'))) return;
    state = await window.tracker.factoryReset();
    viewedPage = null;
    sidebarMode = 'pvp';
    setSettingsOpen(false);
    populateLanguageSelect();
    applyTranslations();
    renderAll();
  });

  document.getElementById('claim-mode-toggle').addEventListener('click', () => {
    state.claimMode = !state.claimMode;
    persist();
    renderAll();
  });

  // Quick off-switch on the main-tab banner — only reachable while Claim
  // Mode is actually on (the banner itself is hidden otherwise), so the
  // user isn't forced back into Settings just to turn it off.
  document.getElementById('claim-mode-banner-off').addEventListener('click', () => {
    state.claimMode = false;
    persist();
    renderAll();
  });

  document.getElementById('unclaim-mode-toggle').addEventListener('click', () => {
    state.unclaimMode = !state.unclaimMode;
    persist();
    renderAll();
  });

  // Same quick off-switch pattern as the Claim Mode banner above.
  document.getElementById('unclaim-mode-banner-off').addEventListener('click', () => {
    state.unclaimMode = false;
    persist();
    renderAll();
  });
}

function renderClaimMode() {
  const lang = state.language || 'en';

  const toggleBtn = document.getElementById('claim-mode-toggle');
  toggleBtn.textContent = t(lang, state.claimMode ? 'common.on' : 'common.off');
  toggleBtn.classList.toggle('on', !!state.claimMode);

  document.getElementById('claim-mode-banner').style.display = state.claimMode ? 'flex' : 'none';

  const unclaimToggleBtn = document.getElementById('unclaim-mode-toggle');
  unclaimToggleBtn.textContent = t(lang, state.unclaimMode ? 'common.on' : 'common.off');
  unclaimToggleBtn.classList.toggle('on', !!state.unclaimMode);

  document.getElementById('unclaim-mode-banner').style.display = state.unclaimMode ? 'flex' : 'none';
}

function setSettingsOpen(open) {
  document.getElementById('settings-overlay').classList.toggle('open', open);
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${tab}`));

  if (tab === 'map') {
    window.tracker.openMap();
  } else {
    window.tracker.closeMap();
  }
}

// ---------- shared helpers ----------

function ownedTotal(modeKey) {
  const mode = state.modes[modeKey];
  return Object.values(mode.owned).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

function ownedCount(modeKey, typeName) {
  return Number(state.modes[modeKey].owned[typeName]) || 0;
}

function setOwnedCount(modeKey, typeName, value) {
  const n = Math.max(0, Number(value) || 0);
  state.modes[modeKey].owned[typeName] = n;
}

function canAffordLevel(level, modeKey) {
  return Object.entries(level.cost).every(([type, need]) => ownedCount(modeKey, type) >= need);
}

function levelDeficits(level, modeKey) {
  return Object.entries(level.cost).map(([type, need]) => {
    const have = ownedCount(modeKey, type);
    return { type, need, have, met: have >= need };
  });
}

// ---------- pages ----------
//
// The Battlepass isn't claimed in strict level order — it's organized into pages
// (the xlsx's Page column). Within an unlocked page, any reward can be claimed in
// any order. Claiming N rewards from page P unlocks page P+1 (N = pageThresholds[P+1]).
// Page 1 has no prerequisite. Claiming is account-wide (state.claims), but which
// mode's documents pay for a claim is a per-claim choice.

function pageNumbers() {
  const set = new Set(state.levels.map((l) => l.page || 1));
  return [...set].sort((a, b) => a - b);
}

function levelsForPage(pageNum) {
  return state.levels.filter((l) => (l.page || 1) === pageNum).sort((a, b) => (a.id || 0) - (b.id || 0));
}

// state.claims maps claimed level id -> the mode that paid for it (or null for
// legacy claims migrated without that info — those can be un-marked but not
// refunded, since we don't know which mode's documents to give back).
function isClaimed(levelId) {
  return state.claims && Object.prototype.hasOwnProperty.call(state.claims, levelId);
}

function claimedCountForPage(pageNum) {
  return levelsForPage(pageNum).filter((l) => isClaimed(l.id)).length;
}

function pageThresholdFor(pageNum) {
  const v = state.pageThresholds ? state.pageThresholds[pageNum] : undefined;
  return v === undefined ? 4 : v;
}

function isPageUnlocked(pageNum) {
  const pages = pageNumbers();
  const idx = pages.indexOf(pageNum);
  if (idx <= 0) return true;
  const prevPage = pages[idx - 1];
  return claimedCountForPage(prevPage) >= pageThresholdFor(pageNum);
}

// Claim Mode (Settings toggle) bypasses the affordability check entirely and
// skips deducting documents — an override for corrections/testing. Claims made
// this way are marked `forced: true` so unclaiming them doesn't refund
// documents that were never actually taken.
function claimLevel(level, modeKey) {
  if (isClaimed(level.id) || !isPageUnlocked(level.page || 1)) return;
  // Belt-and-suspenders: the Claim button is already disabled for this case
  // (see buildTile()), but never allow claiming a level with no cost data
  // even if this somehow gets called another way — Claim Mode included,
  // since "skip the cost check" isn't the same as "there was nothing to
  // check in the first place".
  if (Object.keys(level.cost || {}).length === 0) return;
  const forced = !!state.claimMode;
  if (!forced && !canAffordLevel(level, modeKey)) return;
  if (!forced) {
    Object.entries(level.cost).forEach(([type, need]) => {
      setOwnedCount(modeKey, type, ownedCount(modeKey, type) - need);
    });
  }
  state.claims[level.id] = { mode: modeKey, forced };
  persist();
  renderAll();
}

// Reverses a claim: refunds the documents to whichever mode paid for it (unless
// it was a forced claim, which never deducted anything to begin with), and
// un-marks it (which can also re-lock later pages if this dropped the previous
// page's claimed count below its threshold — isPageUnlocked() just reflects
// that automatically since it recomputes from state.claims each time).
function unclaimLevel(level) {
  if (!isClaimed(level.id)) return;
  const claim = state.claims[level.id];
  if (claim && !claim.forced && claim.mode && state.modes[claim.mode]) {
    Object.entries(level.cost).forEach(([type, need]) => {
      setOwnedCount(claim.mode, type, ownedCount(claim.mode, type) + need);
    });
  }
  delete state.claims[level.id];
  persist();
  renderAll();
}

function stepPage(delta) {
  const pages = pageNumbers();
  if (!pages.length) return;
  const idx = Math.max(0, pages.indexOf(viewedPage));
  const target = idx + delta;
  if (target < 0 || target >= pages.length) return;
  viewedPage = pages[target];
  renderPage();
}

// The page to land on by default: the earliest unlocked page that still has
// an unclaimed reward, i.e. "where you left off". Falls back to the last page
// if everything's claimed, or the first page if there's no progress yet.
function defaultViewedPage() {
  const pages = pageNumbers();
  if (!pages.length) return null;
  const withProgress = pages.find((p) => isPageUnlocked(p) && levelsForPage(p).some((l) => !isClaimed(l.id)));
  return withProgress !== undefined ? withProgress : pages[pages.length - 1];
}

// ---------- render orchestration ----------

function renderAll() {
  if (viewedPage === null || !pageNumbers().includes(viewedPage)) {
    viewedPage = defaultViewedPage();
  }
  renderClaimMode();
  renderPage();
  renderSidebar();
  renderLevelEditor();
  renderLevelStatusList();
}

// ---------- Main tab: page navigator + tile grid ----------

const PREVIEW_COUNT = 2;

function renderPage() {
  const pages = pageNumbers();
  const prevBtn = document.getElementById('page-prev');
  const nextBtn = document.getElementById('page-next');
  const prevSideBtn = document.getElementById('page-prev-side');
  const nextSideBtn = document.getElementById('page-next-side');
  const titleEl = document.getElementById('page-nav-title');
  const statusEl = document.getElementById('page-nav-status');
  const grid = document.getElementById('tile-grid');
  const prevPreview = document.getElementById('tile-preview-prev');
  const nextPreview = document.getElementById('tile-preview-next');

  const lang = state.language || 'en';

  // pages/levels/document types are always populated now (hardcoded season
  // structure — see lib/battlepass-data.js), so there's no "nothing to show
  // yet" state to handle here anymore; the only thing that can still be
  // missing is cost data for a given level, which buildTile() gates the
  // Claim button on individually, not something the whole page needs to
  // wait on.
  const idx = pages.indexOf(viewedPage);
  titleEl.textContent = t(lang, 'main.pageTitle', { page: viewedPage, total: pages[pages.length - 1] });
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= pages.length - 1;
  prevSideBtn.disabled = prevBtn.disabled;
  nextSideBtn.disabled = nextBtn.disabled;

  const unlocked = isPageUnlocked(viewedPage);
  const claimedHere = claimedCountForPage(viewedPage);
  const totalHere = levelsForPage(viewedPage).length;
  if (!unlocked) {
    const prevPage = pages[idx - 1];
    const need = pageThresholdFor(viewedPage);
    const have = claimedCountForPage(prevPage);
    statusEl.textContent = t(lang, 'main.pageStatusLocked', { deficit: need - have, page: prevPage, have, need });
  } else {
    statusEl.textContent = t(lang, 'main.pageStatusClaimed', { claimed: claimedHere, total: totalHere });
  }

  // Flanking previews always reserve the same width (see .tile-preview in CSS)
  // whether or not there's an adjacent page, so the current page's tiles stay
  // centered in the same spot regardless — page 1's empty prev preview included.
  prevPreview.innerHTML = '';
  if (idx > 0) {
    levelsForPage(pages[idx - 1]).slice(-PREVIEW_COUNT).forEach((l) => {
      prevPreview.appendChild(buildPreviewTile(l));
    });
  }
  nextPreview.innerHTML = '';
  if (idx < pages.length - 1) {
    levelsForPage(pages[idx + 1]).slice(0, PREVIEW_COUNT).forEach((l) => {
      nextPreview.appendChild(buildPreviewTile(l));
    });
  }

  renderPageNeeds(viewedPage);

  const levels = levelsForPage(viewedPage);
  if (!levels.length) {
    grid.innerHTML = `<div class="empty-state">${escapeHtml(t(lang, 'main.noRewardsOnPage'))}</div>`;
    return;
  }

  grid.innerHTML = '';
  levels.forEach((level) => grid.appendChild(buildTile(level, unlocked)));
}

// Totals still needed to finish the current page: for each document type, sum
// the *total* cost across every unclaimed tile on the page first, then
// subtract what's currently owned (in sidebarMode) once — not a per-tile
// independent deficit — so two tiles both needing the same document type
// correctly share one inventory instead of each being checked against the
// same static owned count (which would under-count what's actually missing).
function pageNeeds(pageNum) {
  const totalNeeded = {};
  levelsForPage(pageNum).forEach((level) => {
    if (isClaimed(level.id)) return;
    Object.entries(level.cost).forEach(([type, need]) => {
      totalNeeded[type] = (totalNeeded[type] || 0) + need;
    });
  });
  const deficits = {};
  Object.entries(totalNeeded).forEach(([type, total]) => {
    const remaining = Math.max(0, total - ownedCount(sidebarMode, type));
    if (remaining > 0) deficits[type] = remaining;
  });
  return deficits;
}

// .page-needs (the icon-chip row) stays visible and reserves its full height
// (see CSS min-height) in every normal case, even when it ends up empty —
// only cleared/emptied, never display:none'd — so the tile row below it
// never shifts depending on whether there happen to be any chips to show.
// Only the true "no pages loaded at all" case hides everything, since that's
// a fundamentally different (pre-import) state, not something that should be
// visually consistent with the normal claimed/unclaimed states.
function renderPageNeeds(pageNum) {
  const wrap = document.getElementById('page-needs');
  const heading = document.getElementById('page-needs-heading');

  if (pageNum === null) {
    wrap.innerHTML = '';
    heading.style.display = 'none';
    return;
  }

  heading.style.display = 'block';
  const lang = state.language || 'en';

  const levels = levelsForPage(pageNum);
  const allClaimed = levels.length > 0 && levels.every((l) => isClaimed(l.id));
  if (allClaimed) {
    heading.textContent = t(lang, 'main.pageComplete');
    heading.className = 'page-needs-heading complete';
    wrap.innerHTML = '';
    return;
  }

  const deficits = pageNeeds(pageNum);
  const orderedTypes = orderedSidebarDocTypes().filter((docType) => deficits[docType] > 0);

  heading.textContent = t(lang, 'main.pageNeedsHeading');
  heading.className = 'page-needs-heading';
  wrap.innerHTML = '';
  orderedTypes.forEach((typeName) => {
    wrap.appendChild(buildPageNeedItem(typeName, deficits[typeName]));
  });
}

function buildPageNeedItem(typeName, amount) {
  const wrap = document.createElement('div');
  wrap.className = 'page-need-item';

  const icon = document.createElement('img');
  icon.className = 'page-need-icon';
  icon.alt = '';
  const iconCandidates = docTypeIconCandidates(typeName);
  icon.src = iconCandidates[0];
  icon.dataset.candidates = JSON.stringify(iconCandidates);
  icon.dataset.idx = '0';
  icon.addEventListener('error', () => docTypeIconFallback(icon));
  attachDocTypeTooltip(icon, typeName);

  const count = document.createElement('span');
  count.className = 'page-need-count';
  count.textContent = amount;

  wrap.append(icon, count);
  return wrap;
}

function buildPreviewTile(level) {
  const tile = document.createElement('div');
  tile.className = 'preview-tile';
  tile.title = `${level.reward || t(state.language || 'en', 'tile.untitledReward')} — page ${level.page}`;
  tile.addEventListener('click', () => {
    viewedPage = level.page;
    renderPage();
  });

  const photoUrlValue = photoUrl(level.itemName);
  const photo = document.createElement('div');
  photo.className = 'preview-tile-photo';
  if (photoUrlValue) {
    const img = document.createElement('img');
    img.src = photoUrlValue;
    img.alt = '';
    img.addEventListener('error', () => img.remove());
    photo.appendChild(img);
  }
  tile.appendChild(photo);

  return tile;
}

function buildTile(level, pageUnlocked) {
  const lang = state.language || 'en';
  const claimed = isClaimed(level.id);
  const tile = document.createElement('div');
  tile.className = 'reward-tile' + (claimed ? ' claimed' : '') + (!pageUnlocked && !claimed ? ' locked' : '');

  if (claimed) {
    const badge = document.createElement('div');
    badge.className = 'reward-tile-check';
    badge.textContent = '✓';
    tile.appendChild(badge);
  }

  const photoUrlValue = photoUrl(level.itemName);
  const photo = document.createElement('div');
  photo.className = 'reward-tile-photo';
  if (photoUrlValue) {
    const img = document.createElement('img');
    img.src = photoUrlValue;
    img.alt = '';
    img.addEventListener('error', () => img.remove());
    photo.appendChild(img);
  }
  tile.appendChild(photo);

  const name = document.createElement('div');
  name.className = 'reward-tile-name';
  name.textContent = level.reward || t(lang, 'tile.untitledReward');
  name.title = level.reward || '';
  tile.appendChild(name);

  // A level with no cost data yet (fresh install, or costs simply never
  // filled in for this one) can't be claimed regardless of documents owned
  // or Claim Mode — there's nothing to check affordability against. Fill it
  // in via the Levels section in Settings, or import/create a spreadsheet.
  const hasCostData = Object.keys(level.cost || {}).length > 0;

  const costRow = document.createElement('div');
  costRow.className = 'reward-tile-cost';
  if (hasCostData) {
    Object.entries(level.cost).forEach(([type, need]) => {
      costRow.appendChild(buildCostIcon(type, need));
    });
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'reward-tile-cost-missing';
    placeholder.textContent = t(lang, 'tile.costsNotSet');
    costRow.appendChild(placeholder);
  }
  tile.appendChild(costRow);

  if (pageUnlocked && !claimed) {
    // Single claim button, scoped to whichever mode's tab is currently active in
    // the inventory sidebar — no mode selection step on the tile itself anymore.
    // Switching sidebar tabs re-renders the tile grid (see the tab click handler
    // in renderSidebar()), so this button's affordability/label stays in sync.
    const affordable = hasCostData && (state.claimMode || canAffordLevel(level, sidebarMode));
    const btn = document.createElement('button');
    btn.className = 'primary claim-btn';
    btn.textContent = t(lang, 'tile.claimButton', { mode: MODE_SHORT[sidebarMode] });
    btn.disabled = !affordable;
    if (!hasCostData) {
      btn.title = t(lang, 'tile.costsNotSetTooltip');
    } else if (!affordable) {
      const deficits = levelDeficits(level, sidebarMode).filter((d) => !d.met);
      btn.title = t(lang, 'tile.needPrefix') + deficits
        .map((d) => t(lang, 'tile.deficitItem', { amount: d.need - d.have, type: d.type }))
        .join(', ');
    }
    btn.addEventListener('click', () => claimLevel(level, sidebarMode));
    tile.appendChild(btn);
  } else if (claimed && state.unclaimMode) {
    // Unclaim button only renders at all while Unclaim Mode (Settings) is
    // on — off by default, so a claimed reward can't be undone by an
    // accidental click during normal play.
    const claim = state.claims[level.id];
    const unclaimBtn = document.createElement('button');
    unclaimBtn.className = 'unclaim-btn danger';
    unclaimBtn.textContent = t(lang, 'tile.unclaimButton');
    if (claim && claim.forced) {
      unclaimBtn.title = t(lang, 'tile.unclaimForced');
    } else if (claim && claim.mode && state.modes[claim.mode]) {
      unclaimBtn.title = t(lang, 'tile.unclaimRefund', { mode: state.modes[claim.mode].label });
    } else {
      unclaimBtn.title = t(lang, 'tile.unclaimLegacy');
    }
    unclaimBtn.addEventListener('click', () => unclaimLevel(level));
    tile.appendChild(unclaimBtn);
  }

  return tile;
}

// Reward tile cost counts reflect whichever mode's tab is currently selected
// in the inventory sidebar — switching PVE/PVP/PVPS there updates the numbers
// shown on every tile (see the tab click handler in renderSidebar()).
function buildCostIcon(typeName, need) {
  const owned = ownedCount(sidebarMode, typeName);
  const wrap = document.createElement('span');
  wrap.className = 'tile-cost-icon' + (owned >= need ? ' met' : '');

  const icon = document.createElement('img');
  icon.className = 'tile-cost-icon-img';
  icon.alt = '';
  const iconCandidates = docTypeIconCandidates(typeName);
  icon.src = iconCandidates[0];
  icon.dataset.candidates = JSON.stringify(iconCandidates);
  icon.dataset.idx = '0';
  icon.addEventListener('error', () => docTypeIconFallback(icon));
  attachDocTypeTooltip(icon, typeName);

  const count = document.createElement('span');
  count.className = 'tile-cost-count';

  const ownedSpan = document.createElement('span');
  ownedSpan.className = owned >= need ? 'tile-cost-owned met' : 'tile-cost-owned unmet';
  ownedSpan.textContent = owned;

  const needSpan = document.createElement('span');
  needSpan.className = 'tile-cost-need';
  needSpan.textContent = need;

  count.append(ownedSpan, '/', needSpan);

  wrap.append(icon, count);
  return wrap;
}

// ---------- Sidebar: tabs, one mode visible at a time ----------

// Fixed display order for the sidebar only (state.documentTypes itself, and every
// other list that uses it — Settings' doc type list, level editor's cost dropdown —
// keeps whatever order the spreadsheet/user gave it). Matched by keyword rather than
// exact name so renames/typos in the actual type names don't break the ordering.
const SIDEBAR_DOC_ORDER = ['financial', 'pmc', 'project', 'blueprints', 'test', 'user', 'medical', 'technical'];

function orderedSidebarDocTypes() {
  const priority = (typeName) => {
    const idx = SIDEBAR_DOC_ORDER.findIndex((keyword) => typeName.toLowerCase().includes(keyword));
    return idx === -1 ? SIDEBAR_DOC_ORDER.length : idx;
  };
  return [...state.documentTypes].sort((a, b) => priority(a) - priority(b));
}

function renderSidebar() {
  document.getElementById('main-sidebar').style.setProperty('--mode-color', MODE_COLOR[sidebarMode]);

  const tabs = document.getElementById('sidebar-mode-tabs');
  tabs.innerHTML = '';
  MODE_ORDER.forEach((modeKey) => {
    const btn = document.createElement('button');
    btn.className = 'sidebar-mode-tab' + (modeKey === sidebarMode ? ' active' : '');
    btn.style.setProperty('--mode-color', MODE_COLOR[modeKey]);
    btn.textContent = MODE_SHORT[modeKey];
    btn.title = `${state.modes[modeKey].label} — cap ${state.modes[modeKey].dailyCap}/day`;
    btn.addEventListener('click', () => {
      sidebarMode = modeKey;
      renderSidebar();
      renderPage(); // reward tile cost counts are scoped to sidebarMode — refresh them too
    });
    tabs.appendChild(btn);
  });

  const list = document.getElementById('sidebar-doc-list');
  list.innerHTML = '';

  // Document types are fixed (see lib/battlepass-data.js), always all 9 —
  // no "none yet" case to handle here anymore.
  orderedSidebarDocTypes().forEach((typeName) => {
    list.appendChild(buildSidebarDocRow(sidebarMode, typeName));
  });
}

function buildSidebarDocRow(modeKey, typeName) {
  const row = document.createElement('div');
  row.className = 'sidebar-doc-row';

  const icon = document.createElement('img');
  icon.className = 'doc-type-icon-lg';
  icon.alt = '';
  const iconCandidates = docTypeIconCandidates(typeName);
  icon.src = iconCandidates[0];
  icon.dataset.candidates = JSON.stringify(iconCandidates);
  icon.dataset.idx = '0';
  icon.addEventListener('error', () => docTypeIconFallback(icon));
  attachDocTypeTooltip(icon, typeName);

  const stepper = document.createElement('div');
  stepper.className = 'stepper';

  const minusBtn = document.createElement('button');
  minusBtn.textContent = '−';
  minusBtn.addEventListener('click', () => {
    setOwnedCount(modeKey, typeName, ownedCount(modeKey, typeName) - 1);
    persist();
    renderAll();
  });

  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = '0';
  countInput.value = String(ownedCount(modeKey, typeName));
  countInput.addEventListener('change', () => {
    setOwnedCount(modeKey, typeName, countInput.value);
    persist();
    renderAll();
  });

  const plusBtn = document.createElement('button');
  plusBtn.textContent = '+';
  plusBtn.addEventListener('click', () => {
    setOwnedCount(modeKey, typeName, ownedCount(modeKey, typeName) + 1);
    persist();
    renderAll();
  });

  stepper.append(minusBtn, countInput, plusBtn);
  row.append(icon, stepper);
  return row;
}

// ---------- reward photos ----------

// Photos live in data-source/reward-photos/<itemName>.png, matched by the xlsx's
// Item Name column (imported as level.itemName). Missing photos just don't render.
function photoUrl(itemName) {
  if (!itemName) return null;
  return `data-source/reward-photos/${encodeURIComponent(itemName)}.png`;
}

function photoImgTag(itemName, className) {
  const url = photoUrl(itemName);
  if (!url) return '';
  return `<img class="${className}" src="${url}" onerror="this.remove()" alt="" />`;
}

// Document-type icons live in data-source/document_types/<slug>.png. The slug is
// usually just the type name normalized to snake_case, but the user's own
// filenames use "documentation" where a column says "documents" in one case
// (financial_documents -> financial_documentation.png), so try a couple of
// documents/documentation/files variants before giving up.
function slugify(name) {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function docTypeIconCandidates(typeName) {
  const base = slugify(typeName);
  // 'documentts' catches data-source/document_types/classified_documentts.png
  // (the user's own typo on that filename) — only ever tried as a candidate
  // *target*, never a trigger, so it's harmless for every other type.
  const words = ['documents', 'documentation', 'files', 'documentts'];
  const variants = new Set([base]);
  words.forEach((a) => {
    if (base.endsWith('_' + a)) {
      words.forEach((b) => variants.add(base.slice(0, -a.length) + b));
    }
  });
  return [...variants].map((slug) => `data-source/document_types/${slug}.png`);
}

function docTypeIconFallback(img) {
  const candidates = JSON.parse(img.dataset.candidates.replace(/&quot;/g, '"'));
  const idx = Number(img.dataset.idx) + 1;
  if (idx < candidates.length) {
    img.dataset.idx = idx;
    img.src = candidates[idx];
  } else {
    img.remove();
  }
}

// ---------- Document-type map tooltip ----------
//
// Hovering any document-type icon anywhere in the app shows which maps that
// document type spawns on. Matched by the same keyword-substring approach as
// SIDEBAR_DOC_ORDER (robust to header typos/renames), user-supplied 2026-08-17
// — not derived from the spreadsheet, which has no map-location data.
const DOC_TYPE_MAPS = {
  financial: ['Customs', 'Streets of Tarkov', 'Interchange'],
  pmc: ['Reserve', 'Lighthouse', 'Icebreaker'],
  project: ['Factory', 'Reserve', 'Customs'],
  blueprints: ['Interchange', 'Factory', 'The Labyrinth'],
  test: ['Shoreline', 'Woods', 'Icebreaker'],
  user: ['Ground Zero', 'Streets of Tarkov', 'The Lab'],
  medical: ['The Lab', 'Ground Zero', 'The Labyrinth'],
  technical: ['Shoreline', 'Woods', 'Lighthouse'],
};

function docTypeMapsFor(typeName) {
  const lower = typeName.toLowerCase();
  const key = Object.keys(DOC_TYPE_MAPS).find((k) => lower.includes(k));
  return key ? DOC_TYPE_MAPS[key] : null;
}

// Classified documents aren't from the spreadsheet and don't get the
// wildcard-substitution mechanic wired into claiming/affordability anywhere in
// this app (deliberately, per the user 2026-08-17) — they're tracked in the
// sidebar purely as inventory, same as any other document type. This is just
// their flavor-text tooltip, matching the user's own screenshot of it.
const CLASSIFIED_TOOLTIP = {
  title: 'Classified documents',
  paragraphs: [
    'Classified information that somehow survived against all odds.',
    'A unique document that can be used in place of any other document required for the Battle Pass.',
  ],
  note: 'Available from the Expansion Hub.',
};

let docTooltipEl = null;

function ensureDocTooltip() {
  if (docTooltipEl) return docTooltipEl;
  docTooltipEl = document.createElement('div');
  docTooltipEl.className = 'doc-tooltip';
  document.body.appendChild(docTooltipEl);
  return docTooltipEl;
}

function showDocTooltip(anchorEl, typeName) {
  const el = ensureDocTooltip();

  if (typeName.toLowerCase().includes('classified')) {
    el.innerHTML = `
      <div class="doc-tooltip-title">${escapeHtml(CLASSIFIED_TOOLTIP.title)}</div>
      ${CLASSIFIED_TOOLTIP.paragraphs.map((p) => `<div class="doc-tooltip-para">${escapeHtml(p)}</div>`).join('')}
      <div class="doc-tooltip-note">${escapeHtml(CLASSIFIED_TOOLTIP.note)}</div>
    `;
  } else {
    const maps = docTypeMapsFor(typeName);
    if (!maps) return;
    el.innerHTML = `
      <div class="doc-tooltip-title">${escapeHtml(typeName)}</div>
      <div class="doc-tooltip-label">Maps</div>
      <ul class="doc-tooltip-maps">${maps.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
    `;
  }

  el.style.display = 'block';
  positionDocTooltip(el, anchorEl);
}

function positionDocTooltip(el, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const tipRect = el.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  let top = rect.top - tipRect.height - 8;
  if (top < 4) top = rect.bottom + 8; // not enough room above — flip below
  left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function hideDocTooltip() {
  if (docTooltipEl) docTooltipEl.style.display = 'none';
}

function attachDocTypeTooltip(el, typeName) {
  el.addEventListener('mouseenter', () => showDocTooltip(el, typeName));
  el.addEventListener('mouseleave', hideDocTooltip);
}

// ---------- Spreadsheet import/export ----------
//
// Levels and document types are fixed (see lib/battlepass-data.js on the
// main-process side) — a spreadsheet's only job now is carrying cost
// values, matched back to the app's own levels by id. Editing costs
// directly in the Levels section below is the primary workflow; these are
// the secondary, spreadsheet-based path for anyone who'd rather do that in
// a real grid, or wants an export/backup.

async function importFromSheet() {
  const ok = window.confirm(
    "This replaces your current document costs with whatever's in your " +
    'spreadsheet, matched by level. Levels the sheet has no row for keep ' +
    'their existing costs untouched. Continue?'
  );
  if (!ok) return;

  try {
    const result = await window.tracker.importCosts();
    applyImportedCosts(result.costsById);
    alert(
      `Imported costs for ${Object.keys(result.costsById).length} level(s) from "${result.sheetName}".` +
      formatValidationSummary(result.validation)
    );
  } catch (err) {
    alert(`Import failed: ${err.message || err}`);
  }
}

// Turns the "Total Documents" self-check (see importCosts() in main.js)
// into a plain-text block appended to the import success alert — only when
// there's actually something to say. Silent (empty string) if everything
// checks out.
function formatValidationSummary(validation) {
  if (!validation) return '';

  const lines = [];
  if (validation.mismatches.length) {
    lines.push('', `⚠ ${validation.mismatches.length} level(s) don't add up to their own Total Documents value:`);
    validation.mismatches.slice(0, 10).forEach((m) => {
      lines.push(`  Level ${m.level} (${m.reward || 'untitled'}): costs sum to ${m.sum}, should be ${m.stated}`);
    });
    if (validation.mismatches.length > 10) {
      lines.push(`  …and ${validation.mismatches.length - 10} more.`);
    }
  }

  if (validation.unknownLevels && validation.unknownLevels.length) {
    lines.push('', `⚠ Ignored ${validation.unknownLevels.length} row(s) with a Level value that doesn't match any real level: ${validation.unknownLevels.slice(0, 10).join(', ')}${validation.unknownLevels.length > 10 ? ', …' : ''}`);
  }

  if (validation.rowsChecked > 0 && validation.grandTotal !== validation.expectedTotal) {
    lines.push('', `⚠ Grand total across the rows imported is ${validation.grandTotal}, expected ${validation.expectedTotal} for the whole season (this is fine if you only imported some levels).`);
  }

  return lines.join('\n');
}

// Merges imported costs into state.levels by id — levels absent from the
// sheet (or the whole rest of the season, if only a few rows were imported)
// keep whatever cost they already had, never reset to empty.
function applyImportedCosts(costsById) {
  state.levels.forEach((level) => {
    if (Object.prototype.hasOwnProperty.call(costsById, level.id)) {
      level.cost = costsById[level.id];
    }
  });
  persist();
  renderAll();
}

function costsByIdFromState() {
  const costsById = {};
  state.levels.forEach((level) => { costsById[level.id] = level.cost; });
  return costsById;
}

async function exportSheet(format) {
  const result = await window.tracker.exportSheet(format, costsByIdFromState());
  if (result.exported) {
    alert(`Exported to ${result.filePath}`);
  } else if (result.reason !== 'canceled') {
    alert(`Export failed: ${result.reason || 'unknown error'}`);
  }
}

async function createStarterSheet(format) {
  const lang = state.language || 'en';
  const result = await window.tracker.createStarterSheet(format);
  if (result.copied) {
    alert(t(lang, 'settings.sheetCreated'));
  } else if (result.reason === 'already-exists') {
    alert(t(lang, 'settings.sheetAlreadyExists'));
  }
}

// ---------- Levels editor ----------

// Page/reward/item name/Total Documents are fixed (lib/battlepass-data.js
// on the main-process side) — nothing here to add, delete, reorder, or
// rename. Each card is just the one thing that's actually editable: this
// level's cost, one numeric input per document type, always all 9 slots
// shown (blank/0 same as "not needed"). A running sum next to the reward
// name shows how close that add up to this level's known Total Documents.
function renderLevelEditor() {
  const list = document.getElementById('level-editor-list');
  const lang = state.language || 'en';
  list.innerHTML = '';

  const sorted = [...state.levels].sort((a, b) => (a.page - b.page) || (a.id - b.id));
  sorted.forEach((level) => {
    const card = document.createElement('div');
    card.className = 'tier-editor-card';

    const head = document.createElement('div');
    head.className = 'tier-editor-card-head';

    const photoUrlValue = photoUrl(level.itemName);
    if (photoUrlValue) {
      const photoEl = document.createElement('img');
      photoEl.className = 'reward-photo-sm';
      photoEl.alt = '';
      photoEl.src = photoUrlValue;
      photoEl.addEventListener('error', () => photoEl.remove());
      head.appendChild(photoEl);
    }

    const info = document.createElement('div');
    info.className = 'tier-editor-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'tier-editor-name';
    nameEl.textContent = level.reward || t(lang, 'tile.untitledReward');
    const metaEl = document.createElement('div');
    metaEl.className = 'tier-editor-meta';
    metaEl.textContent = t(lang, 'settings.levelMeta', { page: level.page, level: level.id });
    info.append(nameEl, metaEl);
    head.appendChild(info);

    const sumEl = document.createElement('div');
    sumEl.className = 'tier-editor-sum';
    head.appendChild(sumEl);

    const refreshSum = () => {
      const sum = state.documentTypes.reduce((s, type) => s + (level.cost[type] || 0), 0);
      sumEl.textContent = `${sum} / ${level.totalDocuments}`;
      sumEl.className = 'tier-editor-sum' + (sum === level.totalDocuments ? ' met' : ' unmet');
    };

    const costGrid = document.createElement('div');
    costGrid.className = 'cost-grid';
    state.documentTypes.forEach((type) => {
      costGrid.appendChild(buildLevelCostCell(level, type, refreshSum));
    });

    refreshSum();

    card.append(head, costGrid);
    list.appendChild(card);
  });
}

// Same icon-on-top + (−/count/+) stepper shape as the inventory sidebar's
// buildSidebarDocRow(), so entering costs here feels like the same widget —
// just setting a target number instead of an owned count. All 9 sit in one
// non-wrapping row (see .cost-grid in styles.css), same as the sidebar's
// document row.
function buildLevelCostCell(level, type, onUpdate) {
  const cell = document.createElement('div');
  cell.className = 'cost-grid-cell';

  const icon = document.createElement('img');
  icon.className = 'doc-type-icon-md';
  icon.alt = '';
  const iconCandidates = docTypeIconCandidates(type);
  icon.src = iconCandidates[0];
  icon.dataset.candidates = JSON.stringify(iconCandidates);
  icon.dataset.idx = '0';
  icon.addEventListener('error', () => docTypeIconFallback(icon));
  attachDocTypeTooltip(icon, type);

  const setCost = (n) => {
    const clamped = Math.max(0, Number(n) || 0);
    if (clamped > 0) level.cost[type] = clamped;
    else delete level.cost[type];
    persist();
    onUpdate();
    renderPage(); // reflect the new cost on the tile/needs-widget immediately
  };

  const stepper = document.createElement('div');
  stepper.className = 'stepper';

  const minusBtn = document.createElement('button');
  minusBtn.textContent = '−';
  minusBtn.addEventListener('click', () => {
    setCost((level.cost[type] || 0) - 1);
    countInput.value = String(level.cost[type] || 0);
  });

  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = '0';
  countInput.value = String(level.cost[type] || 0);
  countInput.addEventListener('change', () => {
    setCost(countInput.value);
    countInput.value = String(level.cost[type] || 0);
  });

  const plusBtn = document.createElement('button');
  plusBtn.textContent = '+';
  plusBtn.addEventListener('click', () => {
    setCost((level.cost[type] || 0) + 1);
    countInput.value = String(level.cost[type] || 0);
  });

  stepper.append(minusBtn, countInput, plusBtn);
  cell.append(icon, stepper);
  return cell;
}

// ---------- Manage section: compact all-levels status reference ----------

function renderLevelStatusList() {
  const list = document.getElementById('level-status-list');
  if (!list) return;

  if (!state.levels.length) {
    list.innerHTML = `<div class="empty-state">Nothing here yet.</div>`;
    return;
  }
  const sorted = [...state.levels].sort((a, b) => (a.page || 1) - (b.page || 1) || (a.id || 0) - (b.id || 0));
  list.innerHTML = sorted.map((level) => {
    const claimed = isClaimed(level.id);
    const unlocked = isPageUnlocked(level.page || 1);
    const status = claimed ? 'done' : (unlocked ? 'current' : 'locked');
    const badgeText = claimed ? 'Claimed' : (unlocked ? 'Available' : 'Locked');
    return `
      <div class="tier-row status-${status}">
        <div class="tier-row-main">
          <span class="tier-num">P${level.page || 1}</span>
          ${photoImgTag(level.itemName, 'reward-photo-sm')}
          <span class="tier-reward-name">${escapeHtml(level.reward || 'Untitled reward')}</span>
        </div>
        <span class="tier-badge ${status}">${badgeText}</span>
      </div>
    `;
  }).join('');
}

// ---------- utils ----------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

boot();
