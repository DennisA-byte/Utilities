const GameLibrary = (() => {
  const databaseName = "utilities-game-library";
  const storeName = "games";
  const pinnedKey = "utilities-pinned-games";
  const recentKey = "utilities-recent-games";
  const gameUrl = (file) => `https://cdn.jsdelivr.net/gh/bubbls/ugs-singlefile/UGS-Files/${encodeURIComponent(normalizeFileName(file))}`;

  function normalizeFileName(file) {
    return file.includes(".") && file.lastIndexOf(".") > 0 ? file : `${file}.html`;
  }

  async function hashText(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
    const contentHash = metadata.contentHash || await hashText(text);
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readwrite").objectStore(storeName).put({
        file,
        text,
        title: metadata.title || file,
        source: metadata.source || "library",
        savedAt: metadata.savedAt || Date.now(),
        contentHash,
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

  async function removeGame(file) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readwrite").objectStore(storeName).delete(file);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  }

  async function renameGame(file, title) {
    const record = await getSavedRecord(file);
    if (!record) throw new Error("That game is no longer available.");
    await saveGame(file, record.text, { ...record, title });
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

  async function getLatestGame(file) {
    const response = await fetch(`${gameUrl(file)}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${file}`);
    return response.text();
  }

  function icon(name) {
    const paths = {
      back: '<path d="m15 18-6-6 6-6"/><path d="M9 12h10"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      dock: '<path d="M4 5h16v14H4z"/><path d="M4 15h16"/>',
      download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
      fullscreen: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/>',
      fullscreenExit: '<path d="M8 8H3v5M16 8h5v5M8 16H3v-5M21 16v-5h-5"/>',
      fullscreenExit: '<path d="M8 8H3v5M16 8h5v5M8 16H3v-5M21 16v-5h-5"/>',
      menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
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

  function removeLegacyToolbar(text) {
    const parsed = new DOMParser().parseFromString(text, "text/html");
    parsed.querySelectorAll("#utilities-toolbar").forEach((toolbar) => toolbar.remove());
    parsed.querySelectorAll("style, script").forEach((element) => {
      if (element.textContent.includes("utilities-toolbar")) element.remove();
    });
    return parsed.documentElement.outerHTML;
  }

  function buildGameDocument(text, file, title) {
    const safeTitle = escapeHtml(title);
    text = removeLegacyToolbar(text);
    const actionScript = `<script>(function(){var toolbar=document.getElementById("utilities-toolbar"),move=toolbar.querySelector('[data-action="move"]');function send(name){if(window.opener)window.opener.postMessage({type:"utilities-toolbar-action",action:name},"*");}function cursorIsHidden(target){while(target&&target.nodeType===1){if(getComputedStyle(target).cursor==="none")return true;target=target.parentElement;}return getComputedStyle(document.documentElement).cursor==="none"||getComputedStyle(document.body).cursor==="none";}function updateToolbarVisibility(event){var hidden=!!document.pointerLockElement||cursorIsHidden(event&&event.target);toolbar.classList.toggle("pointer-hidden",hidden);}toolbar.addEventListener("click",function(event){var button=event.target.closest("button[data-action]");if(!button)return;event.preventDefault();var name=button.dataset.action;if(name==="dock")toolbar.classList.toggle("docked");else if(name==="minimize")toolbar.classList.toggle("minimized");else if(name==="close")window.close();else send(name);});var moving=false,x=0,y=0;function stopMoving(){moving=false;}move.addEventListener("pointerdown",function(event){moving=true;move.setPointerCapture(event.pointerId);var box=toolbar.getBoundingClientRect();x=event.clientX-box.left;y=event.clientY-box.top;toolbar.style.left=box.left+"px";toolbar.style.top=box.top+"px";toolbar.style.transform="none";event.preventDefault();});move.addEventListener("pointermove",function(event){if(moving){toolbar.style.left=event.clientX-x+"px";toolbar.style.top=event.clientY-y+"px";}updateToolbarVisibility(event);});move.addEventListener("pointerup",stopMoving);move.addEventListener("pointercancel",stopMoving);move.addEventListener("lostpointercapture",stopMoving);window.addEventListener("pointerup",stopMoving);window.addEventListener("blur",stopMoving);document.addEventListener("pointermove",updateToolbarVisibility,true);document.addEventListener("mousemove",updateToolbarVisibility,true);document.addEventListener("pointerlockchange",function(){updateToolbarVisibility(null);});})();<\/script>`;
    const toolbar = `<style>
      #utilities-toolbar{align-items:center!important;background:#252b35!important;border:1px solid #424b58!important;border-radius:6px!important;box-shadow:0 8px 24px #0008!important;color:#f6f2e8!important;display:flex!important;gap:4px!important;left:12px!important;padding:6px!important;position:fixed!important;top:12px!important;z-index:2147483647!important;font:14px Arial,sans-serif!important}
      #utilities-toolbar button{align-items:center!important;background:transparent!important;border:1px solid transparent!important;border-radius:4px!important;color:inherit!important;cursor:pointer!important;display:flex!important;flex:0 0 32px!important;height:32px!important;justify-content:center!important;min-width:32px!important;padding:6px!important;width:32px!important}
      #utilities-toolbar button:hover{background:#f0b35b!important;color:#201a12!important}
      #utilities-toolbar .utilities-drag-region{align-items:center!important;cursor:move!important;display:grid!important;flex:0 0 24px!important;gap:3px!important;grid-template-columns:repeat(2,4px)!important;grid-template-rows:repeat(3,4px)!important;height:18px!important;justify-content:center!important;width:24px!important}
      #utilities-toolbar .utilities-drag-dot{background:#858b94!important;border-radius:50%!important;height:4px!important;width:4px!important}
      #utilities-toolbar svg{display:block!important;height:18px!important;max-height:18px!important;max-width:18px!important;width:18px!important}
      #utilities-toolbar .utilities-toolbar-title{flex:0 1 220px;max-width:220px;overflow:hidden;padding:0 8px;text-overflow:ellipsis;white-space:nowrap}
      #utilities-toolbar .utilities-connection{align-items:center!important;display:inline-flex!important;flex:0 0 auto!important;font-size:11px!important;margin-left:4px!important;max-width:160px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
      #utilities-toolbar .utilities-connection{color:#b9b4a7!important}
      #utilities-toolbar .utilities-status-led{background:#72d572!important;border-radius:50%!important;box-shadow:0 0 8px #72d572!important;display:inline-block!important;flex:0 0 10px!important;height:10px!important;margin-right:5px!important;min-height:10px!important;min-width:10px!important;width:10px!important}
      #utilities-toolbar .utilities-connection.offline .utilities-status-led{background:#72777e!important;box-shadow:none!important}
      #utilities-toolbar .utilities-connection.unknown .utilities-status-led{background:#f0c75e!important;box-shadow:none!important;border-radius:0!important}
      #utilities-toolbar .utilities-saves{position:relative}
      #utilities-toolbar .utilities-saves summary{cursor:pointer;list-style:none;padding:7px 9px}
      #utilities-toolbar .utilities-saves summary::-webkit-details-marker{display:none}
      #utilities-toolbar .utilities-save-menu{background:#252b35;border:1px solid #424b58;border-radius:4px;display:grid;gap:4px;padding:5px;position:absolute;right:0;top:100%;z-index:2}
      #utilities-toolbar .utilities-save-menu button{flex:0 0 auto!important;font:12px Arial,sans-serif;height:auto!important;min-width:120px!important;padding:8px 10px!important;white-space:nowrap!important;width:auto!important}
      #utilities-toolbar .utilities-toolbar-divider{background:#424b58;height:24px;margin:0 3px;width:1px}
      #utilities-toolbar.docked{border-radius:0;left:0;right:0;top:0;transform:none}
      #utilities-toolbar.minimized{background:#252b35aa;opacity:.72;padding:4px;width:42px}
      #utilities-toolbar.minimized>*:not([data-action="minimize"]):not([data-action="move"]){display:none}
      #utilities-toolbar.pointer-hidden{display:none!important}
    </style>
    <div id="utilities-toolbar" role="toolbar" aria-label="Game controls">
      <span class="utilities-drag-region" data-action="move" aria-label="Move toolbar" title="Drag toolbar"><i class="utilities-drag-dot"></i><i class="utilities-drag-dot"></i><i class="utilities-drag-dot"></i><i class="utilities-drag-dot"></i><i class="utilities-drag-dot"></i><i class="utilities-drag-dot"></i></span>
      <button data-action="close" aria-label="Close game" title="Close game">${icon("close")}</button>
      <button data-action="dock" aria-label="Dock toolbar" title="Dock toolbar">${icon("dock")}</button>
      <button data-action="minimize" aria-label="Minimize to icon" title="Minimize to icon"><span data-icon="minimize">${icon("minimize")}</span><span data-icon="menu" hidden>${icon("menu")}</span></button>
      <button data-action="fullscreen" aria-label="Toggle fullscreen" title="Toggle fullscreen"><span data-icon="enter">${icon("fullscreen")}</span><span data-icon="exit" hidden>${icon("fullscreenExit")}</span></button>
      <button data-action="refresh" aria-label="Refresh game" title="Refresh game">${icon("refresh")}</button>
      <span class="utilities-toolbar-divider"></span>
      <span class="utilities-toolbar-title" title="${safeTitle}">${safeTitle}</span>
      <span class="utilities-connection online" data-connection><span class="utilities-status-led" aria-hidden="true"></span><span data-connection-label>${connectionLabel()}</span></span>
      <button data-action="back" aria-label="Back to homepage" title="Back to homepage">${icon("back")}</button>
      <button data-action="pin" aria-label="Pin game" title="Pin game">${icon("pin")}</button>
      <button data-action="download" aria-label="Download game" title="Download game">${icon("download")}</button>
      <button data-action="offline" aria-label="Save game offline" title="Save game offline">${icon("offline")}</button>
      <details class="utilities-saves"><summary><span aria-hidden="true">${icon("menu")}</span> Saves</summary><div class="utilities-save-menu"><button data-action="export">Export saves</button><button data-action="import">Import saves</button><button data-action="clear">Clear saves</button><input data-save-file type="file" accept="application/json" hidden></div></details>
    </div>
    ${actionScript.replace('else if(name==="close")window.close();else send(name);', 'else if(name==="close")window.close();else if(name==="fullscreen"){if(document.fullscreenElement)document.exitFullscreen();else if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();}else send(name);')}<script>(function(){var toolbar=document.getElementById("utilities-toolbar"),fullscreen=toolbar.querySelector('[data-action="fullscreen"]'),minimize=toolbar.querySelector('[data-action="minimize"]'),move=toolbar.querySelector('[data-action="move"]'),connection=toolbar.querySelector("[data-connection]");function sync(){var active=!!document.fullscreenElement;fullscreen.querySelector('[data-icon="enter"]').hidden=active;fullscreen.querySelector('[data-icon="exit"]').hidden=!active;minimize.querySelector('[data-icon="minimize"]').hidden=toolbar.classList.contains("minimized");minimize.querySelector('[data-icon="menu"]').hidden=!toolbar.classList.contains("minimized");}function updateConnection(){var state=typeof navigator.onLine==="boolean"?(navigator.onLine?"online":"offline"):"unknown";connection.className="utilities-connection "+state;connection.querySelector("[data-connection-label]").textContent=state[0].toUpperCase()+state.slice(1);}move.addEventListener("pointerdown",function(event){var box=toolbar.getBoundingClientRect();move.setPointerCapture(event.pointerId);move.dataset.dragging="true";move.dataset.offsetX=event.clientX-box.left;move.dataset.offsetY=event.clientY-box.top;event.preventDefault();});move.addEventListener("pointermove",function(event){if(move.dataset.dragging!=="true")return;toolbar.style.setProperty("left",event.clientX-Number(move.dataset.offsetX)+"px","important");toolbar.style.setProperty("top",event.clientY-Number(move.dataset.offsetY)+"px","important");});["pointerup","pointercancel","lostpointercapture"].forEach(function(name){move.addEventListener(name,function(){delete move.dataset.dragging;});});minimize.addEventListener("click",function(){setTimeout(sync,0);});document.addEventListener("fullscreenchange",sync);window.addEventListener("online",updateConnection);window.addEventListener("offline",updateConnection);sync();updateConnection();})();</script>`;
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
    const connection = toolbar.querySelector("[data-connection]");
    const updateConnection = () => { const state = navigator.onLine ? "online" : "offline"; connection.className = `utilities-connection ${state}`; connection.querySelector("[data-connection-label]").textContent = state[0].toUpperCase() + state.slice(1); };
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    const setStatus = () => {};
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
    const setStatus = () => {};
    try {
      if (name === "close") return gameWindow.close();
      if (name === "dock") return toolbar.classList.toggle("docked");
      if (name === "minimize") return toolbar.classList.toggle("minimized");
      if (name === "fullscreen") return gameWindow.document.fullscreenElement ? gameWindow.document.exitFullscreen() : gameWindow.document.documentElement.requestFullscreen();
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

  async function moveOldCopyToMyGames(record) {
    const oldFile = `${record.file} (old ${new Date().toISOString().replace(/[:.]/g, "-")})`;
    await saveGame(oldFile, record.text, { title: `${record.title || record.file} (old version)`, source: "upload" });
    return oldFile;
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

  return { buildGameDocument, clearData, connectionLabel, download, getGame, getLatestGame, getPinned, getRecent, getSavedGames, getStatus, hashText, icon, importData, importGame, installToolbar, isPinned, moveOldCopyToMyGames, normalizeFileName, play, recordRecent, removeGame, renameGame, saveGame, saveOffline, toggleOffline, togglePinned, toolbarAction };
})();

window.GameLibrary = GameLibrary;
