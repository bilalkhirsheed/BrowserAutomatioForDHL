require('dotenv').config();
const { chromium } = require('playwright');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013720';

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

    // Expand items section in Blazor (by clicking the header containing "Items")
    console.log('Expanding items section...');
    const itemsHeader = frame.locator('.order-section-title.items-section, .order-section-heading:has-text("Items")').first();
    await itemsHeader.click();
    await page.waitForTimeout(2000);

    const addItemBtn = frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').first();
    console.log('Clicking Add Item button...');
    await addItemBtn.click();
    await page.waitForTimeout(3000); // Wait for Blazor row to edit

    const result = await frame.evaluate(() => {
      return Array.from(document.querySelectorAll('input, select, textarea')).map(inp => ({
        tagName: inp.tagName,
        id: inp.id,
        name: inp.name,
        type: inp.type,
        value: inp.value,
        className: inp.className,
        outerHTML: inp.outerHTML.slice(0, 250)
      }));
    });

    console.log('=== INPUTS AFTER ADD ITEM CLICK ===');
    console.log(JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
