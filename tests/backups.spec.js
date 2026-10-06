const { test, expect } = require("@playwright/test");
const { readFile } = require("node:fs/promises");

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { window.__utilitiesRunningCommit = "test-running"; });
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
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
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
    data: { score: 42 },
  }]);
  expect(backup.header.checksum).toMatch(/^[a-f0-9]{64}$/);
  expect(backup.recoveryHtml).toContain("<!doctype html>");
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
  expect(result.gameData).toEqual({ score: 42 });
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
