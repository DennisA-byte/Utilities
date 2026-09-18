(function () {
  const repository = "DennisA-byte/Utilities";
  const githubPagesUrl = "https://dennisa-byte.github.io/Utilities/";
  const cacheKey = "utilities-cached-version";
  const legacyCachePrefix = "utilities-cached-version";
  const updateInterval = 24 * 60 * 60 * 1000;
  const updateCheckKey = "utilities-last-update-check";
  const offlinePreferenceKey = "utilities-offline-update-preferences";
  let updateDialogOpen = false;
  const loadedScript = document.currentScript;
  const loadedScriptUrl = loadedScript?.src || "";

  function normalizeSource(source) {
    return source.replace(/\r\n/g, "\n").trim();
  }
  const cacheMarker = "utilities-cache-booting";

  function pageIsGithubPages() {
    return window.location.hostname.toLowerCase() === "dennisa-byte.github.io" && window.location.pathname.toLowerCase().startsWith("/utilities");
  }

  function isWebsite() {
    return window.location.protocol === "http:" || window.location.protocol === "https:";
  }

  function isDownloadContext() {
    return ["file:", "data:", "about:"].includes(window.location.protocol);
  }

  function readCachedVersion() {
    try {
      return localStorage.getItem(cacheKey) || "";
    } catch (error) {
      return "";
    }
  }

  function writeCachedVersion(html) {
    localStorage.setItem(cacheKey, html);
  }

  function clearLegacyCacheCookies() {
    const names = document.cookie.split("; ").map((entry) => entry.split("=", 1)[0]).filter((name) => name.startsWith(legacyCachePrefix));
    names.forEach((name) => { document.cookie = `${name}=;path=/;max-age=0;SameSite=Lax`; });
  }

  function readOfflinePreferences() {
    try { return JSON.parse(localStorage.getItem(offlinePreferenceKey) || "{}"); } catch (error) { return {}; }
  }

  function saveOfflinePreferences(preferences) {
    localStorage.setItem(offlinePreferenceKey, JSON.stringify(preferences));
  }

  async function applyOfflineDecision(change, decision) {
    if (decision === "keep") return;
    if (decision === "move") await GameLibrary.moveOldCopyToMyGames(change.record);
    await GameLibrary.saveGame(change.file, change.latestText, { title: change.record.title || change.file, source: "library", contentHash: change.latestHash });
  }

  function showOfflineUpdates(changes) {
    if (!changes.length || updateDialogOpen) return;
    updateDialogOpen = true;
    const dialog = document.createElement("dialog");
    dialog.className = "utility-notification utility-offline-updates";
    const heading = document.createElement("h2");
    heading.id = `offline-update-title-${Date.now()}`;
    dialog.setAttribute("aria-labelledby", heading.id);
    heading.textContent = "Offline game updates available";
    const message = document.createElement("p");
    message.textContent = "Choose what to do with each updated offline game.";
    const rows = document.createElement("div");
    rows.className = "offline-update-list";
    const preferenceState = readOfflinePreferences();
    changes.forEach((change) => {
      const row = document.createElement("label");
      row.className = "offline-update-row";
      row.dataset.file = change.file;
      const name = document.createElement("strong");
      name.textContent = change.record.title || change.file;
      const choice = document.createElement("select");
      choice.setAttribute("aria-label", `Update choice for ${change.record.title || change.file}`);
      [["update", "Update offline copy"], ["keep", "Do not update"], ["move", "Move old copy to My games and update"]].forEach(([value, label]) => {
        const option = document.createElement("option"); option.value = value; option.textContent = label; choice.appendChild(option);
      });
      const remember = document.createElement("input");
      remember.type = "checkbox";
      remember.className = "offline-update-remember";
      remember.setAttribute("aria-label", `Do not ask again for ${change.record.title || change.file}`);
      row.append(name, choice, remember);
      rows.appendChild(row);
    });
    const actions = document.createElement("div");
    actions.className = "notification-actions offline-update-actions";
    const close = () => { dialog.close(); dialog.remove(); updateDialogOpen = false; };
    const setAll = (value) => rows.querySelectorAll("select").forEach((select) => { select.value = value; });
    const addAction = (label, handler, primary = false) => { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.className = primary ? "notification-primary" : ""; button.addEventListener("click", handler); actions.appendChild(button); };
    addAction("Yes to all", () => setAll("update"));
    addAction("No to all", () => setAll("keep"));
    addAction("Check all don't ask again", () => rows.querySelectorAll(".offline-update-remember").forEach((input) => { input.checked = true; }));
    addAction("Uncheck all don't ask again", () => rows.querySelectorAll(".offline-update-remember").forEach((input) => { input.checked = false; }));
    addAction("Apply choices", async () => {
      const nextPreferences = { ...preferenceState };
      for (const change of changes) {
        const row = rows.querySelector(`[data-file="${CSS.escape(change.file)}"]`);
        const decision = row.querySelector("select").value;
        if (row.querySelector(".offline-update-remember").checked) nextPreferences[change.file] = decision;
        await applyOfflineDecision(change, decision);
      }
      saveOfflinePreferences(nextPreferences);
      close();
    }, true);
    addAction("Close", close);
    dialog.append(heading, message, rows, actions);
    document.body.appendChild(dialog);
    dialog.addEventListener("cancel", close);
    dialog.showModal();
  }

  async function checkForOfflineUpdates() {
    if (typeof GameLibrary === "undefined") return;
    const savedGames = (await GameLibrary.getSavedGames()).filter((record) => record.source !== "upload" && record.contentHash);
    const preferences = readOfflinePreferences();
    const changes = [];
    for (const record of savedGames) {
      try {
        const latestText = await GameLibrary.getLatestGame(record.file);
        const latestHash = await GameLibrary.hashText(latestText);
        if (latestHash === record.contentHash) continue;
        const remembered = preferences[record.file];
        if (remembered) await applyOfflineDecision({ file: record.file, record, latestText, latestHash }, remembered);
        else changes.push({ file: record.file, record, latestText, latestHash });
      } catch (error) { /* A missing remote game should not block other update prompts. */ }
    }
    showOfflineUpdates(changes);
  }

  function useCachedVersion() {
    if (!isWebsite() || pageIsGithubPages() || sessionStorage.getItem(cacheMarker)) return false;
    const html = readCachedVersion();
    if (!html) return false;
    sessionStorage.setItem(cacheMarker, "true");
    document.open();
    document.write(html);
    document.close();
    return true;
  }

  function finishCachedBoot() {
    if (sessionStorage.getItem(cacheMarker)) sessionStorage.removeItem(cacheMarker);
  }

  function makeButton(button, close) {
    const element = button.href ? document.createElement("a") : document.createElement("button");
    if (!button.href) element.type = "button";
    if (button.href) {
      element.href = button.href;
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    }
    element.textContent = button.label;
    element.className = button.primary ? "notification-primary" : "";
    element.addEventListener("click", async (event) => {
      if (button.href) return;
      event.preventDefault();
      element.disabled = true;
      try {
        await button.onClick?.();
        if (button.close !== false) close();
      } catch (error) {
        bodyNotification("error", "Could not complete that action.", { message: error.message });
      } finally {
        element.disabled = false;
      }
    });
    return element;
  }

  function bodyNotification(type, title, options = {}) {
    const dialog = document.createElement("dialog");
    dialog.className = `utility-notification utility-notification-${type}`;
    dialog.setAttribute("aria-labelledby", `notification-title-${Date.now()}`);
    const heading = document.createElement("h2");
    heading.id = dialog.getAttribute("aria-labelledby");
    heading.textContent = title;
    const message = document.createElement("p");
    message.textContent = options.message || "";
    const actions = document.createElement("div");
    actions.className = "notification-actions";
    const close = () => {
      dialog.close();
      dialog.remove();
    };
    (options.buttons || []).forEach((button) => actions.appendChild(makeButton(button, close)));
    if (!pageIsGithubPages()) actions.appendChild(makeButton({ label: "Open GitHub Pages", href: githubPagesUrl, close: false }, close));
    if (options.closable !== false) {
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "notification-close";
      closeButton.textContent = "Close";
      closeButton.addEventListener("click", close);
      actions.appendChild(closeButton);
    }
    dialog.append(heading, message, actions);
    document.body.appendChild(dialog);
    dialog.addEventListener("cancel", close);
    dialog.showModal();
    return { close, dialog };
  }

  async function fetchLatestCommit() {
    const response = await fetch(`https://api.github.com/repos/${repository}/commits/main`, { cache: "no-store" });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    return response.json();
  }

  function pageSourcePath() {
    const path = window.location.pathname.toLowerCase();
    return path.endsWith("allfiles.html") ? "AllFIles.html" : "index.html";
  }

  async function fetchRunningSource() {
    if (window.__utilitiesRunningPageSource) return window.__utilitiesRunningPageSource;
    if (window.__utilitiesRunningSource) return window.__utilitiesRunningSource;
    const embeddedSource = document.querySelector('meta[name="utilities-running-source"]')?.content;
    if (embeddedSource) return decodeURIComponent(escape(atob(embeddedSource)));
    const sourceUrl = isDownloadContext() ? loadedScriptUrl : new URL(pageSourcePath(), window.location.href).href;
    if (!sourceUrl) return "";
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) return "";
    return response.text();
  }

  async function findRunningCommit() {
    if (window.__utilitiesRunningCommit) return window.__utilitiesRunningCommit;
    const source = await fetchRunningSource();
    if (!source) return "";
    const hasEmbeddedPageSource = Boolean(window.__utilitiesRunningPageSource || window.__utilitiesRunningSource || document.querySelector('meta[name="utilities-running-source"]'));
    const path = hasEmbeddedPageSource ? pageSourcePath() : "notifications.js";
    const commitsResponse = await fetch(`https://api.github.com/repos/${repository}/commits?path=${path}&per_page=100`, { cache: "no-store" });
    if (!commitsResponse.ok) return "";
    const commits = await commitsResponse.json();
    for (const commit of commits) {
      const response = await fetch(`https://raw.githubusercontent.com/${repository}/${commit.sha}/${path}`, { cache: "no-store" });
      if (response.ok && normalizeSource(await response.text()) === normalizeSource(source)) return commit.sha;
    }
    return "";
  }

  async function downloadNewestVersion() {
    const response = await fetch(githubPagesUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("The newer version could not be downloaded.");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([await response.text()], { type: "text/html" }));
    link.download = "utilities.html";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function cacheNewestVersion() {
    const response = await fetch(githubPagesUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("The newer version could not be cached.");
    writeCachedVersion(await response.text());
    window.location.reload();
  }

  function showUpdate(latest) {
    if (updateDialogOpen) return;
    updateDialogOpen = true;
    const buttons = [];
    if (isDownloadContext()) {
      buttons.push({ label: "Download newer version", primary: true, onClick: downloadNewestVersion });
    } else {
      buttons.push({ label: "Refresh page", primary: true, onClick: () => window.location.reload() });
    }
    if (!pageIsGithubPages()) buttons.push({ label: "Cache newest version", onClick: cacheNewestVersion });
    bodyNotification("info", "A newer Utilities version is available", {
      message: `Main is now at ${latest.sha.slice(0, 7)}.`,
      buttons,
    });
  }

  async function checkForUpdates() {
    try {
      const [latest, runningCommit] = await Promise.all([fetchLatestCommit(), findRunningCommit()]);
      if (latest.sha && runningCommit && latest.sha !== runningCommit) showUpdate(latest);
      await checkForOfflineUpdates();
    } catch (error) {
      bodyNotification("warning", "Update check unavailable", { message: "Utilities could not check GitHub for a newer version." });
    }
  }

  function scheduleUpdateCheck() {
    const checkedAt = Number(sessionStorage.getItem(updateCheckKey) || 0);
    const elapsed = Date.now() - checkedAt;
    if (elapsed >= updateInterval) {
      sessionStorage.setItem(updateCheckKey, String(Date.now()));
      checkForUpdates();
    }
    window.setTimeout(scheduleUpdateCheck, Math.max(updateInterval - Math.max(elapsed, 0), 1000));
  }

  function addStyles() {
    const style = document.createElement("style");
    style.textContent = ".utility-notification{background:#252b35;border:1px solid #424b58;border-radius:6px;color:#f6f2e8;max-width:min(600px,calc(100% - 32px));padding:24px;width:100%}.utility-notification::backdrop{background:#0b0e12b8}.utility-notification h2{font:700 24px Georgia,serif;margin:0 0 8px}.utility-notification p{color:#b9b4a7;font:16px/1.5 Georgia,serif;margin:0 0 20px}.notification-actions{display:flex;flex-wrap:wrap;gap:8px}.notification-actions button{background:transparent;border:1px solid #424b58;border-radius:4px;color:#f6f2e8;cursor:pointer;font:700 13px Arial,sans-serif;padding:10px 12px}.notification-actions button:hover{border-color:#f0b35b}.notification-actions .notification-primary{background:#f0b35b;border-color:#f0b35b;color:#201a12}.utility-notification-warning{border-color:#f0c75e}.utility-notification-error{border-color:#d57272}.offline-update-list{display:grid;gap:10px;margin:16px 0}.offline-update-row{align-items:center;border-top:1px solid #424b58;display:grid;gap:8px;grid-template-columns:minmax(100px,1fr) minmax(150px,1.5fr) auto;padding:10px 0}.offline-update-row select{background:#1d2229;border:1px solid #424b58;border-radius:4px;color:#f6f2e8;padding:8px}.offline-update-row input{height:18px;width:18px}.offline-update-actions{border-top:1px solid #424b58;padding-top:14px}";
    document.head.appendChild(style);
  }

  window.UtilitiesNotifications = { error: (title, options) => bodyNotification("error", title, options), info: (title, options) => bodyNotification("info", title, options), warning: (title, options) => bodyNotification("warning", title, options), checkForUpdates, scheduleUpdateCheck, show: bodyNotification };
  clearLegacyCacheCookies();
  if (useCachedVersion()) return;
  finishCachedBoot();
  addStyles();
  window.addEventListener("DOMContentLoaded", scheduleUpdateCheck, { once: true });
})();
