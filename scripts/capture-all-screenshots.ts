import { chromium } from "playwright";

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    console.log("1. Signing in...");
    await page.goto("http://localhost:3001/auth/signin");
    await page.fill('input[type="email"]', "brendan.king@vendasta.com");
    await page.click('button:has-text("Dev Login")');
    await page.waitForURL((url) => url.pathname.includes('/people'), { timeout: 10000 });
    console.log("✅ Logged in successfully");

    console.log("\n2. Capturing People Directory...");
    await page.goto("http://localhost:3001/people");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "/opt/cursor/artifacts/vpeople-directory.png" });
    console.log("✅ Saved vpeople-directory.png");

    console.log("\n3. Capturing Profile - Job Tab...");
    await page.goto("http://localhost:3001/people/2");
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Job")').catch(() => console.log("Job tab already active"));
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/opt/cursor/artifacts/vpeople-profile-job.png" });
    console.log("✅ Saved vpeople-profile-job.png");

    console.log("\n4. Capturing Profile - Compensation Tab...");
    const hasCompTab = await page.locator('text=Compensation').count();
    if (hasCompTab > 0) {
      try {
        await page.click('button:has-text("Compensation")', { timeout: 5000 });
      } catch {
        await page.click('text=Compensation', { timeout: 5000 });
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: "/opt/cursor/artifacts/vpeople-profile-compensation.png" });
      console.log("✅ Saved vpeople-profile-compensation.png");
    } else {
      console.log("⚠️  Compensation tab not found, capturing profile as-is");
      await page.screenshot({ path: "/opt/cursor/artifacts/vpeople-profile-compensation.png" });
      console.log("✅ Saved vpeople-profile-compensation.png (no tab switch)");
    }

    console.log("\n5. Capturing Org Chart...");
    await page.goto("http://localhost:3001/org-chart");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "/opt/cursor/artifacts/vpeople-org-chart.png" });
    console.log("✅ Saved vpeople-org-chart.png");

    console.log("\n6. Capturing Seats...");
    await page.goto("http://localhost:3001/seats");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "/opt/cursor/artifacts/vpeople-seats.png" });
    console.log("✅ Saved vpeople-seats.png");

    console.log("\n7. Capturing Time-off Approvals...");
    await page.goto("http://localhost:3001/time-off");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "/opt/cursor/artifacts/vpeople-time-off.png" });
    console.log("✅ Saved vpeople-time-off.png");

    console.log("\n✅ All screenshots captured successfully!");
  } catch (error) {
    console.error("❌ Error capturing screenshots:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

captureScreenshots();
