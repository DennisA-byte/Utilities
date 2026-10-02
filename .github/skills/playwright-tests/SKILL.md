---
name: playwright-tests
description: 'Run, debug, or write Playwright end-to-end tests for this repository. Use when asked to run the browser test suite, target a test, investigate a Playwright failure, or add regression coverage.'
---

# Playwright Tests

Run and maintain the Utilities browser end-to-end suite using the repository's existing Playwright setup.

## Repository Setup

- Tests are in `tests/`; the current suite is `tests/homepage.spec.js`.
- `npm run test:e2e` invokes `playwright test`.
- `playwright.config.js` starts `python3 -m http.server 8000 --directory src` and waits for `http://127.0.0.1:8000/index.html`. Do not start a second server for normal runs. It reuses an existing server locally and does not reuse one in CI.
- The configured projects are Chromium, branded Chrome, Edge, Firefox, and WebKit (Safari engine), with base URL `http://127.0.0.1:8000`.
- Install dependencies with `npm install` if `node_modules` or Playwright is unavailable. Install local browser binaries with `npx playwright install chromium chrome msedge firefox webkit`; Linux system dependencies may also be required. CI installs all five browser targets and their dependencies with `npx playwright install --with-deps chromium chrome msedge firefox webkit`.

## Procedure

1. Read `AGENTS.md`, `package.json`, `playwright.config.js`, and the relevant test before choosing a command or changing coverage. Check `git status --short --branch` and preserve unrelated worktree changes.
2. For a request to run all end-to-end tests, use:

   ```bash
   npm run test:e2e
   ```

3. For a focused run, select the relevant test file and title substring:

   ```bash
   npx playwright test tests/homepage.spec.js -g "toolbar"
   ```

   Use `npx playwright test --list` to inspect discovered tests when the title or file is unclear.
4. For test or application changes, run the narrowest relevant test first. If it passes, run `npm run test:e2e` for user-facing behavior changes. If it fails, inspect the first failure and its trace/output, determine whether it is a test setup, environment, or product regression, and fix the relevant cause before rerunning the same focused test.
5. Summarize the command and outcome. Report failures or unavailable prerequisites plainly; do not claim tests passed if they were not run.

## Test Conventions

- Keep the normal GitHub commit API mock and deterministic running commit from `context.addInitScript()` stable. Override the mock only in tests specifically exercising a newer commit.
- Use Playwright route interception for GitHub API, CDN game HTML, and GitHub Pages responses instead of depending on live remote content.
- Seed IndexedDB deterministically with `page.evaluate()` for offline-record tests; do not rely on pinned games or prior browser state.
- For the 24-hour update scheduler, explicitly age `sessionStorage` key `utilities-last-update-check` before reloading. A same-tab reload should not poll again before 24 hours.
- Cache-reload tests should wait for replacement behavior or inspect persisted `localStorage` from a fresh same-origin page. Evaluating during `document.write()` navigation can destroy the execution context.
- For toolbar behavior, upload a small HTML fixture and test the actual popup. Assert the toolbar appears once, controls are visible and accessible, state SVGs exist, and pointer actions move the toolbar when relevant. Source-string checks alone do not verify the popup behavior.
- Add a focused regression test for each user-visible behavior change. Keep fixtures deterministic and assert observable behavior rather than implementation details where possible.

## Completion Checks

- The focused test passes, and the full suite passes after user-visible behavior or test changes.
- Review `git diff --check` and `git status --short` after edits.
- Do not commit generated `test-results/`, screenshots, traces, `node_modules/`, or downloaded artifacts.