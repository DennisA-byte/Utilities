(function () {
  const repository = "DennisA-byte/Utilities";
  const githubPagesUrl = "https://dennisa-byte.github.io/Utilities/";
  const currentCommit = "7380fb1";
  const cachePrefix = "utilities-cached-version";
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

  function readCookie(name) {
    const item = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
    return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
  }

  function readCachedVersion() {
    const count = Number(readCookie(`${cachePrefix}-count`));
    if (!count) return "";
    return Array.from({ length: count }, (_, index) => readCookie(`${cachePrefix}-${index}`)).join("");
  }

  function writeCachedVersion(html) {
    const encoded = encodeURIComponent(html);
    const chunkSize = 3000;
    const count = Math.ceil(encoded.length / chunkSize);
    document.cookie = `${cachePrefix}-count=${count};path=/;max-age=31536000;SameSite=Lax`;
    for (let index = 0; index < count; index += 1) {
      document.cookie = `${cachePrefix}-${index}=${encoded.slice(index * chunkSize, (index + 1) * chunkSize)};path=/;max-age=31536000;SameSite=Lax`;
    }
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
      const latest = await fetchLatestCommit();
      if (latest.sha && latest.sha !== currentCommit) showUpdate(latest);
    } catch (error) {
      bodyNotification("warning", "Update check unavailable", { message: "Utilities could not check GitHub for a newer version." });
    }
  }

  function addStyles() {
    const style = document.createElement("style");
    style.textContent = ".utility-notification{background:#252b35;border:1px solid #424b58;border-radius:6px;color:#f6f2e8;max-width:min(460px,calc(100% - 32px));padding:24px;width:100%}.utility-notification::backdrop{background:#0b0e12b8}.utility-notification h2{font:700 24px Georgia,serif;margin:0 0 8px}.utility-notification p{color:#b9b4a7;font:16px/1.5 Georgia,serif;margin:0 0 20px}.notification-actions{display:flex;flex-wrap:wrap;gap:8px}.notification-actions button{background:transparent;border:1px solid #424b58;border-radius:4px;color:#f6f2e8;cursor:pointer;font:700 13px Arial,sans-serif;padding:10px 12px}.notification-actions button:hover{border-color:#f0b35b}.notification-actions .notification-primary{background:#f0b35b;border-color:#f0b35b;color:#201a12}.utility-notification-warning{border-color:#f0c75e}.utility-notification-error{border-color:#d57272}";
    document.head.appendChild(style);
  }

  window.UtilitiesNotifications = { error: (title, options) => bodyNotification("error", title, options), info: (title, options) => bodyNotification("info", title, options), warning: (title, options) => bodyNotification("warning", title, options), checkForUpdates, show: bodyNotification };
  if (useCachedVersion()) return;
  finishCachedBoot();
  addStyles();
  window.addEventListener("DOMContentLoaded", () => checkForUpdates(), { once: true });
})();
