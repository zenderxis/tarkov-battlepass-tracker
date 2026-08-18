# Tarkov Battlepass Tracker

A desktop tracker for the Escape from Tarkov Battlepass. Enter what you're finding in raids, and it tells you exactly which document types you're still short on for the reward you're working toward — per game mode, per page of the Battlepass.

Not affiliated with Battlestate Games. "Escape from Tarkov" and "Battlepass" are their trademarks; this is a fan-made companion tool.

## Features

- **Page-gated progression** — the Battlepass is organized into pages of rewards. Claim any reward on an unlocked page in any order; claiming enough of them unlocks the next page.
- **Three game modes tracked separately** (PVE / PVP / PVP Season) — document costs are shared across modes, but what you've picked up isn't, since documents don't carry over between modes.
- **Adjacent-page previews** either side of your current page, so you can see what's coming up without leaving it.
- **Claim Mode** — an override to mark a reward claimed without the document-cost check (for corrections, not normal play).
- **Unclaim Mode** — off by default, so a claimed reward can't be undone by an accidental click; turn it on when you actually need to undo one.
- **Document map tooltips** — hover any document type to see which maps it drops on, sourced from [tarkovdocsmap.com](https://tarkovdocsmap.com/) (also embedded in its own tab).
- **18-language UI** — the app's own interface (not the map data) is available in English, Russian, Japanese, Chinese, Korean, Turkish, Spanish (Spain), Spanish (Mexico), German, Italian, French, Czech, Hungarian, Polish, Portuguese, Slovak, Romanian, and Vietnamese. See [i18n.js](i18n.js) for exactly what is and isn't translated, and why.
- **All 53 rewards and document types are built in** — the season's structure (which page each reward is on, its name, and its total document cost) is the same for every player, so it ships hardcoded and shows up immediately on first launch. The only thing you fill in yourself is the *document-type breakdown* per level, since that's genuinely personal — see **Setting up your own data** below.

## Getting started

### Windows installer (recommended)

Download the latest installer from the [Releases page](https://github.com/zenderxis/tarkov-battlepass-tracker/releases/latest), run it, and go. It sets up Start Menu and Desktop shortcuts for you — no Node.js, no command line.

### Building from source

For contributors, or if you'd rather not run a downloaded installer. Requires [Node.js](https://nodejs.org/) (which includes npm).

```bash
git clone https://github.com/zenderxis/tarkov-battlepass-tracker.git
cd tarkov-battlepass-tracker
npm install
npm start
```

`npm install` pulls down Electron the first time, which takes a minute or two. After that, `npm start` launches the app directly.

**Desktop shortcut**: right-click `launch.vbs` → **Send to** → **Desktop (create shortcut)** for a shortcut that launches the app with no console window behind it. `start.bat` does the same but leaves a terminal open, useful if something's going wrong and you want to see the output.

**Building your own installer**: `npm run dist` (Windows only) produces `dist/Tarkov Battlepass Tracker Setup <version>.exe` via [electron-builder](https://www.electron.build/). `npm run pack` builds an unpacked app folder for a quicker sanity check without generating the full installer.

## Setting up your own data

**This is the one manual step.** The season's structure — which page each reward is on, its name, and its total document cost — is hardcoded and identical for everyone, so it's already there when you launch. Every reward starts with its Claim button greyed out, though, because the *document-type breakdown* behind that total is personal: two players can need completely different document types for the exact same reward, even though the total is the same.

**Easiest path — edit costs directly in the app**: open **Settings** → **Levels**. Each level has a small grid, one input per document type; type in your numbers and they save immediately, no file involved. A running total next to each level shows your entered sum against the level's required total, so you can tell at a glance when a level is fully and correctly filled in — once it matches, that level's Claim button unlocks on the Main tab.

**Spreadsheet — a secondary option**, useful if you'd rather fill in numbers in a real grid, want a backup, or are moving your data to another install:

1. In **Settings**, use **Create (Excel)** or **Create (CSV)** under "No spreadsheet yet?" — CSV needs no spreadsheet software at all, it opens and edits fine in Notepad or any text editor. This writes a blank sheet (every reward's page, name, and `Total Documents` already filled in, document-type columns blank) to `%APPDATA%\TarkovBattlepassTracker\battlepass.xlsx` (or `.csv`).
2. Fill in your own numbers per document type, per reward. Each row's document-type columns should add up to that row's `Total Documents` value.
3. **Import spreadsheet** loads those numbers into the app, matched by level — matched rows overwrite that level's costs; levels the sheet has no row for keep whatever's already in the app. **Open spreadsheet** opens the file in whatever app Windows has associated with that file type; **Export spreadsheet** writes your current in-app costs back out to a file of your choosing, handy as a backup or for moving to another machine.

The importer checks your math for you: if a row's document-type columns don't add up to its `Total Documents` value, or the grand total across every level doesn't land on the expected season total, you'll get a warning listing exactly which rows are off.

## Data storage

Everything personal to you — `data.json` (owned document counts, claimed rewards, settings) and `battlepass.xlsx` or `battlepass.csv` (your document costs, whichever format you picked) — lives in `%APPDATA%\TarkovBattlepassTracker\`, outside the app's own install/source directory entirely.

Settings has two reset buttons under **Reset**: **Reset Progress** clears claimed rewards and owned document counts back to zero while keeping your entered cost data exactly as it is — "play through the same Battlepass again from scratch." **Full Reset** wipes the app's saved state entirely, including your entered costs, back to a blank install (your actual `battlepass.xlsx`/`.csv` file on disk is never touched, so re-importing afterward brings your costs straight back).

## Feedback / issues

Use the **Report Issue** button in Settings, or open an issue directly on this repo.

## Notes for future seasons

- The season's structure — the 9 document types and all 53 levels (page, reward name, item name, total documents) — lives in [`lib/battlepass-data.js`](lib/battlepass-data.js), the single source of truth every other piece of the app reads from (`main.js`'s default state, the spreadsheet builder, the importer's validation). Update it there for a new season; `EXPECTED_SEASON_TOTAL` in `main.js` (currently 501, Kord Breach) should be updated to match the new grand total at the same time.
- Blank starter spreadsheets and exports are generated on the fly from `lib/battlepass-data.js` via [`lib/build-sheet.js`](lib/build-sheet.js) — there's no static template file to keep in sync. `node scripts/generate-template.js` is only useful for producing a standalone copy for reference/testing outside the running app.
- If `tarkovdocsmap.com` changes URL or goes down, update `MAP_URL` in `main.js`.
- Document-type map tooltips (`DOC_TYPE_MAPS` in `renderer.js`) are English-only regardless of the selected UI language — see the scope note at the top of `i18n.js`.
- If the app icon (`data-source/app_resources/black_div.ico`) ever needs regenerating from new source art, `node scripts/generate-icon.js` rebuilds it from `black_div.png` at every size Windows actually needs (16 up to 256) — a plain single-size `.ico` will make `npm run dist` fail.

## Credits

Created by Zenderxis · Discord: Zenderxis · Reddit: [u/Zenderxis](https://www.reddit.com/user/Zenderxis)

## License

[MIT](LICENSE) for the app's own code. Bundled assets keep their own terms — see `data-source/bender/FREE FONT LICENSE.txt` for the Bender font (SIL Open Font License 1.1). Reward icons and document-type icons are Escape from Tarkov game assets, used here for identification purposes in a fan tool; they belong to Battlestate Games.
