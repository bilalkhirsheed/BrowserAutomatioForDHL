require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013698';

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless, slowMo: 100 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('Logging in...');
    await login(page, { email, password });

    console.log(`Opening order ${orderNumber}...`);
    await openOrderByNumber(page, orderNumber);
    await page.waitForTimeout(7000);

    const frame = getAppFrame(page);

    console.log('Expanding Packaging section...');
    const packagingHeader = frame.locator('.order-section-title:has-text("Packaging"), .order-section-heading:has-text("Packaging"), *:has-text("Packaging details")').first();
    if (await packagingHeader.isVisible().catch(() => false)) {
      await packagingHeader.click().catch(() => {});
      await page.waitForTimeout(2000);
    }

    console.log('Locating Packaging section container...');
    const containerHTML = await frame.evaluate(() => {
      // Let's find any input with class default-package-select and go up to its section container
      const inp = document.querySelector('.default-package-select');
      if (!inp) return 'Not found .default-package-select';
      const container = inp.closest('.order-section-content, .packaging-section, form, div');
      return container ? container.outerHTML : 'No container found';
    });

    fs.writeFileSync('output/packaging-container-layout.html', containerHTML);
    console.log('Saved to output/packaging-container-layout.html');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
