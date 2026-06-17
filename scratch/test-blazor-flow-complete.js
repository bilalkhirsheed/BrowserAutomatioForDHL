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

    // Get original count of items
    const originalCount = await frame.locator('button.grid-button-ellipsis').count();
    console.log(`Original items count: ${originalCount}`);

    // 1. Click Add Item button to add a new row
    console.log('Clicking Add Item button...');
    const addItemBtn = frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').first();
    await addItemBtn.click();
    await page.waitForTimeout(3000);

    // 2. Click Edit button on the newly added row
    console.log('Opening modal for the newly added row...');
    const editBtns = frame.locator('button.grid-button-edit');
    await editBtns.last().click();
    await page.waitForTimeout(3000);

    // 3. Fill out the modal fields
    console.log('Locating modal inputs...');
    const modal = frame.locator('div.blazored-modal').first();
    await modal.waitFor({ state: 'visible', timeout: 10000 });

    const nameInput = modal.locator('input[placeholder*="Short sleeve"]').first();
    const skuInput = modal.locator('input[placeholder*="Item SKU"]').first();
    const weightInput = modal.locator('input[type="number"][placeholder="1.0"]').first();
    const priceInput = modal.locator('input[type="number"][placeholder="00.00"]').first();
    const qtyInput = modal.locator('input.ssit-input-numeric').first();
    const qtyToShipInput = modal.locator('input.ssit-input-numeric').nth(1);

    console.log('Filling fields in modal...');
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
    console.log('Clicking Update Order button in modal...');
    const updateBtn = modal.locator('button.btn-modal.add, button:has-text("Update order")').first();
    await updateBtn.click();
    
    // Wait for modal to close and changes to apply
    await page.waitForTimeout(3000);
    console.log('Modal closed. Checking items list...');

    // 4. Delete the original items (only those that do not match our new item's SKU)
    console.log('Deleting other items...');
    while (true) {
      // Find index of first row that does not contain our SKU value in its input
      const oldRowIndex = await frame.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.order-section-content.items-section tr.k-master-row, .items-section tr.k-master-row'));
        for (let i = 0; i < rows.length; i++) {
          const tr = rows[i];
          const skuInput = tr.querySelector('input');
          const skuValue = skuInput ? skuInput.value : '';
          if (skuValue !== 'TP-MTSE-102300') {
            return i;
          }
        }
        return -1;
      });

      if (oldRowIndex === -1) {
        console.log('No other items left to delete.');
        break;
      }

      console.log(`Deleting old item at row index ${oldRowIndex}...`);
      const row = frame.locator('.order-section-content.items-section tr.k-master-row, .items-section tr.k-master-row').nth(oldRowIndex);
      const ellipsis = row.locator('button.grid-button-ellipsis').first();
      await ellipsis.click();
      await page.waitForTimeout(1000);

      const deleteOption = frame.locator('.k-popup .k-menu-item:has-text("Delete"), .k-popup [role="menuitem"]:has-text("Delete"), .ssit-grid-menu-item:has-text("Delete")').first();
      if (await deleteOption.isVisible()) {
        console.log('Clicking Delete menu option...');
        await deleteOption.click({ force: true });
        // Wait for this specific row to disappear from the DOM
        await row.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1500); // Extra safety buffer
      } else {
        console.log('Warning: Delete menu option not visible.');
        break;
      }
    }

    const finalCount = await frame.locator('button.grid-button-ellipsis').count();
    console.log(`Final items count: ${finalCount}`);

    // Click Save Order
    console.log('Clicking Save button...');
    const saveBtn = frame.locator('button.btn-order-action.btn-order-save, button:has-text("Save")').first();
    await saveBtn.click();
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'output/debug-test-blazor-complete-result.png', fullPage: true });
    console.log('Saved screenshot debug-test-blazor-complete-result.png');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
