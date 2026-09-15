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

  async function getGame(file) {
    const saved = await getSaved(file);
    if (saved !== null) return saved;
    const response = await fetch(`${gameUrl(file)}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`Could not load ${file}`);
    return response.text();
  }

  function openText(text) {
    const newWindow = window.open("about:blank", "_blank");
    if (!newWindow) throw new Error("Allow pop-ups to open the game.");
    newWindow.document.open();
    newWindow.document.write(text);
    newWindow.document.close();
  }

  async function play(file) {
    const text = await getGame(file);
    recordRecent(file);
    openText(text);
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

  return { download, getGame, getPinned, getRecent, getSavedGames, importGame, isPinned, normalizeFileName, play, recordRecent, saveGame, saveOffline, toggleOffline, togglePinned };
})();
