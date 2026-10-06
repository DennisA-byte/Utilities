const UtilitiesBackups = (() => {
  const format = "utilities-backup";
  const version = 1;
  const cachedSourceKey = "utilities-cached-version";
  const gameDataPrefix = "utilities-game-data:";
  const recoveryHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Utilities Backup Recovery</title><h1>Utilities Backup Recovery</h1><p>Select a Utilities backup JSON file and restore it from the Backups page.</p><input type="file" accept=".json,application/json">`;

  function abortIfNeeded(signal) {
    if (signal?.aborted) throw new DOMException("Backup cancelled.", "AbortError");
  }

  async function checksum(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function getServerTimestamp(signal) {
    try {
      const response = await fetch(window.location.href, { method: "HEAD", cache: "no-store", signal });
      return response.headers.get("date");
    } catch (error) {
      return null;
    }
  }

  function getAppData() {
    const appData = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key.startsWith("utilities-") || key === cachedSourceKey || key.startsWith(gameDataPrefix)) continue;
      appData[key] = localStorage.getItem(key);
    }
    return appData;
  }

  async function getGameCode(file, signal) {
    abortIfNeeded(signal);
    const record = await GameLibrary.getSavedRecord(file);
    if (record) return record;
    const text = await GameLibrary.getLatestGame(file);
    return { file, text, title: file, source: "library", savedAt: Date.now() };
  }

  function validateSelection(selection) {
    if (!selection || typeof selection !== "object" || !Array.isArray(selection.games)) {
      throw new Error("Choose the data to include in the backup.");
    }
    const seen = new Set();
    return selection.games.filter((game) => {
      if (!game || typeof game.file !== "string" || !game.file || seen.has(game.file)) {
        throw new Error("The selected game list is invalid.");
      }
      seen.add(game.file);
      return game.includeCode || game.includeData;
    });
  }

  async function createBackup(selection, options = {}) {
    const gamesToInclude = validateSelection(selection);
    const signal = options.signal;
    const appData = selection.includeAppData ? getAppData() : {};
    let complete = 0;
    const games = [];
    const workers = Array.from({ length: Math.min(4, gamesToInclude.length) }, async () => {
      while (true) {
        abortIfNeeded(signal);
        const game = gamesToInclude[complete];
        if (!game) return;
        const current = complete;
        complete += 1;
        let record = null;
        if (game.includeCode) record = await getGameCode(game.file, signal);
        const result = {
          file: game.file,
          title: record?.title || game.title || game.file,
          source: record?.source || game.source || "library",
          code: game.includeCode ? record.text : null,
          data: game.includeData ? GameLibrary.getGameData(game.file) : null,
        };
        games[current] = result;
        options.onProgress?.({ stage: "gather", current: current + 1, total: gamesToInclude.length, message: `Gathered ${result.title}` });
      }
    });
    await Promise.all(workers);
    abortIfNeeded(signal);

    const body = { appData, games };
    const sourceCommit = window.__utilitiesRunningCommit || null;
    const header = {
      createdAt: { local: new Date().toISOString(), server: await getServerTimestamp(signal) },
      included: {
        appData: Boolean(selection.includeAppData),
        games: games.map(({ file, code, data }) => ({ file, code: code !== null, data: data !== null })),
        sourceCode: Boolean(selection.includeSource),
      },
      sourceCommit,
      sourceUrl: sourceCommit ? `https://github.com/DennisA-byte/Utilities/tree/${sourceCommit}` : "https://github.com/DennisA-byte/Utilities",
      note: String(selection.note || "").slice(0, 500),
      checksum: await checksum(JSON.stringify(body)),
    };
    return JSON.stringify({ format, version, header, recoveryHtml, body });
  }

  function validatePayload(payload) {
    if (!payload || payload.format !== format || payload.version !== version || !payload.header || !payload.body || typeof payload.body !== "object") {
      throw new Error("That is not a supported Utilities backup.");
    }
    if (!payload.body.appData || typeof payload.body.appData !== "object" || Array.isArray(payload.body.appData) || !Array.isArray(payload.body.games)) {
      throw new Error("The backup contents are invalid.");
    }
    return payload;
  }

  async function parseBackup(text) {
    let payload;
    try {
      payload = validatePayload(JSON.parse(text));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("That file is not valid backup JSON.");
      throw error;
    }
    if (await checksum(JSON.stringify(payload.body)) !== payload.header.checksum) {
      throw new Error("Backup verification failed. The file may be incomplete or damaged.");
    }
    return payload;
  }

  function validateAppData(appData) {
    return Object.entries(appData).map(([key, value]) => {
      if (!key.startsWith("utilities-") || key === cachedSourceKey || key.startsWith(gameDataPrefix) || typeof value !== "string") {
        throw new Error("The backup contains invalid application data.");
      }
      return [key, value];
    });
  }

  async function restoreBackup(text) {
    const payload = await parseBackup(text);
    const appData = validateAppData(payload.body.appData);
    const restoredGames = [];
    const gameData = [];
    const seen = new Set();
    payload.body.games.forEach((game) => {
      if (!game || typeof game.file !== "string" || !game.file || seen.has(game.file)) throw new Error("The backup contains an invalid game list.");
      seen.add(game.file);
      if (game.code !== null && typeof game.code !== "string") throw new Error(`The game code for ${game.file} is invalid.`);
      if (game.data !== null && (!game.data || typeof game.data !== "object" || Array.isArray(game.data))) throw new Error(`The game data for ${game.file} is invalid.`);
      if (game.code !== null) {
        const isLibraryGame = typeof files !== "undefined" && Array.isArray(files) && files.includes(game.file.replace(/\.html?$/i, ""));
        restoredGames.push({ file: game.file, text: game.code, title: game.title || game.file, source: isLibraryGame && game.source !== "upload" ? "library" : "upload" });
      }
      if (game.data !== null) gameData.push([game.file, game.data]);
    });

    await GameLibrary.restoreBackupGames(restoredGames);
    appData.forEach(([key, value]) => localStorage.setItem(key, value));
    gameData.forEach(([file, data]) => GameLibrary.saveGameData(file, data));
    return { restoredAppKeys: appData.length, restoredGames: restoredGames.length, restoredGameData: gameData.length };
  }

  async function listGames() {
    return GameLibrary.getBackupGames();
  }

  return { createBackup, listGames, parseBackup, recoveryHtml, restoreBackup };
})();