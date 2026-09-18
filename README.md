# Utilities
[![Playwright tests](https://github.com/DennisA-byte/Utilities/actions/workflows/playwright.yml/badge.svg)](https://github.com/DennisA-byte/Utilities/actions/workflows/playwright.yml) [![CodeQL](https://github.com/DennisA-byte/Utilities/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/DennisA-byte/Utilities/actions/workflows/github-code-scanning/codeql)

## How to run
### Run locally

The pages use browser storage and remote game files, so open them through a local web server instead of double-clicking the HTML file.

```bash
cd Utilities
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000). The home page is `index.html`; select **Browse all games** to open `AllFIles.html`.

### Host on HTML Hoster

1. Upload `index.html`, `AllFIles.html`, `files.js`, and `game-storage.js` to [HTML Hoster](https://htmlhoster.com/).
2. Keep all four files in the same hosted directory so the relative script links continue to work.
3. Open the hosted `index.html` URL. Pinning and offline saves are kept in each visitor's browser; the game HTML is fetched from the UGS CDN.

The **Download source code** link downloads the current project archive from GitHub. A game’s **Download** button saves that individual game as an HTML file, while **Save offline** stores it in the browser for later play without a network connection.

### Use GitHub Pages

This repo is already hosted at <https://dennisa-byte.github.io/Utilities/> (sharable version: <tinyurl.com/Utils00> or <tinyurl.com/Utilities00>)
