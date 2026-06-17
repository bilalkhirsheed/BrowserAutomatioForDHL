require('dotenv').config();
const { chromium } = require('playwright');
const { login, openOrderByNumber, getAppFrame, ensureDir } = require('../lib/dhlHelpers');
const path = require('path');
const fs = require('fs');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013702';
  const OUTPUT_DIR = path.join(__dirname, '..', 'output');
  ensureDir(OUTPUT_DIR);

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
    console.log('Page URL:', page.url());

    // Take initial screenshot
    await page.screenshot({ path: 'output/debug-100013702-opened.png', fullPage: true });
    console.log('Saved screenshot debug-100013702-opened.png');

    // 1. Setting package type
    const packageType = 'Mini';
    console.log(`Setting package type to: ${packageType}...`);
    const packageDropdown = frame.locator('span:has-text("Mini Package"), span:has-text("Midi Package"), span:has-text("Double Mini Package"), span:has-text("Envelpe"), span:has-text("Custom dimensions")').first();
    
    if (await packageDropdown.isVisible().catch(() => false)) {
      await packageDropdown.click();
      await page.waitForTimeout(1000);
      
      const option = frame.locator('.k-list-item, [role="option"], li').filter({ hasText: packageType }).first();
      if (await option.count() > 0) {
        await option.click();
        await page.waitForTimeout(1000);
      }
    }

    // Check if Weight input is visible
    const weightInput = frame.locator('#Weight, [name="Weight"]').first();
    console.log('Is Weight input visible:', await weightInput.isVisible().catch(() => false));
    console.log('Weight input outerHTML:', await weightInput.evaluate(el => el.outerHTML).catch(() => 'Not found'));

    // 2. Expand Items section
    console.log('Checking items section...');
    const addItemBtn = frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').first();
    const isAddBtnVisible = await addItemBtn.isVisible().catch(() => false);
    console.log('Is Add Item button visible before expand:', isAddBtnVisible);

    if (!isAddBtnVisible) {
      console.log('Items section appears collapsed. Clicking Items header to expand...');
      const itemsHeader = frame.locator('.order-section-title.items-section, .order-section-heading:has-text("Items")').first();
      await itemsHeader.click();
      await page.waitForTimeout(3000);
    }

    // Take screenshot after expand attempt
    await page.screenshot({ path: 'output/debug-100013702-expanded.png', fullPage: true });
    console.log('Saved screenshot debug-100013702-expanded.png');

    // Check Add item button again
    console.log('Is Add Item button visible after expand:', await addItemBtn.isVisible().catch(() => false));

    const deleteBtns = frame.locator('i.fas.fa-trash-alt');
    console.log('Delete buttons count:', await deleteBtns.count().catch(() => 0));

  } catch (err) {
    console.error('Error during debugging:', err);
  } finally {
    await browser.close();
  }
}

main();
