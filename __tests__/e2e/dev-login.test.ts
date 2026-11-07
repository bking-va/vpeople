import { test, expect } from "@playwright/test";

test.describe("Dev Login", () => {
  test("should sign in with dev credentials and load /people", async ({
    page,
  }) => {
    await page.goto("http://localhost:3001/auth/signin");

    await expect(page.locator("text=vPeople")).toBeVisible();

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    await emailInput.fill("brendan.king@vendasta.com");

    const devLoginButton = page.locator('button:has-text("Dev Login")');
    await devLoginButton.click();

    await page.waitForURL((url) => url.pathname.includes('/people'), { timeout: 10000 });

    expect(page.url()).toContain("/people");

    console.log("✅ Dev Login test passed - redirected to /people");
  });
});
