const { test, expect } = require("@playwright/test");
const { readFile } = require("node:fs/promises");

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.__utilitiesRunningCommit = "test-running";
    localStorage.setItem("utilities-first-launch-restore-asked", "true");
  });
  await context.route("https://api.github.com/repos/DennisA-byte/Utilities/commits/main", async (route) => {
    await route.fulfill({ json: { sha: "test-running" } });
  });
});

test("opens the backup page from Settings", async ({ page }) => {
  await page.goto("/settings.html");
  await page.getByRole("link", { name: "Backups" }).click();
  await expect(page).toHaveURL(/backups\.html$/);
  await expect(page.getByRole("heading", { name: "Backups" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start backup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore backup" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Backup settings" })).toBeVisible();
  await expect(page.getByLabel(/Confirm password/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
});

test("includes backup settings when the opt-in is enabled on the backup page", async ({ page }, testInfo) => {
  await page.goto("/backups.html");
  await page.getByLabel("Save these settings in the backup and enable Quick backup on the homepage").check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Start backup" }).click();
  await expect(page.getByRole("status")).toContainText("Backup downloaded.");
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath("settings-backup.json");
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, "utf8"));

  expect(backup.body.backupSettings).toMatchObject({
    note: "",
    includeSource: false,
    encrypt: false,
    games: [],
  });
});

test("loads saved backup settings into the backup page controls", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.setItem("utilities-backup-settings", JSON.stringify({
    note: "restore this profile",
    appDataGroups: ["other"],
    includeSource: true,
    encrypt: true,
    games: [],
  })));
  await page.goto("/backups.html");

  await expect(page.getByLabel("Save these settings in the backup and enable Quick backup on the homepage")).toBeChecked();
  await expect(page.locator("#backup-note")).toHaveValue("restore this profile");
  await expect(page.getByLabel("Include source code in a single file")).toBeChecked();
  await expect(page.getByLabel("Library organization")).not.toBeChecked();
  await expect(page.getByLabel("Other app settings")).toBeChecked();
  await page.getByRole("button", { name: "Encryption" }).click();
  await expect(page.getByLabel("Encrypt this backup")).toBeChecked();
  await expect(page.getByLabel("Password", { exact: true })).toBeEnabled();
});

test("creates a versioned backup from selected app and game data", async ({ page }) => {
  await page.goto("/index.html");
  await page.addScriptTag({ url: "/backups.js" });
  const backup = await page.evaluate(async () => {
    localStorage.setItem("utilities-pinned-games", JSON.stringify(["upload-fixture"]));
    localStorage.setItem("utilities-cached-version", "cached-source-must-not-be-backed-up");
    await GameLibrary.saveGame("upload-fixture", "<!doctype html><title>Fixture</title>", { title: "Fixture", source: "upload" });
    await GameLibrary.saveGameData("upload-fixture", { score: 42 });
    const text = await UtilitiesBackups.createBackup({
      note: "before update",
      includeAppData: true,
      games: [{ file: "upload-fixture", includeCode: true, includeData: true }],
    });
    return JSON.parse(text);
  });

  expect(backup.format).toBe("utilities-backup");
  expect(backup.version).toBe(1);
  expect(backup.header.note).toBe("before update");
  expect(backup.body.appData["utilities-pinned-games"]).toBe(JSON.stringify(["upload-fixture"]));
  expect(backup.body.appData["utilities-cached-version"]).toBeUndefined();
  expect(backup.body.games).toEqual([{
    file: "upload-fixture",
    title: "Fixture",
    source: "upload",
    code: "<!doctype html><title>Fixture</title>",
    data: { score: "42" },
  }]);
  expect(backup.header.checksum).toMatch(/^[a-f0-9]{64}$/);
  expect(backup.recoveryHtml).toContain("<!doctype html>");
});

test("saves selected backup settings in the backup and restores them for quick backup", async ({ page }) => {
  await page.goto("/index.html");
  await page.addScriptTag({ url: "/backups.js" });
  const result = await page.evaluate(async () => {
    await GameLibrary.saveGame("fixture", "<title>Fixture</title>", { title: "Fixture", source: "upload" });
    const selection = {
      note: "weekly",
      appDataGroups: ["library"],
      includeSource: true,
      saveSettings: true,
      games: [{ file: "fixture", includeCode: true, includeData: false }],
    };
    const backup = await UtilitiesBackups.createBackup(selection);
    const storedAfterCreate = UtilitiesBackups.getSavedSettings();
    localStorage.removeItem("utilities-backup-settings");
    await UtilitiesBackups.restoreBackup(backup);
    return { payload: JSON.parse(backup), storedAfterCreate, storedAfterRestore: UtilitiesBackups.getSavedSettings() };
  });

  expect(result.payload.body.backupSettings).toEqual({
    note: "weekly",
    appDataGroups: ["library"],
    includeSource: true,
    encrypt: false,
    games: [{ file: "fixture", includeCode: true, includeData: false }],
  });
  expect(result.storedAfterCreate).toEqual(result.payload.body.backupSettings);
  expect(result.storedAfterRestore).toEqual(result.payload.body.backupSettings);
});

test("preserves quick-backup settings unless the settings opt-in is explicitly disabled", async ({ page }) => {
  await page.goto("/index.html");
  await page.addScriptTag({ url: "/backups.js" });
  const result = await page.evaluate(async () => {
    const settings = {
      note: "keep profile",
      appDataGroups: ["library"],
      includeSource: false,
      encrypt: false,
      games: [],
    };
    UtilitiesBackups.saveSettings(settings);
    await UtilitiesBackups.createBackup({ appDataGroups: [], games: [] });
    const afterOrdinaryBackup = UtilitiesBackups.getSavedSettings();
    await UtilitiesBackups.createBackup({ appDataGroups: [], saveSettings: false, games: [] });
    return { afterOrdinaryBackup, afterOptOut: UtilitiesBackups.getSavedSettings() };
  });

  expect(result.afterOrdinaryBackup.note).toBe("keep profile");
  expect(result.afterOptOut).toBeNull();
});

test("remembers an encrypted backup password verifier without storing the password", async ({ page }) => {
  await page.goto("/index.html");
  await page.addScriptTag({ url: "/backups.js" });
  const result = await page.evaluate(async () => {
    const backup = await UtilitiesBackups.createBackup(
      { includeAppData: false, saveSettings: true, games: [] },
      { password: "remembered password" },
    );
    return {
      payload: JSON.parse(backup),
      storedVerifier: localStorage.getItem("utilities-backup-password-verifier"),
      matchingPassword: await UtilitiesBackups.matchesRememberedPassword("remembered password"),
      changedPassword: await UtilitiesBackups.matchesRememberedPassword("changed password"),
    };
  });

  expect(result.payload.encrypted).toBe(true);
  expect(result.storedVerifier).not.toContain("remembered password");
  expect(JSON.parse(result.storedVerifier)).toMatchObject({ version: 1, kdf: "PBKDF2-SHA-256" });
  expect(result.matchingPassword).toBe(true);
  expect(result.changedPassword).toBe(false);
});

test("restores selected backup data without clearing unrelated storage", async ({ page }) => {
  await page.goto("/index.html");
  await page.addScriptTag({ url: "/backups.js" });
  const result = await page.evaluate(async () => {
    localStorage.setItem("utilities-pinned-games", JSON.stringify(["upload-fixture"]));
    await GameLibrary.saveGame("upload-fixture", "<title>Fixture</title>", { title: "Fixture", source: "upload" });
    await GameLibrary.saveGameData("upload-fixture", { score: 42 });
    const backup = await UtilitiesBackups.createBackup({
      note: "restore me",
      includeAppData: true,
      games: [{ file: "upload-fixture", includeCode: true, includeData: true }],
    });

    localStorage.setItem("utilities-pinned-games", JSON.stringify(["different-game"]));
    localStorage.setItem("unrelated-user-data", "preserve me");
    await GameLibrary.saveGameData("upload-fixture", { score: 9 });
    await UtilitiesBackups.restoreBackup(backup);

    return {
      pinned: localStorage.getItem("utilities-pinned-games"),
      unrelated: localStorage.getItem("unrelated-user-data"),
      gameData: await GameLibrary.getGameData("upload-fixture"),
      game: await GameLibrary.getSavedRecord("upload-fixture"),
    };
  });

  expect(result.pinned).toBe(JSON.stringify(["upload-fixture"]));
  expect(result.unrelated).toBe("preserve me");
  expect(result.gameData).toEqual({ score: "42" });
  expect(result.game.text).toBe("<title>Fixture</title>");
});

test("rejects a damaged backup before changing stored data", async ({ page }) => {
  await page.goto("/index.html");
  await page.addScriptTag({ url: "/backups.js" });
  const result = await page.evaluate(async () => {
    localStorage.setItem("utilities-pinned-games", JSON.stringify(["before"]));
    const text = await UtilitiesBackups.createBackup({ includeAppData: true, games: [] });
    const damaged = JSON.parse(text);
    damaged.header.checksum = "0".repeat(64);
    localStorage.setItem("utilities-pinned-games", JSON.stringify(["current"]));
    let errorMessage = "";
    try {
      await UtilitiesBackups.restoreBackup(JSON.stringify(damaged));
    } catch (error) {
      errorMessage = error.message;
    }
    return { errorMessage, pinned: localStorage.getItem("utilities-pinned-games") };
  });

  expect(result.errorMessage).toContain("verification failed");
  expect(result.pinned).toBe(JSON.stringify(["current"]));
});

test("encrypts backups and rejects an incorrect password", async ({ page }) => {
  await page.goto("/index.html");
  await page.addScriptTag({ url: "/backups.js" });
  const result = await page.evaluate(async () => {
    localStorage.setItem("utilities-pinned-games", JSON.stringify(["encrypted-game"]));
    const selection = { note: "private note", includeAppData: true, games: [] };
    const encrypted = await UtilitiesBackups.createBackup(selection, { password: "correct horse battery staple" });
    const envelope = JSON.parse(encrypted);
    const parsed = await UtilitiesBackups.parseBackup(encrypted, "correct horse battery staple");
    let wrongPasswordError = "";
    try {
      await UtilitiesBackups.parseBackup(encrypted, "incorrect password");
    } catch (error) {
      wrongPasswordError = error.message;
    }
    return { envelope, parsed, wrongPasswordError };
  });

  expect(result.envelope.encrypted).toBe(true);
  expect(result.envelope.encryption.algorithm).toBe("AES-GCM");
  expect(result.envelope.encryption.passwordVerifier).toBeTruthy();
  expect(result.parsed.header.note).toBe("private note");
  expect(result.parsed.body.appData["utilities-pinned-games"]).toBe(JSON.stringify(["encrypted-game"]));
  expect(result.wrongPasswordError).toContain("password");
});

test("recovery HTML decrypts and downloads an encrypted backup", async ({ page }, testInfo) => {
  await page.goto("/index.html");
  await page.addScriptTag({ url: "/backups.js" });
  const encrypted = await page.evaluate(() => UtilitiesBackups.createBackup({ note: "recover me", includeAppData: false, games: [] }, { password: "recovery password" }));
  const recoveryHtml = JSON.parse(encrypted).recoveryHtml;
  await page.setContent(recoveryHtml);
  await page.locator("#backup-file").setInputFiles({ name: "encrypted-backup.json", mimeType: "application/json", buffer: Buffer.from(encrypted) });
  await page.getByPlaceholder("Backup password").fill("recovery password");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Decrypt and download" }).click();
  const download = await downloadPromise;
  const decryptedPath = testInfo.outputPath("decrypted-backup.json");
  await download.saveAs(decryptedPath);
  const decrypted = JSON.parse(await readFile(decryptedPath, "utf8"));

  expect(decrypted.header.note).toBe("recover me");
  expect(decrypted.format).toBe("utilities-backup");
});

test("keeps game localStorage data isolated by game", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/gh/bubbls/ugs-singlefile/UGS-Files/**", async (route) => {
    const filename = new URL(route.request().url()).pathname.split("/").pop().replace(/\.html$/, "");
    await route.fulfill({
      contentType: "text/html",
      body: `<html><head><script>localStorage.setItem("owner", ${JSON.stringify(filename)});</script></head><body></body></html>`,
    });
  });
  await page.goto("/index.html");
  await page.evaluate(() => {
    ["alpha", "beta"].forEach((file) => {
      const button = document.createElement("button");
      button.id = `play-${file}`;
      button.textContent = `Play ${file}`;
      button.onclick = () => GameLibrary.play(file);
      document.body.appendChild(button);
    });
  });

  const alphaPopupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Play alpha" }).click();
  const alphaPopup = await alphaPopupPromise;
  await expect.poll(() => alphaPopup.evaluate(() => localStorage.getItem("owner"))).toBe("alpha");
  const betaPopupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Play beta" }).click();
  const betaPopup = await betaPopupPromise;
  await expect.poll(() => betaPopup.evaluate(() => localStorage.getItem("owner"))).toBe("beta");

  const gameData = await page.evaluate(async () => ({
    alpha: await GameLibrary.getGameData("alpha"),
    beta: await GameLibrary.getGameData("beta"),
    parentOwner: localStorage.getItem("owner"),
  }));
  expect(gameData).toEqual({ alpha: { owner: "alpha" }, beta: { owner: "beta" }, parentOwner: null });
  await alphaPopup.close();
  await betaPopup.close();
});

test("downloads a backup containing selected game code and data", async ({ page }, testInfo) => {
  await page.goto("/backups.html");
  await page.evaluate(async () => {
    localStorage.setItem("utilities-pinned-games", JSON.stringify(["upload-fixture"]));
    await GameLibrary.saveGame("upload-fixture", "<title>Fixture</title>", { title: "Fixture", source: "upload" });
    await GameLibrary.saveGameData("upload-fixture", { score: 42 });
    GameLibrary.recordRecent("upload-fixture");
  });
  await page.reload();
  await page.locator("#games-navigation summary").click();
  await page.getByRole("button", { name: "Fixture", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Include Fixture code" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Include Fixture data" })).toBeChecked();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Start backup" }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath("selected-backup.json");
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, "utf8"));

  expect(backup.body.games).toEqual([{
    file: "upload-fixture",
    title: "Fixture",
    source: "upload",
    code: "<title>Fixture</title>",
    data: { score: "42" },
  }]);
  expect(backup.body.appData["utilities-pinned-games"]).toBe(JSON.stringify(["upload-fixture"]));
  await expect(page.locator("#backup-status")).toContainText("Backup downloaded");
});

test("restores an uploaded backup from the Backups page", async ({ page }, testInfo) => {
  await page.goto("/backups.html");
  const backupText = await page.evaluate(async () => {
    localStorage.setItem("utilities-pinned-games", JSON.stringify(["before"]));
    await GameLibrary.saveGame("upload-fixture", "<title>Restored</title>", { title: "Restored", source: "upload" });
    await GameLibrary.saveGameData("upload-fixture", { score: 64 });
    return UtilitiesBackups.createBackup({
      includeAppData: true,
      games: [{ file: "upload-fixture", includeCode: true, includeData: true }],
    });
  });
  const backupPath = testInfo.outputPath("restore-source.json");
  await testInfo.attach("restore-source", { body: backupText, contentType: "application/json" });
  const { writeFile } = require("node:fs/promises");
  await writeFile(backupPath, backupText);
  await page.evaluate(async () => {
    localStorage.setItem("utilities-pinned-games", JSON.stringify(["current"]));
    localStorage.setItem("unrelated-user-data", "keep");
    await GameLibrary.saveGameData("upload-fixture", { score: 1 });
  });

  await page.locator("#backup-file").setInputFiles(backupPath);
  await expect(page.locator("#backup-status")).toContainText("Backup restored");
  const restored = await page.evaluate(async () => ({
    pinned: localStorage.getItem("utilities-pinned-games"),
    unrelated: localStorage.getItem("unrelated-user-data"),
    gameData: await GameLibrary.getGameData("upload-fixture"),
    game: await GameLibrary.getSavedRecord("upload-fixture"),
  }));

  expect(restored.pinned).toBe(JSON.stringify(["before"]));
  expect(restored.unrelated).toBe("keep");
  expect(restored.gameData).toEqual({ score: "64" });
  expect(restored.game.text).toBe("<title>Restored</title>");
});

test("cancels an in-progress backup and restores the action buttons", async ({ page }) => {
  await page.goto("/backups.html");
  await page.evaluate(() => {
    UtilitiesBackups.createBackup = (_selection, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Backup cancelled.", "AbortError")), { once: true });
    });
  });

  await page.getByRole("button", { name: "Start backup" }).click();
  await expect(page.getByRole("button", { name: "Cancel backup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start backup" })).toBeHidden();
  await page.getByRole("button", { name: "Cancel backup" }).click();

  await expect(page.locator("#backup-status")).toContainText("Backup cancelled");
  await expect(page.getByRole("button", { name: "Start backup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore backup" })).toBeVisible();
});

test("cancels an in-flight game fetch", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("utilities-played-games", JSON.stringify(["slow-game"]));
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options = {}) => {
      if (String(input).includes("slow-game.html")) {
        window.__backupFetchSignal = options.signal;
        return new Promise((resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      }
      return originalFetch(input, options);
    };
  });
  await page.goto("/backups.html");
  await page.locator("#games-navigation summary").click();
  await page.getByRole("button", { name: "slow-game", exact: true }).click();
  await page.getByRole("checkbox", { name: "Include slow-game code" }).check();
  await page.getByRole("button", { name: "Start backup" }).click();
  await expect(page.getByText("Getting data from slow-game")).toBeVisible();
  await page.getByRole("button", { name: "Cancel backup" }).click();

  await expect(page.locator("#backup-status")).toContainText("Backup cancelled");
  expect(await page.evaluate(() => window.__backupFetchSignal.aborted)).toBe(true);
});

test("includes an offline single-file source bundle when selected", async ({ page }) => {
  await page.goto("/index.html");
  await page.addScriptTag({ url: "/backups.js" });
  const backup = await page.evaluate(async () => JSON.parse(await UtilitiesBackups.createBackup({
    includeAppData: false,
    includeSource: true,
    games: [],
  })));

  expect(backup.header.included.sourceCode).toBe(true);
  expect(backup.body.sourceCode).toContain("Utilities Source Bundle");
  expect(backup.body.sourceCode).toContain("backups.html");
  expect(backup.body.sourceCode).toContain("utilities-game-library");
  expect(backup.body.sourceCode).not.toContain("<script src=\"game-storage.js\">");
});

test("encrypts a backup without requiring a duplicate password field", async ({ page }, testInfo) => {
  await page.goto("/backups.html");
  await page.getByRole("button", { name: "Encryption" }).click();
  await page.getByRole("checkbox", { name: "Encrypt this backup" }).check();
  await page.getByLabel("Password", { exact: true }).fill("secure password");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Start backup" }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath("encrypted-ui-backup.json");
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, "utf8"));

  expect(backup.encrypted).toBe(true);
  expect(backup.encryption.algorithm).toBe("AES-GCM");
  expect(backup.ciphertext).toBeTruthy();
});

test("shows an error for an invalid restore file without changing app data", async ({ page }) => {
  await page.goto("/backups.html");
  await page.evaluate(() => localStorage.setItem("utilities-pinned-games", JSON.stringify(["keep-me"])));
  await page.locator("#backup-file").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("not json") });
  await expect(page.locator("#backup-status")).toContainText("not valid backup JSON");
  expect(await page.evaluate(() => localStorage.getItem("utilities-pinned-games"))).toBe(JSON.stringify(["keep-me"]));
});

test("opens Backups and creates a source backup in the compiled app", async ({ page }, testInfo) => {
  await page.goto("/index.html");
  await page.evaluate(async () => {
    localStorage.setItem("utilities-played-games", JSON.stringify(["cl1"]));
    await GameLibrary.saveGame("cl1", "<title>Compiled game fixture</title>", { title: "Compiled game fixture", source: "upload" });
    await GameLibrary.saveGameData("cl1", { score: 17 });
  });
  await page.goto("/settings.html");
  await page.getByRole("button", { name: "Source & downloads" }).click();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Open compiled app" }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
  await popup.getByRole("button", { name: "Settings" }).click();
  const settingsFrame = popup.frameLocator('iframe[title="Settings"]');
  await settingsFrame.getByRole("link", { name: "Backups" }).click();
  const backupsFrame = popup.frameLocator('iframe[title="Backups"]');
  await expect(backupsFrame.getByRole("heading", { name: "Backups" })).toBeVisible();
  await expect(backupsFrame.getByRole("button", { name: "Start backup" })).toBeVisible();
  await expect(backupsFrame.locator("#game-navigation button")).toHaveCount(1);
  await expect(backupsFrame.locator("#game-list-status")).toBeEmpty();
  await backupsFrame.locator("#games-navigation summary").click();
  await backupsFrame.getByRole("button", { name: "Compiled game fixture", exact: true }).click();
  await expect(backupsFrame.getByRole("checkbox", { name: "Include Compiled game fixture code" })).toBeVisible();
  await expect(backupsFrame.getByRole("checkbox", { name: "Include Compiled game fixture data" })).toBeVisible();
  await backupsFrame.getByRole("button", { name: "General" }).click();
  await backupsFrame.getByRole("checkbox", { name: "Include source code in a single file" }).check();
  await backupsFrame.getByLabel("Save these settings in the backup and enable Quick backup on the homepage").check();
  const downloadPromise = popup.waitForEvent("download");
  await backupsFrame.getByRole("button", { name: "Start backup" }).click();
  await expect(backupsFrame.locator("#backup-status")).toContainText("Backup downloaded");
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath("compiled-source-backup.json");
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  expect(backup.body.sourceCode).toContain("Utilities Source Bundle");
  expect(backup.body.sourceCode).toContain("backups.html");
  await expect(popup.getByRole("button", { name: "Quick backup" })).toBeVisible();
  await backupsFrame.getByRole("link", { name: "Back to Settings" }).click();
  await expect(settingsFrame.getByRole("link", { name: "Backups" })).toBeVisible();
  await popup.close();
});

test("backs up saved games when older storage scripts lack newer APIs", async ({ page }, testInfo) => {
  await page.goto("/index.html");
  await page.evaluate(async () => {
    localStorage.setItem("utilities-recent-games", JSON.stringify(["upload-legacy"]));
    await GameLibrary.saveGame("upload-legacy", "<title>Legacy saved game</title>", { title: "Legacy saved game", source: "upload" });
  });
  await page.context().route("**/game-storage.js", async (route) => {
    const response = await route.fetch();
    const script = (await response.text())
      .replace("download, getBackupGames, getGame,", "download, getGame,")
      .replace("getSavedGames, getSavedRecord, getStatus", "getSavedGames, getStatus");
    await route.fulfill({ response, body: script });
  });
  const backupsPage = await page.context().newPage();
  await backupsPage.goto("/backups.html");

  await expect(backupsPage.locator("#game-navigation button")).toHaveCount(1);
  await expect(backupsPage.locator("#game-list-status")).toBeEmpty();
  await expect(backupsPage.locator("#game-navigation button")).toHaveText("Legacy saved game");
  await backupsPage.getByRole("checkbox", { name: "Back up everything, including all app data, game code, game data, and source" }).check();
  await backupsPage.locator("#games-navigation summary").click();
  await backupsPage.getByRole("button", { name: "Legacy saved game", exact: true }).click();
  const downloadPromise = backupsPage.waitForEvent("download");
  await backupsPage.getByRole("button", { name: "Start backup" }).click();
  await expect(backupsPage.locator("#backup-status")).toContainText("Backup downloaded");
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath("legacy-storage-backup.json");
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  expect(backup.body.games).toEqual([{
    file: "upload-legacy",
    title: "Legacy saved game",
    source: "upload",
    code: "<title>Legacy saved game</title>",
    data: {},
  }]);
});

test("opens a dedicated backup settings page for each game in the Games dropdown", async ({ page }) => {
  await page.goto("/backups.html");
  await page.evaluate(async () => {
    await GameLibrary.saveGame("upload-page-fixture", "<title>Page fixture</title>", { title: "Page fixture", source: "upload" });
    await GameLibrary.saveGameData("upload-page-fixture", { score: 5 });
  });
  await page.reload();

  const gamesDropdown = page.locator("#games-navigation");
  await expect(gamesDropdown.locator("summary")).toHaveText("Games");
  await expect(page.locator(".settings-tree > ul > li > button", { hasText: "Games" })).toHaveCount(0);
  await gamesDropdown.locator("summary").click();
  await page.getByRole("button", { name: "Page fixture" }).click();

  await expect(page.locator(".settings-panel.active h3")).toHaveText("Page fixture");
  await expect(page.getByRole("checkbox", { name: "Include Page fixture code" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Include Page fixture data" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Include Page fixture code" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Include Page fixture data" })).toBeChecked();
});

test("backs up and restores everything selected from the master setting", async ({ page }, testInfo) => {
  await page.goto("/backups.html");
  const expectedAppData = {
    "utilities-pinned-games": JSON.stringify(["backup-alpha"]),
    "utilities-recent-games": JSON.stringify(["backup-alpha", "cl1"]),
    "utilities-played-games": JSON.stringify(["backup-alpha", "cl1"]),
    "utilities-offline-update-preferences": JSON.stringify({ "backup-alpha": "always" }),
    "utilities-custom-setting": "custom-value",
  };
  await page.evaluate(async (appData) => {
    Object.entries(appData).forEach(([key, value]) => localStorage.setItem(key, value));
    localStorage.setItem("utilities-cached-version", "large cache is not backup data");
    await GameLibrary.saveGame("backup-alpha", "<!doctype html><title>Backup Alpha</title>", { title: "Backup Alpha", source: "upload" });
    await GameLibrary.saveGameData("backup-alpha", { score: 123, level: "three" });
    await GameLibrary.saveGame("cl1", "<!doctype html><title>Backup Beta</title>", { title: "Backup Beta", source: "library" });
    await GameLibrary.saveGameData("cl1", { score: 456, level: "four" });
  }, expectedAppData);
  await page.reload();

  await page.getByRole("button", { name: "App data" }).click();
  await page.getByRole("checkbox", { name: "Back up everything, including all app data, game code, game data, and source" }).check();
  await expect(page.locator("#include-source")).toBeChecked();
  await page.locator("#games-navigation summary").click();
  await expect(page.locator("#game-navigation button")).toHaveCount(2);
  for (const gameName of ["Backup Alpha", "Backup Beta"]) {
    await page.getByRole("button", { name: gameName, exact: true }).click();
    await expect(page.getByRole("checkbox", { name: `Include ${gameName} code` })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: `Include ${gameName} data` })).toBeChecked();
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Start backup" }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath("everything-backup.json");
  await download.saveAs(backupPath);
  const backupText = await readFile(backupPath, "utf8");
  const backup = JSON.parse(backupText);
  expect(backup.body.appData).toEqual(expectedAppData);
  expect(backup.body.games.map(({ file, code, data }) => ({ file, code, data })).sort((a, b) => a.file.localeCompare(b.file))).toEqual([
    { file: "backup-alpha", code: "<!doctype html><title>Backup Alpha</title>", data: { score: "123", level: "three" } },
    { file: "cl1", code: "<!doctype html><title>Backup Beta</title>", data: { score: "456", level: "four" } },
  ]);
  expect(backup.body.sourceCode).toContain("Utilities Source Bundle");

  await page.evaluate(async () => {
    localStorage.clear();
    await GameLibrary.removeGame("backup-alpha");
    await GameLibrary.removeGame("cl1");
    localStorage.setItem("unrelated-user-data", "keep this value");
  });
  await page.locator("#backup-file").setInputFiles({
    name: "everything-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backupText),
  });
  await expect(page.locator("#backup-status")).toContainText("Backup restored");

  const restored = await page.evaluate(async () => {
    const appDataKeys = [
      "utilities-pinned-games",
      "utilities-recent-games",
      "utilities-played-games",
      "utilities-offline-update-preferences",
      "utilities-custom-setting",
    ];
    return {
      appData: Object.fromEntries(appDataKeys.map((key) => [key, localStorage.getItem(key)])),
      cachedVersion: localStorage.getItem("utilities-cached-version"),
      unrelated: localStorage.getItem("unrelated-user-data"),
      alpha: { record: await GameLibrary.getSavedRecord("backup-alpha"), data: await GameLibrary.getGameData("backup-alpha") },
      beta: { record: await GameLibrary.getSavedRecord("cl1"), data: await GameLibrary.getGameData("cl1") },
    };
  });
  expect(restored.appData).toEqual(expectedAppData);
  expect(restored.cachedVersion).toBeNull();
  expect(restored.unrelated).toBe("keep this value");
  expect(restored.alpha.record.text).toBe("<!doctype html><title>Backup Alpha</title>");
  expect(restored.alpha.record.source).toBe("upload");
  expect(restored.alpha.data).toEqual({ score: "123", level: "three" });
  expect(restored.beta.record.text).toBe("<!doctype html><title>Backup Beta</title>");
  expect(restored.beta.record.source).toBe("library");
  expect(restored.beta.data).toEqual({ score: "456", level: "four" });
  expect(restored.beta.record.source).toBe("library");
});

test("backs up only the selected application data category", async ({ page }, testInfo) => {
  await page.goto("/backups.html");
  await page.evaluate(() => {
    localStorage.setItem("utilities-pinned-games", JSON.stringify(["selected-game"]));
    localStorage.setItem("utilities-offline-update-preferences", JSON.stringify({ "selected-game": "always" }));
    localStorage.setItem("utilities-custom-setting", "exclude me");
  });
  await page.reload();
  await page.getByRole("button", { name: "App data" }).click();
  await page.getByRole("checkbox", { name: "Library organization" }).uncheck();
  await page.getByRole("checkbox", { name: "Other app settings" }).uncheck();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Start backup" }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath("selected-app-data.json");
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  expect(backup.body.appData).toEqual({
    "utilities-offline-update-preferences": JSON.stringify({ "selected-game": "always" }),
  });
});

test("places the everything option above tabs and locks individual selections", async ({ page }) => {
  await page.goto("/backups.html");
  await page.evaluate(async () => {
    localStorage.setItem("utilities-played-games", JSON.stringify(["cl1"]));
    await GameLibrary.saveGame("cl1", "<title>Test game</title>", { title: "Test game" });
    await GameLibrary.saveGameData("cl1", { score: 10 });
  });
  await page.reload();

  const backupEverything = page.getByRole("checkbox", { name: "Back up everything, including all app data, game code, game data, and source" });
  await expect(backupEverything).toBeVisible();
  expect(await page.evaluate(() => {
    const master = document.getElementById("backup-everything");
    const tabs = document.querySelector(".settings-layout");
    return Boolean(master.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await backupEverything.check();

  await page.getByRole("button", { name: "General" }).click();
  await expect(page.locator("#include-source")).toBeDisabled();
  await expect(page.getByLabel("Note to include")).toBeEnabled();

  await page.getByRole("button", { name: "App data" }).click();
  await expect(page.getByRole("checkbox", { name: "Library organization" })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "Offline update preferences" })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "Other app settings" })).toBeDisabled();

  await page.locator("#games-navigation summary").click();
  await page.getByRole("button", { name: "Test game", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Include Test game code" })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "Include Test game data" })).toBeDisabled();

  await page.getByRole("button", { name: "Encryption" }).click();
  await expect(page.getByRole("checkbox", { name: "Encrypt this backup" })).toBeEnabled();
  await page.getByRole("checkbox", { name: "Encrypt this backup" }).check();
  await expect(page.getByLabel("Password", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Confirm password", { exact: true })).toHaveCount(0);

  await backupEverything.uncheck();
  await page.getByRole("button", { name: "App data" }).click();
  await expect(page.getByRole("checkbox", { name: "Library organization" })).toBeEnabled();
});
