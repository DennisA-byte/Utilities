const { test, expect } = require("@playwright/test");
const { pathToFileURL } = require("node:url");
const { readFile } = require("node:fs/promises");

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { window.__utilitiesRunningCommit = "test-running"; });
  await context.route("https://api.github.com/repos/DennisA-byte/Utilities/commits/main", async (route) => {
      await route.fulfill({ json: { sha: "test-running" } });
  });
});

test.describe("Utilities homepage", () => {
  test("shows the settings page with General as the default section", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page).toHaveURL(/settings\.html$/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
    await expect(page.getByRole("button", { name: "General" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Source & downloads" }).click();
    await expect(page.getByRole("heading", { name: "Source & downloads" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download source code" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download compiled app" })).toBeVisible();
  });

  test("opens the compiled app in a popup", async ({ page }) => {
    await page.route("**/AllFIles.html", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.goto("/settings.html");
    await expect(page).toHaveURL(/settings\.html$/);
    await page.getByRole("button", { name: "Source & downloads" }).click();
    await expect(page.getByRole("heading", { name: "Source & downloads" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open compiled app" })).toBeEnabled();

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("link", { name: "Open compiled app" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toMatch(/^blob:/);
    await expect(popup.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
    await expect(popup.locator('meta[name="utilities-running-source"]')).toHaveCount(1);
    const libraryPopupPromise = popup.waitForEvent("popup");
    await popup.getByRole("link", { name: "Browse all games" }).click();
    const libraryPopup = await libraryPopupPromise;
    await libraryPopup.waitForLoadState("domcontentloaded");
    await expect(libraryPopup.getByRole("heading", { name: "UGS Files" })).toBeVisible();
    await libraryPopup.close();
    await popup.close();
  });

  test("copies a standalone data URL that runs offline", async ({ page, context, browser }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:8000" });
    await page.goto("/settings.html");
    await page.getByRole("button", { name: "Source & downloads" }).click();
    await expect(page.getByRole("button", { name: "Copy standalone data URL" })).toBeEnabled();
    await page.getByRole("button", { name: "Copy standalone data URL" }).click();
    await expect(page.getByRole("status")).toContainText("data URLs cannot access browser storage");
    const dataUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(dataUrl).toMatch(/^data:text\/html;charset=utf-8;base64,/);

    const standaloneContext = await browser.newContext();
    try {
      await standaloneContext.setOffline(true);
      const standalonePage = await standaloneContext.newPage();
      await standalonePage.goto(dataUrl);
      await expect(standalonePage.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
      await standalonePage.getByRole("button", { name: "Settings" }).click();
      const settingsFrame = standalonePage.frameLocator('iframe[title="Settings"]');
      await expect(settingsFrame.getByRole("heading", { name: "General" })).toBeVisible();
      await settingsFrame.getByRole("button", { name: "Back to game library" }).click();

      const libraryPopupPromise = standalonePage.waitForEvent("popup");
      await standalonePage.getByRole("link", { name: "Browse all games" }).click();
      const libraryPopup = await libraryPopupPromise;
      await libraryPopup.waitForLoadState("domcontentloaded");
      await expect(libraryPopup.getByRole("heading", { name: "UGS Files" })).toBeVisible();
      await libraryPopup.close();
    } finally {
      await standaloneContext.close();
    }
  });

  test("downloaded compiled app loads all pages online and offline", async ({ page, context }, testInfo) => {
    await page.route("**/index.html", async (route) => {
      const response = await route.fetch();
      const html = await response.text();
      await route.fulfill({
        response,
        body: html.replace("</body>", "<!-- UTF-8 probe: caf\u00e9 \u{1F3AE} --></body>"),
      });
    });
    await page.goto("/settings.html");
    await expect(page).toHaveURL(/settings\.html$/);
    await page.getByRole("button", { name: "Source & downloads" }).click();
    await expect(page.getByRole("heading", { name: "Source & downloads" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download compiled app" })).toBeEnabled();
    await page.evaluate(() => {
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download === "utilities-compiled.html") window.__compiledDownloadUrl = this.href;
        return originalClick.call(this);
      };
    });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download compiled app" }).click();
    const download = await downloadPromise;
    expect(await page.evaluate(() => window.__compiledDownloadUrl)).toMatch(/^data:text\/html;charset=utf-8;base64,/);
    const compiledPath = testInfo.outputPath("utilities-compiled.html");
    await download.saveAs(compiledPath);
    expect(await readFile(compiledPath, "utf8")).toContain("UTF-8 probe: caf\u00e9 \u{1F3AE}");

    const compiledPage = await page.context().newPage();
    await compiledPage.goto(pathToFileURL(compiledPath).href);
    await expect(compiledPage.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
    const compiledUrl = compiledPage.url();
    await compiledPage.getByRole("button", { name: "Settings" }).click();
    const settingsFrame = compiledPage.frameLocator('iframe[title="Settings"]');
    await expect(settingsFrame.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(compiledPage).toHaveURL(compiledUrl);
    await settingsFrame.getByRole("button", { name: "Source & downloads" }).click();
    await expect(settingsFrame.getByRole("link", { name: "Download source code" })).toBeVisible();
    await expect(settingsFrame.getByRole("button", { name: "Download compiled app" })).toBeHidden();
    await expect(settingsFrame.getByRole("link", { name: "Open compiled app" })).toBeHidden();
    await settingsFrame.getByRole("button", { name: "Back to game library" }).click();
    await expect(compiledPage.locator('iframe[title="Settings"]')).toHaveCount(0);
    await expect(compiledPage.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
    await expect(compiledPage).toHaveURL(compiledUrl);
    const libraryPopupPromise = compiledPage.waitForEvent("popup");
    await compiledPage.getByRole("link", { name: "Browse all games" }).click();
    const libraryPopup = await libraryPopupPromise;
    await libraryPopup.waitForLoadState("domcontentloaded");
    await expect(libraryPopup.getByRole("heading", { name: "UGS Files" })).toBeVisible();
    await libraryPopup.close();
    await compiledPage.close();

    await context.unroute("https://api.github.com/repos/DennisA-byte/Utilities/commits/main");
    await context.setOffline(true);
    const offlinePage = await context.newPage();
    await offlinePage.goto(pathToFileURL(compiledPath).href);
    await expect(offlinePage.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
    const offlineWarning = offlinePage.getByRole("dialog", { name: "Update check unavailable" });
    await expect(offlineWarning).toBeVisible();
    await offlineWarning.getByRole("button", { name: "Close" }).click();
    const offlineUrl = offlinePage.url();
    await offlinePage.getByRole("button", { name: "Settings" }).click();
    const offlineSettings = offlinePage.frameLocator('iframe[title="Settings"]');
    await expect(offlineSettings.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(offlineSettings.getByRole("heading", { name: "General" })).toBeVisible();
    await expect(offlinePage).toHaveURL(offlineUrl);
    await offlineSettings.getByRole("button", { name: "Back to game library" }).click();
    await expect(offlinePage.locator('iframe[title="Settings"]')).toHaveCount(0);

    const offlineLibraryPopupPromise = offlinePage.waitForEvent("popup");
    await offlinePage.getByRole("link", { name: "Browse all games" }).click();
    const offlineLibrary = await offlineLibraryPopupPromise;
    await offlineLibrary.waitForLoadState("domcontentloaded");
    await expect(offlineLibrary.getByRole("heading", { name: "UGS Files" })).toBeVisible();
    await offlineLibrary.close();
    await offlinePage.close();
  });

  test("offers a download for newer versions opened from a file URL", async ({ page }, testInfo) => {
    await page.goto("/settings.html");
    await expect(page).toHaveURL(/settings\.html$/);
    await page.getByRole("button", { name: "Source & downloads" }).click();
    await expect(page.getByRole("heading", { name: "Source & downloads" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download compiled app" })).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download compiled app" }).click();
    const download = await downloadPromise;
    const compiledPath = testInfo.outputPath("utilities-update-test.html");
    await download.saveAs(compiledPath);

    const filePage = await page.context().newPage();
    await filePage.route("https://api.github.com/repos/DennisA-byte/Utilities/commits/main", async (route) => {
      await route.fulfill({ json: { sha: "newer-file-commit" } });
    });
    await filePage.goto(pathToFileURL(compiledPath).href);
    await expect(filePage.getByRole("dialog", { name: "A newer Utilities version is available" })).toBeVisible();
    await expect(filePage.getByRole("button", { name: "Download newer version" })).toBeVisible();
    await expect(filePage.getByRole("button", { name: "Refresh page" })).toHaveCount(0);
    await filePage.close();
  });

  test("disables settings while offline", async ({ page, context }) => {
    await page.goto("/index.html");
    await context.setOffline(true);
    await expect(page.getByRole("button", { name: "Settings" })).toBeDisabled();
    await expect(page.locator("#connection-status")).toContainText("Offline");
  });

  test("supports upload, rename, and confirmed delete in My games", async ({ page }) => {
    await page.goto("/index.html");
    const popupPromise = page.waitForEvent("popup");
    await page.locator("#upload-game").setInputFiles({
      name: "test-upload.html",
      mimeType: "text/html",
      buffer: Buffer.from("<!doctype html><title>Uploaded test</title><p>Uploaded test</p>"),
    });
    const gamePopup = await popupPromise;
    await gamePopup.close();

    await expect(page.getByRole("tab", { name: "My games" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("test-upload", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Rename game" }).click();
    await page.locator("#rename-input").fill("Renamed test");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText("Renamed test", { exact: true })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete game" }).click();
    await expect(page.locator(".empty").filter({ hasText: "No my games yet." })).toBeVisible();
  });

  test("shows the game toolbar fullscreen control and LED status", async ({ page }) => {
    await page.goto("/index.html");
    const browseLink = page.getByRole("link", { name: "Browse all games" });
    const lastTab = page.getByRole("tab", { name: "My games" });
    const uploadButton = page.locator(".upload-button");
    expect(await browseLink.evaluate((element) => element.compareDocumentPosition(document.querySelector(".upload-button")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    expect(await browseLink.evaluate((element, tab) => element.getBoundingClientRect().left > tab.getBoundingClientRect().right, await lastTab.elementHandle())).toBe(true);
    expect(await uploadButton.evaluate((element, browse) => element.getBoundingClientRect().left > browse.getBoundingClientRect().left, await browseLink.elementHandle())).toBe(true);

    const popupPromise = page.waitForEvent("popup");
    await page.locator("#upload-game").setInputFiles({
      name: "toolbar-test.html",
      mimeType: "text/html",
      buffer: Buffer.from("<!doctype html><title>Toolbar test</title>"),
    });
    const gamePopup = await popupPromise;
    await expect(gamePopup.locator("#utilities-toolbar")).toBeVisible();
    await expect(gamePopup.getByRole("button", { name: "Toggle fullscreen" })).toBeVisible();
    await expect(gamePopup.locator('[data-action="fullscreen"] svg')).toHaveCount(2);
    await expect(gamePopup.locator(".utilities-drag-region .utilities-drag-dot")).toHaveCount(6);
    await expect(gamePopup.locator(".utilities-saves summary svg")).toHaveCount(1);
    await expect(gamePopup.locator(".utilities-toolbar-status")).toHaveCount(0);
    const statusLed = await gamePopup.locator(".utilities-connection .utilities-status-led").evaluate((element) => getComputedStyle(element).boxShadow);
    expect(statusLed).toContain("114, 213, 114");
    await expect(gamePopup.locator('[data-action="fullscreen"] [data-icon="enter"] svg')).toHaveCSS("width", "18px");
    await expect(gamePopup.locator(".utilities-connection .utilities-status-led")).toHaveCSS("width", "10px");
    const beforeDrag = await gamePopup.locator("#utilities-toolbar").boundingBox();
    const dragBox = await gamePopup.locator(".utilities-drag-region").boundingBox();
    await gamePopup.mouse.move(dragBox.x + 10, dragBox.y + 8);
    await gamePopup.mouse.down();
    await gamePopup.mouse.move(dragBox.x + 60, dragBox.y + 38);
    await gamePopup.mouse.up();
    const afterDrag = await gamePopup.locator("#utilities-toolbar").boundingBox();
    expect(afterDrag.x).toBeGreaterThan(beforeDrag.x + 20);
    expect(afterDrag.y).toBeGreaterThan(beforeDrag.y + 10);
    await gamePopup.getByRole("button", { name: "Toggle fullscreen" }).click();
    await expect.poll(() => gamePopup.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await expect(gamePopup.locator('[data-action="fullscreen"] [data-icon="exit"]')).toBeVisible();
    await gamePopup.getByRole("button", { name: "Toggle fullscreen" }).click();
    await expect.poll(() => gamePopup.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
    await expect(gamePopup.locator('[data-action="fullscreen"] [data-icon="enter"]')).toBeVisible();
    await gamePopup.getByRole("button", { name: "Minimize to icon" }).click();
    await expect(gamePopup.locator('[data-action="minimize"] [data-icon="menu"]')).toBeVisible();
    await gamePopup.getByRole("button", { name: "Minimize to icon" }).click();
    await gamePopup.locator(".utilities-saves summary").click();
    await expect(gamePopup.locator(".utilities-save-menu button").first()).toHaveCSS("width", "120px");
    await gamePopup.close();
  });

  test("replaces legacy game toolbars with the current controls", async ({ page }) => {
    await page.goto("/index.html");
    const popupPromise = page.waitForEvent("popup");
    await page.locator("#upload-game").setInputFiles({
      name: "legacy-toolbar.html",
      mimeType: "text/html",
      buffer: Buffer.from("<!doctype html><style>#utilities-toolbar{color:red}</style><div id=utilities-toolbar>Old toolbar</div><script>document.getElementById('utilities-toolbar')</script><title>Legacy</title>"),
    });
    const gamePopup = await popupPromise;
    await expect(gamePopup.locator("#utilities-toolbar")).toHaveCount(1);
    await expect(gamePopup.getByRole("button", { name: "Toggle fullscreen" })).toBeVisible();
    await expect(gamePopup.locator(".utilities-connection .utilities-status-led")).toBeVisible();
    await gamePopup.close();
  });

  test("shows configurable notification dialogs and website update actions", async ({ page }) => {
    await page.route("https://api.github.com/repos/DennisA-byte/Utilities/commits/main", async (route) => {
      await route.fulfill({ json: { sha: "newer-commit", commit: { message: "New version" } } });
    });
    await page.goto("/index.html");
    await expect(page.getByRole("dialog", { name: "A newer Utilities version is available" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh page" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cache newest version" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "A newer Utilities version is available" }).getByRole("link", { name: "Open GitHub Pages" })).toHaveAttribute("href", "https://dennisa-byte.github.io/Utilities/");
    await page.evaluate(() => window.UtilitiesNotifications.warning("Warning", { message: "Check this", closable: false, buttons: [{ label: "Acknowledge" }] }));
    await expect(page.getByRole("dialog", { name: "Warning" })).toBeVisible();
    const warning = page.getByRole("dialog", { name: "Warning" });
    await expect(warning.getByRole("button", { name: "Close" })).toHaveCount(0);
    await expect(warning.getByRole("button", { name: "Acknowledge" })).toBeVisible();
    await expect(warning.getByRole("link", { name: "Open GitHub Pages" })).toBeVisible();
  });

  test("asks how to handle changed offline games and moves old copies to My games", async ({ page }) => {
    const oldGame = "<!doctype html><title>Old offline game</title><p>old</p>";
    const newGame = "<!doctype html><title>New offline game</title><p>new</p>";
    let latestGame = oldGame;
    await page.route("**/UGS-Files/test-offline.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: latestGame });
    });
    await page.goto("/index.html");
    await page.evaluate(async (text) => GameLibrary.saveGame("test-offline.html", text, { title: "Test offline game", source: "library" }), oldGame);
    latestGame = newGame;
    await page.evaluate(() => sessionStorage.setItem("utilities-last-update-check", String(Date.now() - (24 * 60 * 60 * 1000))));
    await page.reload();

    const updateDialog = page.getByRole("dialog", { name: "Offline game updates available" });
    await expect(updateDialog).toBeVisible();
    await expect(updateDialog.getByRole("combobox", { name: "Update choice for Test offline game" })).toBeVisible();
    await expect(updateDialog.getByRole("button", { name: "Yes to all" })).toBeVisible();
    await expect(updateDialog.getByRole("button", { name: "No to all" })).toBeVisible();
    await updateDialog.getByRole("button", { name: "Check all don't ask again", exact: true }).click();
    await updateDialog.getByRole("combobox", { name: "Update choice for Test offline game" }).selectOption("move");
    await updateDialog.getByRole("button", { name: "Apply choices" }).click();
    await page.getByRole("tab", { name: "My games" }).click();
    await expect(page.getByText("Test offline game (old version)", { exact: true })).toBeVisible();
  });

  test("does not show an update notification for the running commit", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.getByRole("dialog", { name: "A newer Utilities version is available" })).toHaveCount(0);
  });

  test("records an update check per tab and schedules the next one for 24 hours", async ({ page }) => {
    await page.goto("/index.html");
    const firstCheck = await page.evaluate(() => Number(sessionStorage.getItem("utilities-last-update-check")));
    expect(firstCheck).toBeGreaterThan(0);
    const schedule = await page.evaluate(() => {
      sessionStorage.setItem("utilities-last-update-check", String(Date.now() - (24 * 60 * 60 * 1000)));
      window.UtilitiesNotifications.scheduleUpdateCheck();
      return Number(sessionStorage.getItem("utilities-last-update-check"));
    });
    expect(schedule).toBeGreaterThan(firstCheck);
  });

  test("caches newer HTML in local storage without adding cookies", async ({ page }) => {
    await page.route("https://api.github.com/repos/DennisA-byte/Utilities/commits/main", async (route) => {
      await route.fulfill({ json: { sha: "newer-cache-commit" } });
    });
    await page.route("https://dennisa-byte.github.io/Utilities/", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Cached Utilities</title>" });
    });
    await page.context().addCookies([{ name: "utilities-cached-version-0", value: "legacy", domain: "127.0.0.1", path: "/" }]);
    await page.goto("/index.html");
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      page.getByRole("button", { name: "Cache newest version" }).click(),
    ]);
    const cachedPage = await page.context().newPage();
    await cachedPage.goto("/index.html");
    expect(await cachedPage.evaluate(() => localStorage.getItem("utilities-cached-version"))).toBe("<!doctype html><title>Cached Utilities</title>");
    await cachedPage.close();
    expect(await page.context().cookies()).toEqual([]);
  });
});

test("search hides nonmatching rows and their Actions controls", async ({ page }) => {
  await page.goto("/AllFIles.html");
  await expect(page.locator(".game-row").first()).toBeVisible();
  await page.locator("#searchInput").fill("cl2048");
  const visibleRows = page.locator(".game-row:not([hidden])");
  await expect(visibleRows).not.toHaveCount(0);
  const visibleValues = await visibleRows.locator("input[type=button]").evaluateAll((buttons) => buttons.map((button) => button.value));
  expect(visibleValues.every((value) => value.toLowerCase().includes("cl2048"))).toBe(true);
  await expect(visibleRows.first().locator(".menu-toggle")).toBeVisible();
  await expect(page.locator(".game-row[hidden]").first()).toBeHidden();
});
