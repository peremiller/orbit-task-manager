import { test, expect } from "@playwright/test";

const sizes = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

for (const size of sizes) for (const colorScheme of ["light", "dark"]) {
  test(`anonymous login: ${size.width}px ${colorScheme}, focus, labels and layout`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size, colorScheme });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:3000/login?returnTo=%2Fprojects", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Sign in to Orbit" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Username" })).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();
    await expect(page.locator('input[name="returnTo"]')).toHaveValue("/projects");

    await page.getByLabel("Password").focus();
    await expect(page.getByLabel("Password")).toBeFocused();
    await page.getByRole("button", { name: /Sign in/i }).hover();
    await expect(page.getByRole("link", { name: "Open browser-only workspace" })).toBeVisible();

    const horizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth);
    expect(horizontalOverflow).toBeLessThanOrEqual(2);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test("incorrect password reports accessible error and retains safe return route", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/login?returnTo=%2Finbox");
  await page.getByRole("textbox", { name: "Username" }).fill("aj.miller");
  await page.getByLabel("Password").fill("definitely-incorrect");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
  await expect(page.locator('input[name="returnTo"]')).toHaveValue("/inbox");
});
