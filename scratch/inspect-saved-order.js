require('dotenv').config();
const { chromium } = require('playwright');
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

    console.log('Reading Packaging field values...');
    const values = await frame.evaluate(() => {
      const dropdown = document.querySelector('.package-selected-packing .k-input-value-text');
      const qtyInput = document.querySelector('td[data-col-index="1"] input.ssit-input-numeric');
      const weightInput = document.querySelector('input.default-package-select');
      
      return {
        packageType: dropdown ? dropdown.innerText.trim() : 'Not found',
        quantity: qtyInput ? qtyInput.value : 'Not found',
        weight: weightInput ? weightInput.value : 'Not found',
        qtyHTML: qtyInput ? qtyInput.outerHTML : '',
        weightHTML: weightInput ? weightInput.outerHTML : ''
      };
    });

    console.log('SAVED VALUES IN PORTAL:');
    console.log(JSON.stringify(values, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
