const GameLibrary = (() => {
  const databaseName = "utilities-game-library";
  const storeName = "games";
  const pinnedKey = "utilities-pinned-games";
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

  async function getSaved(file) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName).objectStore(storeName).get(file);
      request.onsuccess = () => resolve(request.result?.text || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveOffline(file, text) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readwrite").objectStore(storeName).put({ file, text });
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
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
    openText(await getGame(file));
  }

  async function download(file) {
    const text = await getGame(file);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/html" }));
    link.download = normalizeFileName(file);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function toggleOffline(file) {
    const saved = await getSaved(file);
    if (saved === null) await saveOffline(file, await getGame(file));
    else await removeOffline(file);
    return getSaved(file);
  }

  return { download, getGame, getPinned, isPinned, normalizeFileName, play, toggleOffline, togglePinned };
})();
