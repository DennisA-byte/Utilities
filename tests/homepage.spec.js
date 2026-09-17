const { test, expect } = require("@playwright/test");
const { pathToFileURL } = require("node:url");

test.describe("Utilities homepage", () => {
  test("opens the compiled app as a data URL", async ({ page }) => {
    await page.route("**/AllFIles.html", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.goto("/index.html");
    const sourceTools = page.getByRole("button", { name: "Source & tools" });
    await expect(sourceTools).toBeEnabled();
    await sourceTools.click();
    const openLink = page.getByRole("link", { name: "Preparing app..." });
    await expect(openLink).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("link", { name: "Open compiled app" })).toBeEnabled();

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("link", { name: "Open compiled app" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toMatch(/^blob:/);
    await expect(popup.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
    const libraryPopupPromise = popup.waitForEvent("popup");
    await popup.getByRole("link", { name: "Browse all games" }).click();
    const libraryPopup = await libraryPopupPromise;
    await libraryPopup.waitForLoadState("domcontentloaded");
    await expect(libraryPopup.getByRole("heading", { name: "UGS Files" })).toBeVisible();
    await libraryPopup.close();
    await popup.close();
  });

  test("downloaded compiled app opens its embedded game library", async ({ page }, testInfo) => {
    await page.goto("/index.html");
    await page.getByRole("button", { name: "Source & tools" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download compiled app" }).click();
    const download = await downloadPromise;
    const compiledPath = testInfo.outputPath("utilities-compiled.html");
    await download.saveAs(compiledPath);

    const compiledPage = await page.context().newPage();
    await compiledPage.goto(pathToFileURL(compiledPath).href);
    await expect(compiledPage.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
    const libraryPopupPromise = compiledPage.waitForEvent("popup");
    await compiledPage.getByRole("link", { name: "Browse all games" }).click();
    const libraryPopup = await libraryPopupPromise;
    await libraryPopup.waitForLoadState("domcontentloaded");
    await expect(libraryPopup.getByRole("heading", { name: "UGS Files" })).toBeVisible();
    await libraryPopup.close();
    await compiledPage.close();
  });

  test("disables source tools while offline", async ({ page, context }) => {
    await page.goto("/index.html");
    await context.setOffline(true);
    await expect(page.getByRole("button", { name: "Source & tools" })).toBeDisabled();
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
    expect(await browseLink.evaluate((element) => element.compareDocumentPosition(document.querySelector(".upload-button")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();

    const popupPromise = page.waitForEvent("popup");
    await page.locator("#upload-game").setInputFiles({
      name: "toolbar-test.html",
      mimeType: "text/html",
      buffer: Buffer.from("<!doctype html><title>Toolbar test</title>"),
    });
    const gamePopup = await popupPromise;
    await expect(gamePopup.locator("#utilities-toolbar")).toBeVisible();
    await expect(gamePopup.getByRole("button", { name: "Toggle fullscreen" })).toBeVisible();
    await expect(gamePopup.locator('[data-local-action="fullscreen"] svg')).toHaveCount(1);
    await expect(gamePopup.locator(".utilities-drag-region svg")).toHaveCount(1);
    await expect(gamePopup.locator(".utilities-saves summary svg")).toHaveCount(1);
    const statusLed = await gamePopup.locator(".utilities-toolbar-status").evaluate((element) => getComputedStyle(element, "::before").boxShadow);
    expect(statusLed).toContain("114, 213, 114");
    await gamePopup.getByRole("button", { name: "Toggle fullscreen" }).click();
    await expect.poll(() => gamePopup.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await gamePopup.keyboard.press("Escape");
    await gamePopup.close();
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
