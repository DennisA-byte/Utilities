const UtilitiesBackups = (() => {
  const format = "utilities-backup";
  const version = 1;
  const cachedSourceKey = "utilities-cached-version";
  const gameDataPrefix = "utilities-game-data:";
  const appDataGroups = [
    { id: "library", label: "Library organization", description: "Pinned games, recently played games, and play history." },
    { id: "offline-updates", label: "Offline update preferences", description: "Saved decisions for offline game updates." },
    { id: "other", label: "Other app settings", description: "Other saved Utilities settings." },
  ];
  const appDataKeyGroups = {
    "utilities-pinned-games": "library",
    "utilities-recent-games": "library",
    "utilities-played-games": "library",
    "utilities-offline-update-preferences": "offline-updates",
  };
  const encryptionIterations = 600000;
  const passwordVerifierText = "utilities-backup-password-check-v1";
  const recoveryHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Utilities Backup Recovery</title><h1>Utilities Backup Recovery</h1><p>Select an encrypted backup and enter its password. Decryption happens in this browser.</p><input id="backup-file" type="file" accept=".json,application/json"><input id="backup-password" type="password" autocomplete="current-password" placeholder="Backup password"><button id="decrypt-backup" type="button">Decrypt and download</button><p id="recovery-status" role="status"></p><script>document.getElementById("decrypt-backup").addEventListener("click",async function(){var status=document.getElementById("recovery-status"),file=document.getElementById("backup-file").files[0],password=document.getElementById("backup-password").value;try{if(!file||!password)throw new Error("Choose a backup and enter its password.");var envelope=JSON.parse(await file.text()),decode=function(value){return Uint8Array.from(atob(value),function(character){return character.charCodeAt(0);});},material=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:decode(envelope.encryption.salt),iterations:envelope.encryption.iterations,hash:"SHA-256"},material,256),key=await crypto.subtle.importKey("raw",bits,{name:"AES-GCM"},false,["decrypt"]),plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(envelope.encryption.iv),additionalData:new TextEncoder().encode(envelope.format+":"+envelope.version)},key,decode(envelope.ciphertext)),url=URL.createObjectURL(new Blob([plain],{type:"application/json"})),link=document.createElement("a");link.href=url;link.download="utilities-backup-decrypted.json";link.click();URL.revokeObjectURL(url);status.textContent="Backup decrypted and downloaded.";}catch(error){status.textContent="Could not decrypt backup. Check the password and file.";}});</script></html>`;

  function abortIfNeeded(signal) {
    if (signal?.aborted) throw new DOMException("Backup cancelled.", "AbortError");
  }

  async function checksum(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function encodeBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  function decodeBase64(value) {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  async function deriveEncryptionKeys(password, salt, iterations) {
    if (typeof password !== "string" || !password) throw new Error("Enter the backup password.");
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, 512));
    const encryptionKey = await crypto.subtle.importKey("raw", bits.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    const verifierKey = await crypto.subtle.importKey("raw", bits.slice(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    return { encryptionKey, verifierKey };
  }

  async function encryptBackup(plaintext, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const { encryptionKey, verifierKey } = await deriveEncryptionKeys(password, salt, encryptionIterations);
    const additionalData = new TextEncoder().encode(`${format}:${version}`);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, encryptionKey, new TextEncoder().encode(plaintext));
    const verifier = await crypto.subtle.sign("HMAC", verifierKey, new TextEncoder().encode(passwordVerifierText));
    return JSON.stringify({
      format,
      version,
      encrypted: true,
      encryption: {
        algorithm: "AES-GCM",
        kdf: "PBKDF2-SHA-256",
        iterations: encryptionIterations,
        salt: encodeBase64(salt),
        iv: encodeBase64(iv),
        passwordVerifier: encodeBase64(new Uint8Array(verifier)),
      },
      ciphertext: encodeBase64(new Uint8Array(ciphertext)),
      recoveryHtml,
    });
  }

  async function decryptBackup(envelope, password) {
    if (!password) throw new Error("Enter the backup password.");
    if (envelope.format !== format || envelope.version !== version || envelope.encrypted !== true || !envelope.encryption || typeof envelope.ciphertext !== "string") {
      throw new Error("That is not a supported encrypted Utilities backup.");
    }
    const encryption = envelope.encryption;
    if (encryption.algorithm !== "AES-GCM" || encryption.kdf !== "PBKDF2-SHA-256" || !Number.isInteger(encryption.iterations) || encryption.iterations < 100000) {
      throw new Error("The backup uses unsupported encryption settings.");
    }
    let keys;
    try {
      keys = await deriveEncryptionKeys(password, decodeBase64(encryption.salt), encryption.iterations);
      const verifierValid = await crypto.subtle.verify("HMAC", keys.verifierKey, decodeBase64(encryption.passwordVerifier), new TextEncoder().encode(passwordVerifierText));
      if (!verifierValid) throw new Error("Incorrect password or damaged backup.");
      const plaintext = await crypto.subtle.decrypt({
        name: "AES-GCM",
        iv: decodeBase64(encryption.iv),
        additionalData: new TextEncoder().encode(`${format}:${version}`),
      }, keys.encryptionKey, decodeBase64(envelope.ciphertext));
      return new TextDecoder().decode(plaintext);
    } catch (error) {
      if (error.message?.includes("password") || error.message?.includes("backup")) throw error;
      throw new Error("Incorrect password or damaged backup.");
    }
  }

  async function getServerTimestamp(signal) {
    try {
      const response = await fetch(window.location.href, { method: "HEAD", cache: "no-store", signal });
      return response.headers.get("date");
    } catch (error) {
      return null;
    }
  }

  async function getSourceCommit(signal) {
    if (window.__utilitiesRunningCommit) return window.__utilitiesRunningCommit;
    try {
      const embeddedSourceFiles = document.querySelector('meta[name="utilities-source-files"]')?.content;
      const source = embeddedSourceFiles
        ? JSON.parse(decodeURIComponent(escape(atob(embeddedSourceFiles))))["backups.html"]
        : await fetch("backups.html", { signal }).then((response) => response.ok ? response.text() : "");
      if (!source) return null;
      const commitsResponse = await fetch("https://api.github.com/repos/DennisA-byte/Utilities/commits?path=backups.html&per_page=10", { cache: "no-store", signal });
      if (!commitsResponse.ok) return null;
      const commits = await commitsResponse.json();
      for (const commit of commits) {
        abortIfNeeded(signal);
        const response = await fetch(`https://raw.githubusercontent.com/DennisA-byte/Utilities/${commit.sha}/backups.html`, { cache: "no-store", signal });
        if (response.ok && (await response.text()).replace(/\r\n/g, "\n").trim() === source.replace(/\r\n/g, "\n").trim()) return commit.sha;
      }
      return null;
    } catch (error) {
      abortIfNeeded(signal);
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

  function getSelectedAppData(selection) {
    const appData = getAppData();
    if (!Array.isArray(selection.appDataGroups)) return selection.includeAppData ? appData : {};
    const selectedGroups = new Set(selection.appDataGroups);
    return Object.fromEntries(Object.entries(appData).filter(([key]) => selectedGroups.has(appDataKeyGroups[key] || "other")));
  }

  async function getGameCode(file, signal) {
    abortIfNeeded(signal);
    const record = await GameLibrary.getSavedRecord(file);
    if (record) return record;
    const text = await GameLibrary.getLatestGame(file, { signal });
    return { file, text, title: file, source: "library", savedAt: Date.now() };
  }

  async function createSourceBundle(signal) {
    const paths = ["index.html", "AllFIles.html", "files.js", "game-storage.js", "notifications.js", "settings.html", "backups.html", "backups.js"];
    const embeddedSourceFiles = document.querySelector('meta[name="utilities-source-files"]')?.content;
    let sources;
    if (embeddedSourceFiles) {
      sources = JSON.parse(decodeURIComponent(escape(atob(embeddedSourceFiles))));
    } else {
      sources = Object.fromEntries(await Promise.all(paths.map(async (path) => {
        const response = await fetch(path, { signal });
        if (!response.ok) throw new Error(`Could not include source file ${path}.`);
        return [path, await response.text()];
      })));
    }
    const embeddedSources = JSON.stringify(sources).replace(/</g, "\\u003c");
    const optionMarkup = paths.map((path) => `<option value="${path}">${path}</option>`).join("");
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Utilities Source Bundle</title><style>body{font:15px/1.5 monospace;margin:24px}header{align-items:center;display:flex;flex-wrap:wrap;gap:12px}select,button{font:inherit;padding:8px}pre{background:#f1f3f5;max-height:70vh;overflow:auto;padding:16px;white-space:pre-wrap;word-break:break-word}</style><h1>Utilities Source Bundle</h1><p>This single offline HTML file contains the project source snapshot.</p><header><label for="source-file">File</label><select id="source-file">${optionMarkup}</select><button id="download-source" type="button">Download selected file</button></header><pre id="source-code"></pre><script>var sourceFiles=${embeddedSources},selector=document.getElementById("source-file"),display=document.getElementById("source-code");function render(){display.textContent=sourceFiles[selector.value];}selector.addEventListener("change",render);document.getElementById("download-source").addEventListener("click",function(){var link=document.createElement("a"),url=URL.createObjectURL(new Blob([sourceFiles[selector.value]],{type:"text/plain"}));link.href=url;link.download=selector.value.split("/").pop();link.click();URL.revokeObjectURL(url);});render();</script></html>`;
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
    const localTimestamp = new Date().toISOString();
    const serverTimestamp = getServerTimestamp(signal);
    const selectedAppDataGroups = Array.isArray(selection.appDataGroups)
      ? appDataGroups.filter((group) => selection.appDataGroups.includes(group.id)).map((group) => group.id)
      : selection.includeAppData ? appDataGroups.map((group) => group.id) : [];
    const appData = getSelectedAppData(selection);
    let nextGame = 0;
    let completedGames = 0;
    const games = [];
    const workers = Array.from({ length: Math.min(4, gamesToInclude.length) }, async () => {
      while (true) {
        abortIfNeeded(signal);
        const game = gamesToInclude[nextGame];
        if (!game) return;
        const current = nextGame;
        nextGame += 1;
        let record = null;
        if (game.includeCode && !await GameLibrary.getSavedRecord(game.file)) {
          options.onProgress?.({ stage: "gather", current: completedGames, total: gamesToInclude.length, message: `Getting data from ${game.title || game.file}`, state: "running" });
        }
        if (game.includeCode) record = await getGameCode(game.file, signal);
        const result = {
          file: game.file,
          title: record?.title || game.title || game.file,
          source: record?.source || game.source || "library",
          code: game.includeCode ? record.text : null,
          data: game.includeData ? GameLibrary.getGameData(game.file) : null,
        };
        games[current] = result;
        completedGames += 1;
        options.onProgress?.({ stage: "gather", current: completedGames, total: gamesToInclude.length, message: `Completed ${result.title}`, state: "complete" });
      }
    });
    options.onStage?.({ stage: "prepare", percent: 100, message: "Backup options checked", state: "complete" });
    await Promise.all(workers);
    abortIfNeeded(signal);

    options.onStage?.({ stage: "create", percent: 15, message: "Preparing backup manifest", state: "running" });
    const sourceCode = selection.includeSource ? await createSourceBundle(signal) : null;
    const body = { appData, games, sourceCode };
    const sourceCommit = await getSourceCommit(signal);
    options.onStage?.({ stage: "create", percent: 70, message: "Calculating backup checksum", state: "running" });
    const header = {
      createdAt: { local: localTimestamp, server: await serverTimestamp },
      included: {
        appData: selectedAppDataGroups.length > 0,
        appDataGroups: selectedAppDataGroups,
        appDataKeys: Object.keys(appData),
        games: games.map(({ file, code, data }) => ({ file, code: code !== null, data: data !== null })),
        sourceCode: Boolean(selection.includeSource),
      },
      sourceCommit,
      sourceUrl: sourceCommit ? `https://github.com/DennisA-byte/Utilities/tree/${sourceCommit}` : "https://github.com/DennisA-byte/Utilities",
      note: String(selection.note || "").slice(0, 500),
      checksum: await checksum(JSON.stringify(body)),
    };
    const plaintext = JSON.stringify({ format, version, header, recoveryHtml, body });
    options.onStage?.({ stage: "create", percent: 100, message: "Backup assembled", state: "complete" });
    abortIfNeeded(signal);
    if (options.password) {
      options.onStage?.({ stage: "encrypt", percent: 0, message: "Encrypting backup", state: "running" });
      const encrypted = await encryptBackup(plaintext, options.password);
      abortIfNeeded(signal);
      options.onStage?.({ stage: "encrypt", percent: 100, message: "Encrypted with AES-GCM", state: "complete" });
      return encrypted;
    }
    return plaintext;
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

  async function parseBackup(text, password) {
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("That file is not valid backup JSON.");
      throw error;
    }
    if (payload?.encrypted === true) {
      try {
        payload = JSON.parse(await decryptBackup(payload, password));
      } catch (error) {
        if (error instanceof SyntaxError) throw new Error("The decrypted backup contents are invalid.");
        throw error;
      }
    }
    payload = validatePayload(payload);
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

  async function restoreBackup(text, password) {
    const payload = await parseBackup(text, password);
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

  function listAppDataGroups() {
    return appDataGroups.map((group) => ({ ...group }));
  }

  return { createBackup, listAppDataGroups, listGames, parseBackup, recoveryHtml, restoreBackup };
})();
window.UtilitiesBackups = UtilitiesBackups;