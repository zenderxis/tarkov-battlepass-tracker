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
- Everything's driven by a spreadsheet you fill in yourself — see **Setting up your own data** below.

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

**This is the one manual step.** Document costs per Battlepass level are personal — two players can need completely different document *types* for the exact same reward, even though the reward's total document count is the same for everyone. Because of that, there's no pre-filled spreadsheet shipped with this app; you build your own from a blank template.

1. Launch the app. With no data yet, the Main tab offers two buttons: **Copy starter template (Excel)** and **Copy starter template (CSV)**. Pick whichever you can actually open — CSV needs no spreadsheet software at all, it opens and edits fine in Notepad or any text editor. Either one copies the blank template to `%APPDATA%\TarkovBattlepassTracker\battlepass.xlsx` (or `.csv`) — a real, editable file outside the app itself, so it survives updates/reinstalls.
2. Open that file. Every reward's page, name, and its overall `Total Documents` count are already filled in — only the per-document-type columns are blank.
3. Fill in your own numbers per document type, per reward. Each row's document-type columns should add up to that row's `Total Documents` value — if they don't, you've mistyped something.
4. In the app, open **Settings** → **Import spreadsheet**. Re-run this any time you edit the file; it's the intended workflow, easier than hand-editing levels in the app itself. **Open spreadsheet** right next to it opens whichever one you're using, in whatever app Windows has associated with that file type.

The importer checks your math for you: if a row's document-type columns don't add up to its `Total Documents` value, or the grand total across every level doesn't land on the expected season total, you'll get a warning listing exactly which rows are off.

If you're building from source and want fresh, correctly-structured templates (e.g. after adding new levels to your real sheet), regenerate both `data-source/battlepass.template.xlsx` and `.template.csv` — the ones the app copies from — with:

```bash
node scripts/generate-template.js
```

That reads from your actual in-use spreadsheet in `%APPDATA%` (falling back to the legacy in-project copy if you haven't launched the updated app yet) — only relevant if you're maintaining/extending the season's level data itself, not for normal use.

## Data storage

Everything personal to you — `data.json` (owned document counts, claimed rewards, settings) and `battlepass.xlsx` or `battlepass.csv` (your document costs, whichever format you picked) — lives in `%APPDATA%\TarkovBattlepassTracker\`, outside the app's own install/source directory entirely.

Settings has two reset buttons if you'd rather not do this by hand: **Reset Progress** clears claims and document counts back to zero while keeping your imported levels and document types; **Full Reset** wipes the app's saved state back to a blank install (your actual `battlepass.xlsx`/`.csv` file is never touched, so re-importing afterward brings everything straight back).

## Feedback / issues

Use the **Report Issue** button in Settings, or open an issue directly on this repo.

## Notes for future seasons

- `EXPECTED_SEASON_TOTAL` in `main.js` is hardcoded to 501 for the Kord Breach season's document-total sanity check — update it if a future season's total is different.
- If `tarkovdocsmap.com` changes URL or goes down, update `MAP_URL` in `main.js`.
- Document-type map tooltips (`DOC_TYPE_MAPS` in `renderer.js`) are English-only regardless of the selected UI language — see the scope note at the top of `i18n.js`.
- If the app icon (`data-source/app_resources/black_div.ico`) ever needs regenerating from new source art, `node scripts/generate-icon.js` rebuilds it from `black_div.png` at every size Windows actually needs (16 up to 256) — a plain single-size `.ico` will make `npm run dist` fail.

## Credits

Created by Zenderxis · Discord: Zenderxis · Reddit: [u/Zenderxis](https://www.reddit.com/user/Zenderxis)

## License

[MIT](LICENSE) for the app's own code. Bundled assets keep their own terms — see `data-source/bender/FREE FONT LICENSE.txt` for the Bender font (SIL Open Font License 1.1). Reward icons and document-type icons are Escape from Tarkov game assets, used here for identification purposes in a fan tool; they belong to Battlestate Games.
