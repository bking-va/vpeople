import { chromium } from "playwright";

async function manualTest() {
  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Navigating to signin...");
  await page.goto("http://localhost:3001/auth/signin");

  console.log("Filling email...");
  await page.fill('input[type="email"]', "brendan.king@vendasta.com");

  console.log("Clicking Dev Login...");
  await page.click('button:has-text("Dev Login")');

  console.log("Waiting for navigation...");
  await page.waitForTimeout(5000);

  console.log("Current URL:", page.url());

  if (!page.url().includes('/people')) {
    console.log("NOT redirected to /people!");
    const content = await page.content();
    console.log("Page content:", content.substring(0, 1000));
  } else {
    console.log("✅ Successfully redirected to /people!");
  }

  await browser.close();
}

manualTest().catch(console.error);
