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

    // 1. Expand items section
    console.log('Expanding items section...');
    const itemsHeader = frame.locator('.order-section-title.items-section, .order-section-heading:has-text("Items")').first();
    await itemsHeader.click().catch(() => {});
    await page.waitForTimeout(3000);

    // 2. Delete existing items
    const deleteBtns = frame.locator('i.fas.fa-trash-alt');
    const initialCount = await deleteBtns.count();
    console.log(`Found ${initialCount} existing items to delete.`);
    
    for (let i = 0; i < initialCount; i++) {
      console.log(`Deleting item index ${i + 1}...`);
      await deleteBtns.first().click();
      await page.waitForTimeout(1500); // Wait for Blazor update
    }

    // 3. Click Add Item
    console.log('Clicking Add Item button...');
    const addItemBtn = frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').first();
    await addItemBtn.click();
    await page.waitForTimeout(3000); // Wait for Blazor edit row

    // 4. Fill in new item fields
    console.log('Locating edit row and filling inputs...');
    const editRow = frame.locator('.k-grid-edit-row, tr:has(input#ItemSKU)').first();
    
    const skuInput = editRow.locator('input#ItemSKU').first();
    const descInput = editRow.locator('input#ItemDescription').first();
    
    // Quantity is in 3rd cell (index 2)
    const qtyInput = editRow.locator('td').nth(2).locator('input').first();
    // Unit Price is in 4th cell (index 3)
    const priceInput = editRow.locator('td').nth(3).locator('input').first();
    // Weight is in 5th cell (index 4)
    const weightInput = editRow.locator('td').nth(4).locator('input').first();

    console.log('Filling SKU and Description...');
    await skuInput.fill('TP-MTSE-102300');
    await descInput.fill('Power Supply');
    
    console.log('Filling Quantity, Price, and Weight...');
    await qtyInput.click();
    await qtyInput.fill('1');
    
    await priceInput.click();
    await priceInput.fill('200');
    
    await weightInput.click();
    await weightInput.fill('2');

    console.log('All fields filled. Saving order...');
    const saveBtn = frame.locator('button.btn-order-action.btn-order-save, button:has-text("Save")').first();
    await saveBtn.click();
    await page.waitForTimeout(5000); // Wait for order to save

    console.log('Taking verification screenshot...');
    await page.screenshot({ path: 'output/test-blazor-flow-success.png', fullPage: true });
    console.log('Verification screenshot saved to output/test-blazor-flow-success.png');

  } catch (err) {
    console.error('Error during Blazor items modification:', err);
  } finally {
    await browser.close();
  }
}

main();
