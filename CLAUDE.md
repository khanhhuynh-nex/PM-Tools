# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

```bash
node server.js          # start the server (http://localhost:3000)
npm install             # install dependencies (first time only)
npx playwright install chromium   # install browser (first time only)
```

Double-clicking `Start App.bat` does all of the above automatically and opens the browser.

There are no tests or linters configured.

## Architecture

Single Express server (`server.js`) that acts as a hub — it mounts two tool routers and serves three sets of static files:

```
GET  /              → public/index.html          (home dashboard)
GET  /celoxis/*     → tools/celoxis/public/      (Celoxis tool UI)
GET  /epicor/*      → tools/epicor/public/       (Epicor tool UI)
POST /api/celoxis/* → tools/celoxis/router.js
POST /api/epicor/*  → tools/epicor/router.js
```

### Each tool follows the same pattern

```
tools/<tool>/
  router.js       — Express router: POST /run, GET /logs, GET /status
  automation.js   — Playwright browser automation logic
  public/         — Vanilla JS + HTML + CSS frontend (no framework, no build step)
```

The router receives the form submission, validates it, responds immediately with `{ status: 'started' }`, then runs automation in the background. Progress is streamed to the browser via **SSE** (Server-Sent Events).

### Shared utilities (`shared/`)

| File | Purpose |
|---|---|
| `shared/sse.js` | `createSSEStream()` factory — call once per tool in its router. Returns `{ middleware, broadcast, log }`. Each tool gets an **isolated** stream so two users on different tools don't mix logs. |
| `shared/upload.js` | `createUploader()` — returns a multer instance that stores uploads in `/uploads/` (auto-deleted after automation). |
| `shared/playwright.js` | `launchFreshBrowser()` for Epicor (credentials entered per session); `launchPersistentBrowser(profilePath)` for Celoxis (login-once, session cached in `tools/celoxis/browser_profile/`). |

### Automation conventions

- `log(msg)` from the SSE stream is passed into every automation function — use it instead of `console.log` so messages appear in the browser UI.
- `broadcast(value, type)` sends typed events: `'log'`, `'status'` (`'running'`/`'idle'`), `'pr_number'` (Epicor only).
- On any automation error, save a screenshot to the tool's own directory (e.g. `tools/celoxis/error_*.png`) to aid debugging.
- `isRunning` state is kept **per router** (not global) so tools don't block each other.

### Celoxis-specific details

- **Authentication**: credentials (`CEL_EMAIL` / `CEL_PASS`) come from the UI form per session. The persistent browser profile (`tools/celoxis/browser_profile/`) caches the logged-in session so login only happens on first run or after session expiry.
- **Timesheet parser** (`tools/celoxis/parser.js`): uses `exec` in a loop (not `split`) to find day headers and work items by regex position, then slices the raw text between match offsets.  
- **Week navigation**: reads the `Wk\d+` week number from the **filename** and compares against the Celoxis week label (a `<span>`, not a `<button>`). Then finds the `<` / `>` nav buttons by walking up the DOM with XPath.
- **Column index mapping**: `{ Sun:4, Mon:5, Tue:6, Wed:7, Thu:8, Fri:9, Sat:10 }` — these correspond to `<td>` indices in the Celoxis timesheet table.
- **Note entry**: after filling hours, re-clicks the cell, then searches for the note icon using multiple CSS selector candidates (`.fa-thin`, `[class*="fa-note"]`, etc.) because the Celoxis icon class has changed in past UI updates.

### Epicor-specific details

- **Authentication**: username/password entered per session in the UI, passed directly to Playwright. No session persistence.
- **Excel parsing**: uses the `xlsx` library. Expects sheet named `PART CODE - TABLE FORM`, header row at row 3 (index 2), data from row 4. Duplicate column names get `.1`, `.2` suffixes.
- **`robustFill` / `robustCombobox`**: try 4 different Playwright locator strategies in sequence before giving up, to handle Epicor's inconsistent label/input DOM structure.

## Adding a New Tool

1. Create `tools/<name>/router.js`, `tools/<name>/automation.js`, `tools/<name>/public/`
2. Add two lines to `server.js`:
   ```js
   app.use('/<name>', express.static('tools/<name>/public'));
   app.use('/api/<name>', require('./tools/<name>/router'));
   ```
3. Add a tool card to `public/index.html`.

## Timesheet File Format (Celoxis)

Filename must include the week number: `Wk16 12 Apr - 18 Apr.txt`

```
## Mon 13 Apr 2025:
*Project Name - (4h)
    • Task note line 1
    • Task note line 2
*Another Project - (50%)
    • Task note
```

- Hours: `4h` or `50%` (percentage of an 8-hour day). Each weekday must total 8h.
- Project names must match Celoxis row labels exactly (the tool uses substring match).
- Bullet characters `•`, `-`, `*` are all stripped from task lines before joining with `; `.

## Secrets and Gitignored Paths

```
tools/celoxis/.env           # not used for auth (credentials come from UI)
tools/celoxis/browser_profile/  # Playwright persistent session — never commit
uploads/                     # temp file landing zone — auto-cleaned
```
