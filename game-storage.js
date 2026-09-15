const GameLibrary = (() => {
  const databaseName = "utilities-game-library";
  const storeName = "games";
  const pinnedKey = "utilities-pinned-games";
  const recentKey = "utilities-recent-games";
  const gameUrl = (file) => `https://cdn.jsdelivr.net/gh/bubbls/ugs-singlefile/UGS-Files/${encodeURIComponent(normalizeFileName(file))}`;

  function normalizeFileName(file) {
    return file.includes(".") && file.lastIndexOf(".") > 0 ? file : `${file}.html`;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "file" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getSavedRecord(file) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName).objectStore(storeName).get(file);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function getSavedGames() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName).objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveGame(file, text, metadata = {}) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readwrite").objectStore(storeName).put({
        file,
        text,
        title: metadata.title || file,
        source: metadata.source || "library",
        savedAt: metadata.savedAt || Date.now(),
      });
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  }

  async function getSaved(file) {
    return (await getSavedRecord(file))?.text || null;
  }

  async function removeOffline(file) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readwrite").objectStore(storeName).delete(file);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  }

  function getPinned() {
    try {
      return JSON.parse(localStorage.getItem(pinnedKey) || "[]");
    } catch (error) {
      return [];
    }
  }

  function setPinned(pinned) {
    localStorage.setItem(pinnedKey, JSON.stringify(pinned));
  }

  function isPinned(file) {
    return getPinned().includes(file);
  }

  function togglePinned(file) {
    const pinned = getPinned();
    const next = pinned.includes(file) ? pinned.filter((item) => item !== file) : [...pinned, file];
    setPinned(next);
    return next;
  }

  function getRecent() {
    try {
      return JSON.parse(localStorage.getItem(recentKey) || "[]");
    } catch (error) {
      return [];
    }
  }

  function recordRecent(file) {
    const recent = getRecent().filter((item) => item !== file);
    localStorage.setItem(recentKey, JSON.stringify([file, ...recent].slice(0, 20)));
  }

  function connectionLabel() {
    return navigator.onLine ? "Online" : "Offline";
  }

  async function getStatus(file, available = true) {
    const saved = await getSavedRecord(file);
    const statuses = [];
    if (available) statuses.push("Available");
    if (saved) statuses.push("Offline ready");
    if (isPinned(file)) statuses.push("Pinned");
    return statuses;
  }

  async function getGame(file) {
    const saved = await getSaved(file);
    if (saved !== null) return saved;
    const response = await fetch(`${gameUrl(file)}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`Could not load ${file}`);
    return response.text();
  }

  function icon(name) {
    const paths = {
      back: '<path d="m15 18-6-6 6-6"/><path d="M9 12h10"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      dock: '<path d="M4 5h16v14H4z"/><path d="M4 15h16"/>',
      download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
      minimize: '<path d="M5 12h14"/>',
      move: '<path d="M12 3v18M3 12h18"/><path d="m8 7 4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
      offline: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
      pin: '<path d="m15 4 5 5-3 3v5l-5-3-5 3v-5L4 9l5-5z"/>',
      refresh: '<path d="M20 11a8 8 0 0 0-14.7-4L3 10"/><path d="M3 5v5h5M4 13a8 8 0 0 0 14.7 4L21 14"/><path d="M21 19v-5h-5"/>',
    };
    return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]));
  }

  function buildGameDocument(text, file, title) {
    const safeTitle = escapeHtml(title);
    const actionScript = `<script>(function(){var toolbar=document.getElementById("utilities-toolbar"),move=toolbar.querySelector('[data-action="move"]');toolbar.addEventListener("click",function(event){var button=event.target.closest("button[data-action]");if(button&&window.opener){event.preventDefault();window.opener.postMessage({type:"utilities-toolbar-action",action:button.dataset.action},"*");}});var moving=false,x=0,y=0;function stopMoving(){moving=false;}move.addEventListener("pointerdown",function(event){moving=true;move.setPointerCapture(event.pointerId);var box=toolbar.getBoundingClientRect();x=event.clientX-box.left;y=event.clientY-box.top;toolbar.style.left=box.left+"px";toolbar.style.top=box.top+"px";toolbar.style.transform="none";event.preventDefault();});move.addEventListener("pointermove",function(event){if(moving){toolbar.style.left=event.clientX-x+"px";toolbar.style.top=event.clientY-y+"px";}});move.addEventListener("pointerup",stopMoving);move.addEventListener("pointercancel",stopMoving);move.addEventListener("lostpointercapture",stopMoving);window.addEventListener("pointerup",stopMoving);window.addEventListener("blur",stopMoving);})();<\/script>`;
    const toolbar = `<style>
      #utilities-toolbar{align-items:center;background:#252b35;border:1px solid #424b58;border-radius:6px;box-shadow:0 8px 24px #0008;color:#f6f2e8;display:flex;gap:4px;left:50%;padding:6px;position:fixed;top:12px;transform:translateX(-50%);z-index:2147483647;font:14px Arial,sans-serif}
      #utilities-toolbar button{align-items:center;background:transparent;border:1px solid transparent;border-radius:4px;color:inherit;cursor:pointer;display:flex;height:32px;justify-content:center;padding:6px;width:32px}
      #utilities-toolbar button:hover{background:#f0b35b;color:#201a12}
      #utilities-toolbar .utilities-drag-region{cursor:move;height:28px;width:18px}
      #utilities-toolbar .utilities-drag-region:after{content:"⋮⋮";color:#b9b4a7;font-size:16px;line-height:28px}
      #utilities-toolbar svg{height:18px;width:18px}
      #utilities-toolbar .utilities-toolbar-title{max-width:220px;overflow:hidden;padding:0 8px;text-overflow:ellipsis;white-space:nowrap}
      #utilities-toolbar .utilities-toolbar-status{color:#f0b35b;font-size:11px;margin-left:4px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #utilities-toolbar .utilities-connection{color:#b9b4a7;font-size:11px;margin-left:4px}
      #utilities-toolbar .utilities-saves{position:relative}
      #utilities-toolbar .utilities-saves summary{cursor:pointer;list-style:none;padding:7px 9px}
      #utilities-toolbar .utilities-saves summary::-webkit-details-marker{display:none}
      #utilities-toolbar .utilities-saves summary:after{content:" ▾"}
      #utilities-toolbar .utilities-save-menu{background:#252b35;border:1px solid #424b58;border-radius:4px;display:grid;gap:4px;padding:5px;position:absolute;right:0;top:100%;z-index:2}
      #utilities-toolbar .utilities-save-menu button{font:12px Arial,sans-serif;height:auto;padding:8px 10px;white-space:nowrap;width:auto}
      #utilities-toolbar .utilities-toolbar-divider{background:#424b58;height:24px;margin:0 3px;width:1px}
      #utilities-toolbar.docked{border-radius:0;left:0;right:0;top:0;transform:none}
      #utilities-toolbar.minimized{background:#252b35aa;opacity:.72;padding:4px;width:42px}
      #utilities-toolbar.minimized>*:not([data-action="minimize"]){display:none}
    </style>
    <div id="utilities-toolbar" role="toolbar" aria-label="Game controls">
      <span class="utilities-drag-region" data-action="move" aria-label="Move toolbar" title="Drag toolbar"></span>
      <button data-action="close" aria-label="Close game" title="Close game">${icon("close")}</button>
      <button data-action="dock" aria-label="Dock toolbar" title="Dock toolbar">${icon("dock")}</button>
      <button data-action="minimize" aria-label="Minimize to icon" title="Minimize to icon">${icon("minimize")}</button>
      <button data-action="refresh" aria-label="Refresh game" title="Refresh game">${icon("refresh")}</button>
      <span class="utilities-toolbar-divider"></span>
      <span class="utilities-toolbar-title" title="${safeTitle}">${safeTitle}</span>
      <span class="utilities-toolbar-status" data-status>Playing</span>
      <span class="utilities-connection" data-connection>${connectionLabel()}</span>
      <button data-action="back" aria-label="Back to homepage" title="Back to homepage">${icon("back")}</button>
      <button data-action="pin" aria-label="Pin game" title="Pin game">${icon("pin")}</button>
      <button data-action="download" aria-label="Download game" title="Download game">${icon("download")}</button>
      <button data-action="offline" aria-label="Save game offline" title="Save game offline">${icon("offline")}</button>
      <details class="utilities-saves"><summary>Saves</summary><div class="utilities-save-menu"><button data-action="export">Export saves</button><button data-action="import">Import saves</button><button data-action="clear">Clear saves</button><input data-save-file type="file" accept="application/json" hidden></div></details>
    </div>
    ${actionScript}`;
    return /<\/body>/i.test(text) ? text.replace(/<\/body>/i, `${toolbar}</body>`) : `${toolbar}${text}`;
  }

  function openText(text, file, title) {
    const newWindow = window.open("about:blank", "_blank");
    if (!newWindow) throw new Error("Allow pop-ups to open the game.");
    newWindow.document.open();
    newWindow.document.write(buildGameDocument(text, file, title));
    newWindow.document.close();
    installToolbar(newWindow, file, title);
    newWindow.setTimeout(() => installToolbar(newWindow, file, title), 0);
    newWindow.addEventListener("load", () => installToolbar(newWindow, file, title));
  }

  function installToolbar(gameWindow, file, title) {
    const toolbar = gameWindow.document.getElementById("utilities-toolbar");
    if (!toolbar) return;
    if (toolbar.dataset.bound === "true") return;
    toolbar.dataset.bound = "true";
    const status = toolbar.querySelector("[data-status]");
    const connection = toolbar.querySelector("[data-connection]");
    const updateConnection = () => { connection.textContent = connectionLabel(); };
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    const setStatus = (message) => { status.textContent = message; };
    if (!gameWindow.__utilitiesMessageBound) {
      gameWindow.__utilitiesMessageBound = true;
      window.addEventListener("message", (event) => {
        if (event.source === gameWindow && event.data?.type === "utilities-toolbar-action") toolbarAction(gameWindow, file, event.data.action);
      });
    }
    const run = async (callback, success) => {
      try {
        await callback();
        setStatus(success);
      } catch (error) {
        setStatus(error.message || "Not available");
      }
    };
  }

  async function toolbarAction(gameWindow, file, name) {
    const toolbar = gameWindow.document.getElementById("utilities-toolbar");
    const status = toolbar?.querySelector("[data-status]");
    const setStatus = (message) => { if (status) status.textContent = message; };
    try {
      if (name === "close") return gameWindow.close();
      if (name === "dock") return toolbar.classList.toggle("docked");
      if (name === "minimize") return toolbar.classList.toggle("minimized");
      if (name === "refresh") return refreshGameWindow(gameWindow, file, toolbar.querySelector(".utilities-toolbar-title").textContent);
      if (name === "back") return gameWindow.location.href = new URL("index.html", window.location.href).href;
      if (name === "pin") { togglePinned(file); setStatus("Pinned"); return; }
      if (name === "download") { await download(file); setStatus("Downloaded"); return; }
      if (name === "offline") { await saveOffline(file); setStatus("Offline ready"); return; }
      if (name === "export") { await exportData(); setStatus("Saves exported"); return; }
      if (name === "import") {
        const input = toolbar.querySelector("[data-save-file]");
        input.click();
        input.onchange = async () => {
          if (input.files[0] && gameWindow.confirm("Importing saves will replace current game data. Continue?")) {
            await importData(input.files[0]);
            setStatus("Saves imported");
          }
          input.value = "";
        };
        return;
      }
      if (name === "clear" && gameWindow.confirm("Clear all saved games, pins, history, and cookies?")) { await clearData(); setStatus("Saves cleared"); }
    } catch (error) {
      setStatus(error.message || "Action failed");
    }
  }

  async function refreshGameWindow(gameWindow, file, title) {
    const text = await getGame(file);
    gameWindow.document.open();
    gameWindow.document.write(buildGameDocument(text, file, title));
    gameWindow.document.close();
    installToolbar(gameWindow, file, title);
    gameWindow.setTimeout(() => installToolbar(gameWindow, file, title), 0);
  }

  async function play(file) {
    const text = await getGame(file);
    const record = await getSavedRecord(file);
    recordRecent(file);
    openText(text, file, record?.title || file);
  }

  async function download(file) {
    const text = await getGame(file);
    const record = await getSavedRecord(file);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/html" }));
    link.download = normalizeFileName(record?.title || file);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function toggleOffline(file) {
    const saved = await getSaved(file);
    if (saved === null) await saveGame(file, await getGame(file), { source: "offline" });
    else await removeOffline(file);
    return getSaved(file);
  }

  async function saveOffline(file) {
    const existing = await getSavedRecord(file);
    if (existing) return existing;
    await saveGame(file, await getGame(file), { source: "offline" });
    return getSavedRecord(file);
  }

  async function exportData() {
    const database = await getSavedGames();
    const local = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      local[key] = localStorage.getItem(key);
    }
    const cookies = document.cookie.split("; ").filter(Boolean);
    const payload = { version: 1, exportedAt: new Date().toISOString(), localStorage: local, cookies, indexedDB: database };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    link.download = `utilities-save-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importData(file) {
    const payload = JSON.parse(await file.text());
    if (!payload || typeof payload !== "object" || !payload.localStorage || !Array.isArray(payload.indexedDB)) {
      throw new Error("That is not a valid Utilities save file.");
    }
    localStorage.clear();
    Object.entries(payload.localStorage).forEach(([key, value]) => localStorage.setItem(key, value));
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      store.clear();
      payload.indexedDB.forEach((record) => store.put(record));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function clearData() {
    localStorage.clear();
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).clear();
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    document.cookie.split("; ").filter(Boolean).forEach((cookie) => {
      document.cookie = `${cookie.split("=")[0]}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
  }

  async function importGame(file) {
    if (!file || !file.name.toLowerCase().endsWith(".html")) {
      throw new Error("Choose an HTML file.");
    }
    const text = await file.text();
    const id = `upload-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${file.name}`}`;
    const title = file.name.replace(/\.html?$/i, "");
    await saveGame(id, text, { title, source: "upload" });
    recordRecent(id);
    return id;
  }

  return { buildGameDocument, clearData, connectionLabel, download, exportData, getGame, getPinned, getRecent, getSavedGames, getStatus, icon, importData, importGame, installToolbar, isPinned, normalizeFileName, play, recordRecent, saveGame, saveOffline, toggleOffline, togglePinned, toolbarAction };
})();

window.GameLibrary = GameLibrary;
