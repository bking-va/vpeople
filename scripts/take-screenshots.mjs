import { chromium } from 'playwright';

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    console.log('📸 Taking screenshots...');
    
    // Sign in page
    console.log('1. Navigating to sign-in page...');
    await page.goto('http://localhost:3000/auth/signin');
    await page.waitForTimeout(2000);
    
    // Dev login
    console.log('2. Signing in with dev account...');
    await page.fill('input[name="email"]', 'brendan.king@vendasta.com');
    
    // Navigate directly to people page (bypassing problematic auth for screenshots)
    console.log('   Navigating directly to people page...');
    await page.goto('http://localhost:3000/people');
    await page.waitForTimeout(3000);
    
    // People directory
    console.log('3. Capturing People Directory...');
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/vpeople-directory.png',
      fullPage: false
    });
    
    // Click on Sarah Martinez to view profile
    console.log('4. Navigating to employee profile...');
    await page.click('a:has-text("Sarah Martinez")');
    await page.waitForTimeout(2000);
    
    // Capture Personal tab (default)
    console.log('5. Capturing Employee Profile - Personal tab...');
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/vpeople-profile-personal.png',
      fullPage: false
    });
    
    // Click Job tab
    console.log('6. Capturing Employee Profile - Job tab...');
    await page.click('button:has-text("Job")');
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/vpeople-profile-job.png',
      fullPage: false
    });
    
    // Click Compensation tab
    console.log('7. Capturing Employee Profile - Compensation tab...');
    await page.click('button:has-text("Compensation")');
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/vpeople-profile-compensation.png',
      fullPage: false
    });
    
    // Org Chart
    console.log('8. Navigating to Org Chart...');
    await page.click('a:has-text("Org Chart")');
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/vpeople-org-chart.png',
      fullPage: false
    });
    
    // Seats
    console.log('9. Navigating to Seats...');
    await page.click('a:has-text("Seats")');
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/vpeople-seats.png',
      fullPage: false
    });
    
    // Time Off (with pending approvals)
    console.log('10. Navigating to Time Off...');
    await page.click('a:has-text("Time Off")');
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/vpeople-time-off.png',
      fullPage: false
    });
    
    console.log('✅ All screenshots captured successfully!');
  } catch (error) {
    console.error('❌ Screenshot capture failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

takeScreenshots().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
