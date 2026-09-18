# Utilities Agent Guide

This file is the working guide for agents modifying this repository. Read it before changing the app or its tests.

## Repository Overview

Utilities is a small browser-only HTML game library. It has no bundler, framework, backend, TypeScript, or application server. The main UI is plain HTML/CSS/JavaScript and persists user data in browser storage.

The repository is hosted at:

- GitHub: `https://github.com/DennisA-byte/Utilities`
- GitHub Pages: `https://dennisa-byte.github.io/Utilities/`

The production pages fetch game HTML from the UGS CDN and update metadata from the GitHub API. Network access and browser storage are therefore part of normal application behavior.

## Essential Commands

Install dependencies:

```bash
npm install
```

Run the full end-to-end suite:

```bash
npm run test:e2e
```

The Playwright config starts a local server automatically with:

```bash
python3 -m http.server 8000
```

The configured base URL is `http://127.0.0.1:8000`. The test project is Chromium. Playwright browsers are installed in CI with:

```bash
npx playwright install --with-deps chromium
```

For focused work, use a test title filter:

```bash
npx playwright test tests/homepage.spec.js -g "toolbar"
```

There is no lint or build script. Use `git diff --check` and the editor error checker for static validation. Do not commit `node_modules/`, `test-results/`, screenshots, or other generated artifacts.

## File Ownership

### `index.html`

Owns the homepage and the compiled-app builder.

Responsibilities:

- Homepage layout and styles.
- Source/tools dialog.
- Pinned, recent, offline, and My games tabs.
- Uploading, renaming, deleting, downloading, pinning, and saving games offline.
- Compiling a standalone app in `compileApplication()`.
- Embedding `AllFIles.html`, `files.js`, `game-storage.js`, and `notifications.js` into standalone output.
- Homepage connection status and network-action disabling.

The homepage loads scripts in this order:

1. `game-storage.js`
2. `notifications.js`

Keep this order. `notifications.js` depends on the global `GameLibrary` object created by `game-storage.js`.

### `AllFIles.html`

Owns the full UGS library page.

Responsibilities:

- Search and filtering.
- Rendering the library rows.
- Play, pin, download, and save-offline actions.
- Loading `files.js`, `game-storage.js`, and `notifications.js`.

The filename capitalization `AllFIles.html` is intentional and is referenced by links, compilation, tests, and the GitHub Pages deployment. Do not rename it casually.

### `files.js`

Contains the large `files` list used by `AllFIles.html`. Avoid unrelated reformatting or regeneration of this file.

### `game-storage.js`

Defines the global `window.GameLibrary` IIFE. It is the shared storage, game-loading, toolbar, and game-action layer.

Important public methods include:

- `getGame(file)`: returns the offline copy when present, otherwise fetches the CDN copy.
- `getLatestGame(file)`: always fetches the current CDN copy and bypasses the offline copy.
- `getSavedRecord(file)`, `getSavedGames()`: read IndexedDB records.
- `saveGame(file, text, metadata)`: writes a record and computes a SHA-256 `contentHash` unless provided.
- `saveOffline(file)`: stores a library copy as an offline record.
- `moveOldCopyToMyGames(record)`: saves an old offline copy as an upload/My games record.
- `removeOffline(file)`, `removeGame(file)`, `renameGame(file, title)`.
- `hashText(text)`: computes the SHA-256 content hash used for offline version checks.
- `play(file)`, `download(file)`, `refreshGameWindow(...)` behavior through toolbar actions.
- `buildGameDocument(text, file, title)`: injects the current game toolbar into game HTML.
- `toolbarAction(gameWindow, file, name)`: handles parent-window toolbar actions.
- `icon(name)`: returns inline SVG markup.

The IndexedDB database is named `utilities-game-library`, with object store `games` and key path `file`.

Current saved record shape is approximately:

```js
{
  file,
  text,
  title,
  source,       // `library` or `upload`
  contentHash,  // SHA-256 hex string for offline version checks
  savedAt
}
```

Older records may lack `contentHash`; preserve compatibility when reading them. Do not make upload records part of the library-offline update comparison.

### `notifications.js`

Defines `window.UtilitiesNotifications` and performs update polling.

Public methods:

- `show(type, title, options)`
- `info(title, options)`
- `warning(title, options)`
- `error(title, options)`
- `checkForUpdates()`
- `scheduleUpdateCheck()`

It handles:

- GitHub `main` commit polling.
- Comparing the commit represented by the page/source currently running with the latest commit.
- One check at tab open and subsequent checks every 24 hours using `sessionStorage`.
- Website/file/data/about:blank update actions.
- GitHub Pages linking.
- Local cached HTML in `localStorage` under `utilities-cached-version`.
- Removal of legacy cache cookies. Never put complete HTML into cookies: it causes oversized request headers and HTTP 431 errors.
- Offline game comparison and per-game update decisions.

The offline update preference key is `utilities-offline-update-preferences`. Keep preferences small and JSON-serializable.

## Compiled App Rules

The Source & tools dialog creates a standalone HTML app dynamically. `compileApplication()` reads source files with `fetch()`, inlines their scripts, embeds the compiled library as base64, and opens/downloads the generated result.

When adding a script used by the app:

1. Add its normal `<script src="...">` tag to both standalone pages when appropriate.
2. Add it to the `Promise.all()` source list in `compileApplication()`.
3. Inline it into both the compiled app and compiled library when needed.
4. Verify both the blob popup and downloaded `file:` app in Playwright.
5. Preserve the `meta[name="utilities-running-source"]` marker used to identify the page source in compiled output.

Do not inject unescaped source text into an inline `<script>` element. A source file can contain `</script>`-like content and break the generated document, causing application JavaScript to render visibly as page text. Use a safe metadata attribute or carefully escaped encoded payload.

Compiled pages must not assume a normal HTTP URL. Test `blob:`, `file:`, `data:`, and `about:blank` behavior where the feature concerns updates or downloads.

## Game Toolbar Rules

The toolbar is generated as a string by `buildGameDocument()` and injected into the loaded game document. It is not a standalone HTML file.

The current toolbar includes:

- A draggable 2x3 grey-dot region with `data-action="move"`.
- Close, dock, minimize, fullscreen, refresh, back, pin, download, and offline controls.
- Fullscreen enter/exit SVG states.
- A network LED matching homepage states: online green with glow, offline grey without glow, unknown yellow square-like state.
- Saves menu with export/import/clear actions.

Important implementation constraints:

- Game HTML can contain an older `#utilities-toolbar`; `removeLegacyToolbar()` removes legacy toolbar markup/styles/scripts before injecting the current toolbar. Preserve this behavior.
- Game HTML can contain hostile global CSS. Toolbar boundary styles use `!important` intentionally.
- Drag position is also written with inline `!important`; otherwise toolbar CSS `left/top: ... !important` blocks movement.
- Keep toolbar controls at stable dimensions. The main button rule fixes icon-button width/height; save-menu buttons must override that with flexible text width and a minimum width.
- Fullscreen state must update on `fullscreenchange` so the exit icon appears while fullscreen and the enter icon returns afterward.
- Minimize state must swap the minimize icon to the menu icon after the class changes.
- Do not reintroduce the old text glyph drag marker or text-only icons.
- Do not add back a separate “Playing” LED. The toolbar should show network state only.

For toolbar changes, test the actual popup after uploading a small HTML fixture. Testing only the source string is insufficient.

## Update and Offline-Game Rules

Offline update detection compares the SHA-256 hash of each saved library copy with freshly fetched CDN content from `getLatestGame(file)`. It must not use `getGame(file)` for comparison because that returns the offline copy.

For changed library games, the dialog supports:

- Update offline copy.
- Do not update.
- Move old copy to My games and update.

The dialog also has:

- Per-game “don’t ask again” checkboxes.
- Check all and uncheck all controls.
- Yes to all and No to all controls.
- Persistent per-file preferences.

Upload/My games records should not be silently overwritten by library update polling. Missing or failed remote game requests should not prevent other games from being checked.

## Playwright Test Conventions

Tests live in `tests/homepage.spec.js` and use Playwright’s `test` and `expect`.

The test setup mocks the GitHub commit endpoint and injects a deterministic running commit through `context.addInitScript()`. Keep that mock stable for normal tests and override it only in tests explicitly exercising newer commits.

Use route interception for:

- GitHub API responses.
- CDN game HTML.
- GitHub Pages HTML when testing cache/download behavior.

Use deterministic IndexedDB setup with `page.evaluate()` when testing offline records. Avoid relying on whatever games happen to be pinned in local browser state.

When testing the 24-hour scheduler, explicitly age `sessionStorage` key `utilities-last-update-check` before reloading. A same-tab reload should not poll again if less than 24 hours have elapsed.

When testing cache reloads, wait for the replacement behavior or use a fresh same-origin page to inspect persisted `localStorage`; direct evaluation during `document.write()` navigation can race and destroy the execution context.

For generated toolbar tests, assert:

- The toolbar exists exactly once.
- The specific control is visible and has the expected accessible name.
- SVG/state elements exist.
- Computed dimensions/colors/shadows are correct where visual regressions matter.
- Pointer interactions actually move the toolbar rather than only checking event handlers.

Every user-facing behavior change should have a focused test, followed by the full `npm run test:e2e` suite.

## External Services and Failure Modes

The app depends on:

- GitHub API: `https://api.github.com/repos/DennisA-byte/Utilities/commits/main`
- GitHub commit history and raw files for running-version identification.
- GitHub Pages URL for newer app downloads/cache.
- UGS CDN game HTML at `https://cdn.jsdelivr.net/gh/bubbls/ugs-singlefile/UGS-Files/...`
- Browser IndexedDB, localStorage, sessionStorage, cookies, popups, downloads, and fullscreen APIs.

Network errors should produce a useful notification or skip only the affected game update. Do not make a transient remote failure destroy local offline data.

## Change and Git Workflow

Before editing:

1. Check `git status --short --branch`.
2. Read the owning abstraction and nearby tests.
3. State a local hypothesis and the cheapest test that can disprove it.

During implementation:

1. Keep changes focused; avoid unrelated formatting or drive-by refactors.
2. Make one small logical change at a time. Prefer a reversible first edit that tests the current hypothesis.
3. Write or update a test for every user-visible behavior change. A bug fix should include a regression test that would have failed before the fix. Visual or interaction changes should test the rendered browser behavior, not only source strings.
4. After the first substantive edit, run the cheapest focused test that can disprove the hypothesis. Do this before broad searching or making unrelated edits.
5. If the focused test fails, repair that same slice and rerun the same test. Do not widen scope until the local failure is understood.
6. Add adjacent tests for important states and boundaries: normal and compiled pages, popup/file/data URL contexts, online and offline states, empty and populated storage, and user interaction success/failure paths.
7. Run the full `npm run test:e2e` suite after the focused tests pass and before committing a stable slice.
8. Inspect `git diff --check`, editor errors, and the final diff before staging. Do not commit generated `node_modules/`, `test-results/`, screenshots, traces, or downloaded artifacts.
9. Commit when a coherent, tested slice is complete. Good commit boundaries are one bug fix, one feature slice, or one test/documentation update that can be described in a short imperative message. Do not make a commit for every keystroke, and do not combine unrelated fixes just to reduce commit count.
10. Use clear non-interactive commits, for example:

  ```bash
  git add path/to/changed-file.js tests/relevant.spec.js
  git commit -m "Fix toolbar drag behavior"
  ```

11. Push after each stable slice when the task asks for frequent synchronization, after a risky shared-behavior change, or before moving to a separate implementation area. A pushed commit should have its focused and full tests passing.
12. Before pushing, check `git status --short --branch` and confirm the commit contains only intended files. Push with `git push origin main` unless the user explicitly requested another branch.
13. If the push is rejected because `origin/main` advanced, stop and inspect the divergence with `git fetch origin` and `git log --oneline --graph HEAD origin/main`. Rebase the local commit(s) onto `origin/main`, resolve conflicts carefully, rerun the full suite, and push again. Never use `git reset --hard`, force-push, or discard remote work without explicit approval.
14. If a test fails after a rebase or remote integration, treat it as a real validation step: determine whether it is a conflict, an environment issue, or a regression, repair it, rerun the full suite, and only then push.
15. Keep the worktree clean at the end. Remove generated artifacts, verify `main...origin/main` has no ahead/behind count, and report the final commit and test result.

### Suggested Iteration Loop

For a normal bug or feature, use this sequence:

1. Inspect the owning code, nearby test, and current git status.
2. State one local hypothesis and one cheap check.
3. Make the smallest implementation edit.
4. Add the regression or feature test immediately beside related tests.
5. Run the focused test and repair local failures.
6. Run `npm run test:e2e`.
7. Review `git diff --check` and the changed-file list.
8. Commit the coherent slice.
9. Push it when synchronization is requested or the slice is independently useful.
10. Continue with the next slice from the clean, tested branch.

### When Not to Commit Yet

Do not commit while the focused test is failing, while generated artifacts are present, or while the diff contains unexplained unrelated changes. Do not commit a speculative workaround when a nearby owning abstraction or regression test can establish the root cause first. If the user asks for frequent commits but a slice is not yet testable, make a small checkpoint only when its message clearly describes the incomplete state and communicate that validation is still pending.

### Test and Commit Granularity

Keep test changes with the implementation they protect when possible. A commit that changes toolbar interaction should contain its toolbar regression tests; a commit that changes cache/update behavior should contain its polling/cache tests. Documentation-only changes can be committed separately after checking links and commands. Avoid a final commit that silently includes untested behavior added after the last full suite run.

Before finishing, verify:

```bash
git diff --check
git status --short --branch
npm run test:e2e
```

The expected final state is a clean worktree with `main` synchronized to `origin/main`.
