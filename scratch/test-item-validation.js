require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { login, openOrderByNumber, getAppFrame, saveAndCloseOrder, ensureDir } = require('../lib/dhlHelpers');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013724';

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless, slowMo: 150 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  try {
    console.log('Logging in...');
    await login(page, { email, password });

    console.log(`Opening order ${orderNumber}...`);
    await openOrderByNumber(page, orderNumber);
    await page.waitForTimeout(5000);

    const frame = getAppFrame(page);

    console.log('Validating items...');
    const priceInputs = frame.locator('td[data-col-index="3"] input.ssit-input-text');
    const weightInputs = frame.locator('td[data-col-index="4"] input.ssit-input-text');

    const count = await priceInputs.count();
    console.log(`Found ${count} items in the table.`);

    for (let i = 0; i < count; i++) {
      const priceInput = priceInputs.nth(i);
      const weightInput = weightInputs.nth(i);

      const priceValStr = await priceInput.inputValue();
      const weightValStr = await weightInput.inputValue();

      console.log(`Item ${i}: Price = "${priceValStr}", Weight = "${weightValStr}"`);

      const priceVal = parseFloat(priceValStr) || 0;
      const weightVal = parseFloat(weightValStr) || 0;

      if (priceVal <= 0) {
        console.log(`Item ${i}: Price is ${priceValStr}, filling with "1.00"`);
        await priceInput.click();
        await priceInput.fill('1.00');
        await priceInput.press('Tab');
        await page.waitForTimeout(500);
      }

      if (weightVal <= 0) {
        console.log(`Item ${i}: Weight is ${weightValStr}, filling with "0.01"`);
        await weightInput.click();
        await weightInput.fill('0.01');
        await weightInput.press('Tab');
        await page.waitForTimeout(500);
      }
    }

    console.log('Checking updated values...');
    for (let i = 0; i < count; i++) {
      const priceInput = priceInputs.nth(i);
      const weightInput = weightInputs.nth(i);
      const priceValStr = await priceInput.inputValue();
      const weightValStr = await weightInput.inputValue();
      console.log(`Item ${i} (updated): Price = "${priceValStr}", Weight = "${weightValStr}"`);
    }

    console.log('Saving order...');
    await saveAndCloseOrder(page);
    console.log('Order saved and closed.');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main();
