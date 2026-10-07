# Utilities

[![Playwright tests](https://github.com/DennisA-byte/Utilities/actions/workflows/playwright.yml/badge.svg)](https://github.com/DennisA-byte/Utilities/actions/workflows/playwright.yml) [![CodeQL](https://github.com/DennisA-byte/Utilities/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/DennisA-byte/Utilities/actions/workflows/github-code-scanning/codeql)

Utilities is a browser-based game library and launcher for a collection of single-file HTML games. It lets you browse a curated library, pin favorites, save games locally for offline access, download standalone files, create backups, and keep the app synced with the latest upstream source.

The project is intentionally lightweight: it is a static HTML/CSS/JavaScript app with no build pipeline, backend, or framework. The browser handles persistence with IndexedDB, localStorage, and sessionStorage, while the library content itself is mostly served from the UGS CDN and the project’s GitHub Pages source.

Live demo:
- GitHub Pages: https://dennisa-byte.github.io/Utilities/
- Repository: https://github.com/DennisA-byte/Utilities

## Features

- Browse the game library from `AllFIles.html`
- Pin favorites and track recently played games from the home page
- Save games locally for offline access in IndexedDB
- Download individual games as standalone HTML files
- Launch games in their own popup windows with a toolbar for tools like full-screen, refresh, minimize, and more
- Check for app/source updates and optionally refresh cached HTML
- Compile a standalone copy of the app for local use or distribution
- Back up app data and selected games, with optional password protection
- Keep a local “My games” collection for uploaded HTML games

## Screens and app flow

The project centers on a few browser pages:

- `src/index.html` — the main home screen and personal game shelf
- `src/AllFIles.html` — the catalog of library games
- `src/settings.html` — app settings and source/download actions
- `src/backups.html` — backup and restore flows
- `src/game-storage.js` — shared browser-storage and game lifecycle logic
- `src/notifications.js` — update checks and user notifications
- `src/files.js` — the list of game definitions used by the catalog

### Main experience

From the home page, users can:

1. Open the full library and browse games
2. Pin game entries to the home shelf
3. Save or download a game locally
4. Play a game from the saved or library copy
5. Rename or remove uploaded games in “My games”
6. Manage offline update preferences when a library game changes upstream

The home page also exposes a connection status indicator and disables actions that are not valid while offline.

## Running locally

Because the app relies on browser storage and fetches game HTML from remote sources, it should be served from a local web server instead of opened directly as a file.

```bash
cd Utilities
python3 -m http.server 8000 --directory src
```

Then open:

- http://127.0.0.1:8000/index.html
- or http://127.0.0.1:8000/AllFIles.html

You can also use any other static host, but the relative script paths and same-origin behavior are expected to remain intact.

## Project structure

```text
Utilities/
├── src/
│   ├── AllFIles.html
│   ├── backups.html
│   ├── backups.js
│   ├── files.js
│   ├── game-storage.js
│   ├── index.html
│   ├── notifications.js
│   ├── settings.html
│   └── ...
├── tests/
│   ├── backups.spec.js
│   ├── homepage.spec.js
│   ├── test-1.spec.ts
│   └── test-2.spec.ts
├── package.json
├── playwright.config.js
├── README.md
├── AGENTS.md
├── CODE_OF_CONDUCT.md
├── LICENSE
└── ...
```

## Core implementation notes

### Browser storage

The app uses several browser storage APIs:

- IndexedDB: main saved game records and custom game data
- localStorage: app preferences, cached app source version markers, and some UI state
- sessionStorage: update polling timing checks
- cookies: legacy cleanup only; the app avoids placing large HTML blobs in cookies

The IndexedDB database is named `utilities-game-library` with an object store named `games` and a key path of `file`.

### Game loading and updates

The app distinguishes between:

- `getGame(file)` — returns the offline copy when present, otherwise fetches the CDN copy
- `getLatestGame(file)` — always fetches the current CDN content and bypasses saved offline data

This matters for update detection: offline library copies are compared against freshly fetched CDN content so the app can warn the user that a locally saved file is stale.

### Toolbar behavior

When a game is launched, the app injects a custom toolbar into the loaded document. This toolbar exposes controls for:

- dragging the window region
- closing the game
- docking/minimizing the game window
- toggling fullscreen
- refreshing the game
- returning to the home page or library
- pinning the game
- downloading the current game HTML
- saving the game for offline play

The toolbar is intentionally injected into the game document and is designed to survive hostile CSS or legacy markup.

### Updates and notification system

`notifications.js` is responsible for:

- checking the GitHub commit for the running source
- comparing with the latest upstream app state
- scheduling update checks after 24 hours using session storage
- handling cached HTML and GitHub Pages downloads
- surfacing per-game offline update decisions

The app attempts to compare game versions without overwriting user-created “My games” records or breaking offline data when a remote request fails.

## Source and compiled app workflow

The app includes a “Source & tools” experience in the settings flow. This can generate a standalone HTML bundle that embeds the project’s relevant source files and the compiled library.

This is useful when you want to:

- run the app from a single exported file
- test the app behavior in a blob or file URL context
- generate a bundle for a different host or environment

Important rules from the project itself:

- preserve the `meta[name="utilities-running-source"]` marker in generated output
- safely inline scripts without injecting raw source content that could break HTML parsing
- verify behavior for `blob:`, `file:`, `data:`, and `about:blank` URLs where update logic or downloads are involved

## Backups and data safety

The project includes backup support for both app settings and selected games. Backups are designed to:

- include pinned games, recently played games, and other local app configuration
- optionally include selected saved games with related data
- support encrypted backup files with a password
- offer a recovery HTML page for decrypting and downloading the backup archive

Important implementation detail: backup encryption uses an AES-GCM payload with PBKDF2-derived keys and a password verification token. The recovery workflow runs inside the browser and never sends the backup to a server.

## GitHub Pages and CDN usage

The app depends on a few external services:

- GitHub API for commit metadata and source checks
- raw GitHub content for version comparison and cached source updates
- jsDelivr CDN for game files from the UGS single-file repository
- GitHub Pages for hosted distribution of the app itself

This means network access is part of the normal app behavior, and the app is designed to degrade gracefully when remote data is unavailable.

## Testing

This repository uses Playwright for end-to-end coverage.

Install dependencies:

```bash
npm install
```

Run the full suite:

```bash
npm run test:e2e
```

For a focused smoke test, you can target a specific spec or test name using Playwright’s filter syntax:

```bash
npx playwright test tests/homepage.spec.js -g "toolbar"
```

The tests cover:

- homepage behavior
- library browsing and offline play states
- update polling and cached-version checks
- backup/restore flows
- toolbar interaction and fullscreen/drag behavior
- compiled app behavior in different URL contexts

GitHub Actions runs Chromium for small changes, all five browser projects for new files, test/config changes, or larger diffs, and the complete matrix weekly. Pull requests use the full matrix unless they are small and the author has confirmed write-level repository access. Manual runs expose a checkbox for each browser.

## Development conventions

This repo intentionally avoids a framework and bundler. Most work happens directly in static HTML and JavaScript files.

Recommended workflow:

1. Run the app over a local HTTP server
2. Edit the relevant static file in `src/`
3. Run the specific browser test for the behavior you changed
4. Run the full E2E suite before finalizing larger changes

Avoid committing generated artifacts like:

- `node_modules/`
- `test-results/`
- downloaded browser artifacts
- screenshots or local caches created during testing

## Security and privacy notes

Utilities stores user data in the browser, not in a remote backend. This includes:

- local saved games
- pinned and recently played game lists
- backup preferences
- cached app version data

That is intentional for a static local-first application, but it means the browser is the primary trust boundary. Users should keep backups of important custom-game data, and encrypted backups should be used when sensitive content is stored locally.

## Contributing

Contributions are welcome, especially when they improve:

- browser compatibility
- offline game handling
- backup safety
- accessibility
- toolbar behavior
- update detection without false positives

New game suggestions are also welcome. If you know a single-file HTML game that would fit the library, open a new issue using the “New game suggestion” template in the repository issue tracker.

Before submitting a change:

- keep changes focused and aligned with the existing app architecture
- prefer minimal edits over broad refactors
- add or update a relevant Playwright test for user-visible changes
- verify the full end-to-end suite if the change touches app behavior

## License

This project is released into the public domain under the Unlicense. See [LICENSE](LICENSE) for the full text.

## Quick reference

If you only need the essentials:

```bash
npm install
python3 -m http.server 8000 --directory src
# then visit http://127.0.0.1:8000/index.html
```

For the full test suite:

```bash
npm run test:e2e
```

For the hosted app:

- https://dennisa-byte.github.io/Utilities/