const { test, expect } = require("@playwright/test");

test.describe("Utilities homepage", () => {
  test("opens the compiled app as a data URL", async ({ page }) => {
    await page.goto("/index.html");
    const sourceTools = page.getByRole("button", { name: "Source & tools" });
    await expect(sourceTools).toBeEnabled();
    await sourceTools.click();

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("link", { name: "Open compiled app" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toMatch(/^blob:/);
    await expect(popup.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
    await popup.close();
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
