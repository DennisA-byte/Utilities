# Utilities

## Run locally

The pages use browser storage and remote game files, so open them through a local web server instead of double-clicking the HTML file.

```bash
cd Utilities
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000). The complete game library and its storage behavior are contained in `index.html`.

## Host on HTML Hoster

1. Upload `index.html` to [HTML Hoster](https://htmlhoster.com/).
2. Open the hosted `index.html` URL. Pinning and offline saves are kept in each visitor's browser; the game HTML is fetched from the UGS CDN.

The **Download source code** link downloads the current project archive from GitHub. A game’s **Download** button saves that individual game as an HTML file, while **Save offline** stores it in the browser for later play without a network connection.