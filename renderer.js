const MODE_ORDER = ['pve', 'pvp', 'pvpSeason'];
const MODE_SHORT = { pve: 'PVE', pvp: 'PVP', pvpSeason: 'PVPS' };
const MODE_COLOR = { pve: '#abc4c9', pvp: '#f1a983', pvpSeason: '#55bb9b' };

const GITHUB_REPO_URL = 'https://github.com/zenderxis/tarkov-battlepass-tracker';
const REDDIT_URL = 'https://www.reddit.com/user/Zenderxis';

let state = null;
let viewedPage = null;
let sidebarMode = 'pvp';
// Whether data-source/battlepass.xlsx exists on disk — checked once at boot.
// It's gitignored (personal data, see scripts/generate-template.js), so on a
// fresh clone/install it genuinely won't exist yet; the "no levels" empty
// state branches on this to offer copying the starter template instead of
// just pointing at Import (which would otherwise fail with a raw
// file-not-found error the first time someone tries it).
let xlsxSourceExists = true;

// ---------- boot ----------

async function boot() {
  state = await window.tracker.loadData();
  xlsxSourceExists = await window.tracker.xlsxSourceExists();
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

  document.getElementById('feedback-btn').addEventListener('click', () => {
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

  document.getElementById('add-doc-type-btn').addEventListener('click', addDocType);
  document.getElementById('new-doc-type').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addDocType();
  });

  document.getElementById('import-xlsx-btn').addEventListener('click', importFromXlsx);

  document.getElementById('open-xlsx-btn').addEventListener('click', async () => {
    const result = await window.tracker.openBattlepassXlsx();
    if (!result.opened) {
      const lang = state.language || 'en';
      alert(result.reason === 'no-file' ? t(lang, 'settings.openXlsxMissing') : `Couldn't open battlepass.xlsx: ${result.error || 'unknown error'}`);
    }
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
  renderDocTypeNameList();
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

  if (!pages.length) {
    titleEl.textContent = t(lang, 'main.noPagesYet');
    statusEl.textContent = '';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    prevSideBtn.disabled = true;
    nextSideBtn.disabled = true;
    grid.innerHTML = '';
    grid.appendChild(xlsxSourceExists ? buildSimpleEmptyState(t(lang, 'main.noLevelsSetUp')) : buildOnboardingEmptyState());
    prevPreview.innerHTML = '';
    nextPreview.innerHTML = '';
    renderPageNeeds(null);
    return;
  }

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

function buildSimpleEmptyState(text) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.textContent = text;
  return div;
}

// First-run empty state: data-source/battlepass.xlsx doesn't exist yet
// (gitignored — everyone's own document breakdown is personal, see
// scripts/generate-template.js), so rather than pointing at Import and
// having it fail with a raw file-not-found error, offer to copy the
// blank starter template into place as the actual next step.
function buildOnboardingEmptyState() {
  const lang = state.language || 'en';
  const wrap = document.createElement('div');
  wrap.className = 'empty-state onboarding';

  const body = document.createElement('p');
  body.textContent = t(lang, 'main.onboardingNoSource');
  wrap.appendChild(body);

  const btn = document.createElement('button');
  btn.className = 'primary';
  btn.textContent = t(lang, 'main.copyTemplateButton');
  btn.addEventListener('click', async () => {
    const result = await window.tracker.copyTemplateXlsx();
    if (result.copied) {
      xlsxSourceExists = true;
      alert(t(lang, 'main.templateCopied'));
      renderPage();
    } else if (result.reason === 'already-exists') {
      // Someone else (or a previous click) already created it — just
      // reflect that instead of erroring.
      xlsxSourceExists = true;
      renderPage();
    } else {
      alert(`Couldn't find the starter template (data-source/battlepass.template.xlsx). Run "node scripts/generate-template.js" or ask whoever set up this copy of the app.`);
    }
  });
  wrap.appendChild(btn);

  return wrap;
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

  const costRow = document.createElement('div');
  costRow.className = 'reward-tile-cost';
  Object.entries(level.cost).forEach(([type, need]) => {
    costRow.appendChild(buildCostIcon(type, need));
  });
  tile.appendChild(costRow);

  if (pageUnlocked && !claimed) {
    // Single claim button, scoped to whichever mode's tab is currently active in
    // the inventory sidebar — no mode selection step on the tile itself anymore.
    // Switching sidebar tabs re-renders the tile grid (see the tab click handler
    // in renderSidebar()), so this button's affordability/label stays in sync.
    const affordable = state.claimMode || canAffordLevel(level, sidebarMode);
    const btn = document.createElement('button');
    btn.className = 'primary claim-btn';
    btn.textContent = t(lang, 'tile.claimButton', { mode: MODE_SHORT[sidebarMode] });
    btn.disabled = !affordable;
    if (!affordable) {
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

  const orderedTypes = orderedSidebarDocTypes();
  if (!orderedTypes.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = t(state.language || 'en', 'sidebar.noDocTypes');
    list.appendChild(empty);
    return;
  }
  orderedTypes.forEach((typeName) => {
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

// ---------- Manage section: document type names (add/rename/remove) ----------

function renderDocTypeNameList() {
  const list = document.getElementById('doc-type-name-list');
  if (!state.documentTypes.length) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(t(state.language || 'en', 'settings.noDocTypesYet'))}</div>`;
    return;
  }

  list.innerHTML = '';
  state.documentTypes.forEach((typeName) => {
    const row = document.createElement('div');
    row.className = 'doc-type-row';

    const icon = document.createElement('img');
    icon.className = 'doc-type-icon';
    icon.alt = '';
    const iconCandidates = docTypeIconCandidates(typeName);
    icon.src = iconCandidates[0];
    icon.dataset.candidates = JSON.stringify(iconCandidates);
    icon.dataset.idx = '0';
    icon.addEventListener('error', () => docTypeIconFallback(icon));
    attachDocTypeTooltip(icon, typeName);
    row.appendChild(icon);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'doc-name';
    nameInput.value = typeName;
    nameInput.addEventListener('change', () => renameDocType(typeName, nameInput.value));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger';
    deleteBtn.textContent = 'Remove';
    deleteBtn.addEventListener('click', () => removeDocType(typeName));

    row.append(nameInput, deleteBtn);
    list.appendChild(row);
  });
}

function addDocType() {
  const input = document.getElementById('new-doc-type');
  const name = input.value.trim();
  if (!name || state.documentTypes.includes(name)) return;
  state.documentTypes.push(name);
  MODE_ORDER.forEach((m) => { state.modes[m].owned[name] = 0; });
  input.value = '';
  persist();
  renderAll();
}

function renameDocType(oldName, newNameRaw) {
  const newName = newNameRaw.trim();
  if (!newName || newName === oldName) {
    renderDocTypeNameList();
    return;
  }
  if (state.documentTypes.includes(newName)) {
    renderDocTypeNameList();
    return;
  }
  state.documentTypes = state.documentTypes.map((n) => (n === oldName ? newName : n));
  MODE_ORDER.forEach((m) => {
    const owned = state.modes[m].owned;
    owned[newName] = owned[oldName] || 0;
    delete owned[oldName];
  });
  state.levels.forEach((level) => {
    if (Object.prototype.hasOwnProperty.call(level.cost, oldName)) {
      level.cost[newName] = level.cost[oldName];
      delete level.cost[oldName];
    }
  });
  persist();
  renderAll();
}

function removeDocType(name) {
  state.documentTypes = state.documentTypes.filter((n) => n !== name);
  MODE_ORDER.forEach((m) => { delete state.modes[m].owned[name]; });
  state.levels.forEach((level) => { delete level.cost[name]; });
  persist();
  renderAll();
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

// ---------- Excel import ----------

async function importFromXlsx() {
  const ok = window.confirm(
    'This replaces all Levels and Document Types with what\'s currently in battlepass.xlsx.\n\n' +
    'Owned counts for document types that still exist are kept; claimed rewards are kept ' +
    '(any that no longer exist in the sheet are dropped). Continue?'
  );
  if (!ok) return;

  try {
    const result = await window.tracker.importXlsx();
    applyImportResult(result);
    alert(
      `Imported ${result.levels.length} levels and ${result.documentTypes.length} document types from "${result.sheetName}".` +
      formatValidationSummary(result.validation)
    );
  } catch (err) {
    alert(`Import failed: ${err.message || err}`);
  }
}

// Turns the "Total Documents" self-check (see parseBattlepassXlsx() in
// main.js) into a plain-text block appended to the import success alert —
// only when there's actually something to say. Silent (empty string) if the
// sheet has no usable "Total Documents" column, or everything checks out.
function formatValidationSummary(validation) {
  if (!validation || validation.rowsChecked === 0) return '';

  const lines = [];
  if (validation.mismatches.length) {
    lines.push('', `⚠ ${validation.mismatches.length} level(s) don't add up to their own "Total Documents" value:`);
    validation.mismatches.slice(0, 10).forEach((m) => {
      lines.push(`  Level ${m.level} (${m.reward || 'untitled'}): costs sum to ${m.sum}, sheet says ${m.stated}`);
    });
    if (validation.mismatches.length > 10) {
      lines.push(`  …and ${validation.mismatches.length - 10} more.`);
    }
  }

  if (validation.grandTotal !== validation.expectedTotal) {
    lines.push('', `⚠ Grand total across all levels is ${validation.grandTotal}, expected ${validation.expectedTotal} for this season.`);
  }

  return lines.join('\n');
}

function applyImportResult({ documentTypes, levels }) {
  const oldOwned = {};
  MODE_ORDER.forEach((m) => { oldOwned[m] = { ...state.modes[m].owned }; });

  state.documentTypes = documentTypes;
  state.levels = levels;

  MODE_ORDER.forEach((m) => {
    const owned = {};
    documentTypes.forEach((docType) => { owned[docType] = oldOwned[m][docType] || 0; });
    state.modes[m].owned = owned;
  });

  const validIds = new Set(levels.map((l) => l.id));
  Object.keys(state.claims).forEach((id) => {
    if (!validIds.has(Number(id))) delete state.claims[id];
  });
  viewedPage = null;

  persist();
  renderAll();
}

// ---------- Levels editor ----------

function renderLevelEditor() {
  const list = document.getElementById('level-editor-list');

  if (!state.levels.length) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(t(state.language || 'en', 'settings.noLevelsYet'))}</div>`;
    return;
  }

  list.innerHTML = '';
  state.levels.forEach((level, index) => {
    const card = document.createElement('div');
    card.className = 'tier-editor-card';

    const head = document.createElement('div');
    head.className = 'tier-editor-card-head';

    const pageInput = document.createElement('input');
    pageInput.type = 'number';
    pageInput.min = '1';
    pageInput.className = 'level-page-input';
    pageInput.title = 'Page number';
    pageInput.value = String(level.page || 1);
    pageInput.addEventListener('change', () => {
      level.page = Math.max(1, Number(pageInput.value) || 1);
      persist();
      viewedPage = null;
      renderAll();
    });

    const rewardInput = document.createElement('input');
    rewardInput.type = 'text';
    rewardInput.placeholder = 'Reward name (e.g. "Weapon skin")';
    rewardInput.value = level.reward || '';
    rewardInput.addEventListener('change', () => {
      level.reward = rewardInput.value;
      persist();
      renderPage();
      renderLevelStatusList();
    });

    const moveBtns = document.createElement('div');
    moveBtns.className = 'move-btns';

    const upBtn = document.createElement('button');
    upBtn.textContent = '↑';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => moveLevel(index, -1));

    const downBtn = document.createElement('button');
    downBtn.textContent = '↓';
    downBtn.disabled = index === state.levels.length - 1;
    downBtn.addEventListener('click', () => moveLevel(index, 1));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger';
    deleteBtn.textContent = 'Delete Level';
    deleteBtn.addEventListener('click', () => deleteLevel(level.id));

    moveBtns.append(upBtn, downBtn);
    head.append(pageInput);
    const photoUrlValue = photoUrl(level.itemName);
    if (photoUrlValue) {
      const photoEl = document.createElement('img');
      photoEl.className = 'reward-photo-sm';
      photoEl.alt = '';
      photoEl.src = photoUrlValue;
      photoEl.addEventListener('error', () => photoEl.remove());
      head.append(photoEl);
    }
    head.append(rewardInput, moveBtns, deleteBtn);

    const costList = document.createElement('div');
    costList.className = 'req-list';

    Object.entries(level.cost).forEach(([type, count]) => {
      costList.appendChild(buildCostRow(level, type, count));
    });

    const addCostBtn = document.createElement('button');
    addCostBtn.textContent = '+ Add Document Cost';
    addCostBtn.disabled = !state.documentTypes.length;
    addCostBtn.title = state.documentTypes.length ? '' : 'Add a document type above first';
    addCostBtn.addEventListener('click', () => {
      const availableType = state.documentTypes.find((t) => !(t in level.cost));
      if (!availableType) return;
      level.cost[availableType] = 1;
      persist();
      renderLevelEditor();
      renderPage();
    });

    card.append(head, costList, addCostBtn);
    list.appendChild(card);
  });
}

function buildCostRow(level, type, count) {
  const row = document.createElement('div');
  row.className = 'req-row';

  const icon = document.createElement('img');
  icon.className = 'doc-type-icon-xs';
  icon.alt = '';
  const iconCandidates = docTypeIconCandidates(type);
  icon.src = iconCandidates[0];
  icon.dataset.candidates = JSON.stringify(iconCandidates);
  icon.dataset.idx = '0';
  icon.addEventListener('error', () => docTypeIconFallback(icon));
  attachDocTypeTooltip(icon, type);
  row.appendChild(icon);

  const select = document.createElement('select');
  state.documentTypes.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    opt.selected = t === type;
    opt.disabled = t !== type && t in level.cost;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    const newType = select.value;
    if (newType === type) return;
    level.cost[newType] = level.cost[type];
    delete level.cost[type];
    persist();
    renderLevelEditor();
    renderPage();
  });

  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = '0';
  countInput.value = String(count);
  countInput.addEventListener('change', () => {
    level.cost[select.value] = Math.max(0, Number(countInput.value) || 0);
    persist();
    renderPage();
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'danger';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    delete level.cost[select.value];
    persist();
    renderLevelEditor();
    renderPage();
  });

  row.append(select, countInput, removeBtn);
  return row;
}

function moveLevel(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.levels.length) return;
  const [level] = state.levels.splice(index, 1);
  state.levels.splice(target, 0, level);
  persist();
  renderLevelEditor();
}

function deleteLevel(id) {
  state.levels = state.levels.filter((l) => l.id !== id);
  delete state.claims[id];
  persist();
  viewedPage = null;
  renderLevelEditor();
  renderAll();
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
