const { test, expect } = require("@playwright/test");

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
