require('dotenv').config();
const { chromium } = require('playwright');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013702';

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

    console.log('Expanding items section...');
    const itemsHeader = frame.locator('.order-section-title.items-section, .order-section-heading:has-text("Items")').first();
    await itemsHeader.click().catch(() => {});
    await page.waitForTimeout(3000);

    // Get original count
    const originalCount = await frame.locator('button.grid-button-ellipsis').count();
    console.log(`Original items count: ${originalCount}`);

    // 1. Click Add Item button
    console.log('Clicking Add Item button...');
    const addItemBtn = frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').first();
    await addItemBtn.click();
    await page.waitForTimeout(3000);

    // 2. Click Edit button on the new row
    console.log('Opening modal...');
    const editBtns = frame.locator('button.grid-button-edit');
    await editBtns.last().click();
    await page.waitForTimeout(3000);

    // 3. Fill out the modal fields
    const modal = frame.locator('div.blazored-modal').first();
    await modal.waitFor({ state: 'visible', timeout: 10000 });

    const nameInput = modal.locator('input[placeholder*="Short sleeve"]').first();
    const skuInput = modal.locator('input[placeholder*="Item SKU"]').first();
    const weightInput = modal.locator('input[type="number"][placeholder="1.0"]').first();
    const priceInput = modal.locator('input[type="number"][placeholder="00.00"]').first();
    const qtyInput = modal.locator('input.ssit-input-numeric').first();
    const qtyToShipInput = modal.locator('input.ssit-input-numeric').nth(1);

    await skuInput.fill('TP-MTSE-102300');
    await skuInput.press('Escape');
    await page.waitForTimeout(500);

    await nameInput.fill('Power Supply');
    await nameInput.press('Escape');
    await page.waitForTimeout(500);
    
    await qtyInput.fill('1');
    await qtyToShipInput.fill('1');
    await priceInput.fill('200');
    await weightInput.fill('2');

    await page.waitForTimeout(1000);

    // Click Update Order button
    console.log('Clicking Update Order button...');
    const updateBtn = modal.locator('button.btn-modal.add, button:has-text("Update order")').first();
    await updateBtn.click();
    await page.waitForTimeout(3000);

    // 4. Delete the original items
    console.log('Deleting other items...');
    while (true) {
      const row = frame.locator('tr:not(:has-text("TP-MTSE-102300")):has(button.grid-button-ellipsis)').first();
      const count = await row.count().catch(() => 0);
      if (count === 0) {
        console.log('No other items left to delete.');
        break;
      }

      console.log('Clicking ellipsis on an old item...');
      const ellipsis = row.locator('button.grid-button-ellipsis').first();
      await ellipsis.click();
      await page.waitForTimeout(1000);

      const deleteOption = frame.locator('.k-popup .k-menu-item:has-text("Delete"), .k-popup [role="roleitem"]:has-text("Delete"), .ssit-grid-menu-item:has-text("Delete")').first();
      await deleteOption.click({ force: true });
      await row.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    const rowClasses = await frame.evaluate(() => {
      return Array.from(document.querySelectorAll('.order-section-content.items-section tr, .items-section tr'))
        .map(tr => ({ className: tr.className, innerText: tr.innerText }));
    });
    console.log('Rows on page before Save:', JSON.stringify(rowClasses, null, 2));

    await page.screenshot({ path: 'output/debug-before-save.png', fullPage: true });
    console.log('Saved screenshot output/debug-before-save.png');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
