require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { login, getAppFrame, ensureDir } = require('../lib/dhlHelpers');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless, slowMo: 150 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  try {
    console.log('Logging in...');
    await login(page, { email, password });

    console.log('Waiting for orders page...');
    if (!page.url().includes('/orders')) {
      await page.goto('https://app2.dhlexpresscommerce.com/orders', { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    await page.waitForTimeout(5000);

    const frame = getAppFrame(page);

    // Let's dynamically find the first order number from the rows
    console.log('Finding visible orders...');
    const orderNumber = await frame.evaluate(() => {
      // Find all cells that look like order numbers
      const rows = Array.from(document.querySelectorAll('tr, .order-row'));
      for (const row of rows) {
        const text = row.innerText || '';
        // Look for numbers like 100013724, 100013726, etc.
        const match = text.match(/\b(1000\d{5})\b/);
        if (match) {
          return match[1];
        }
      }
      return null;
    });

    if (!orderNumber) {
      throw new Error('No order numbers found on the page to inspect!');
    }

    console.log(`Dynamically found order number: ${orderNumber}`);

    // Click it to open
    const row = frame.locator('tr, [role="row"], .order-row')
      .filter({ hasText: orderNumber })
      .first();

    const orderLink = row.locator(`a:has-text("${orderNumber}"), [href*="${orderNumber}"]`).first();
    if (await orderLink.count() > 0) {
      await orderLink.click();
    } else {
      await row.click();
    }

    console.log('Waiting for order details to load...');
    await page.waitForTimeout(5000);

    // Get the frame of the opened order details
    const frames = page.frames();
    let detailFrame = null;
    for (const f of frames) {
      const url = f.url();
      if (url.includes('/orders/new/') || url.includes('/orders/edit/')) {
        detailFrame = f;
        console.log(`Found detail frame: ${url}`);
        break;
      }
    }

    if (!detailFrame) {
      throw new Error('Order details frame not found');
    }

    // Expand Customs details
    console.log('Expanding Customs details...');
    const customsHeader = detailFrame.locator('*:has-text("Customs details")').last();
    if (await customsHeader.isVisible()) {
      await customsHeader.click();
      await page.waitForTimeout(3000);
    }

    // Dump full HTML
    console.log('Dumping HTML...');
    const html = await detailFrame.content();
    ensureDir(OUTPUT_DIR);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'detail-frame.html'), html);
    console.log('HTML saved to output/detail-frame.html');

  } catch (err) {
    console.error('Error in script:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main();
