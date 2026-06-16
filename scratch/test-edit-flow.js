require('dotenv').config();
const { chromium } = require('playwright');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013707';

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless, slowMo: 150 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('Logging in...');
    await login(page, { email, password });

    console.log(`Opening order ${orderNumber}...`);
    await openOrderByNumber(page, orderNumber);
    await page.waitForTimeout(5000);

    const frame = getAppFrame(page);

    console.log('Expanding items section...');
    const itemsHeader = frame.locator('*:has-text("Items")').last();
    await itemsHeader.click().catch(() => {});
    await page.waitForTimeout(2000);

    // Get count of existing delete buttons
    const deleteBtns = frame.locator('i.delete-item-btn');
    const initialCount = await deleteBtns.count();
    console.log(`Found ${initialCount} items to delete.`);

    // Click each delete button
    // Note: when we delete a row, the rows count decreases, so we can repeatedly click the first delete button!
    for (let i = 0; i < initialCount; i++) {
      console.log(`Deleting item index ${i + 1}...`);
      await deleteBtns.first().click();
      await page.waitForTimeout(1000); // Wait for row removal transition
    }

    const postDeleteCount = await frame.locator('i.delete-item-btn').count();
    console.log(`Items count after deletion: ${postDeleteCount}`);

    console.log('Clicking Add Item button...');
    const addItemBtn = frame.locator('button.add-item-btn').first();
    await addItemBtn.click();
    await page.waitForTimeout(1500);

    const afterAddCount = await frame.locator('i.delete-item-btn').count();
    console.log(`Items count after clicking Add: ${afterAddCount}`);

    // Fill the new item fields (index 0)
    console.log('Filling item fields...');
    const index = 0;
    
    // We target the inputs using the IDs: item-SKU-0, item-Description-0, etc.
    const skuInput = frame.locator(`#item-SKU-${index}`).first();
    const descInput = frame.locator(`#item-Description-${index}`).first();
    const qtyInput = frame.locator(`#item-Quantity-${index}`).first();
    const priceInput = frame.locator(`#item-UnitPrice-${index}`).first();
    const weightInput = frame.locator(`#item-Weight-${index}`).first();

    await skuInput.fill('TP-MTSE-102300');
    await descInput.fill('Power Supply');
    await qtyInput.fill('1');
    await priceInput.fill('200');
    await weightInput.fill('2');
    
    console.log('All fields filled. Waiting a bit to see the result...');
    await page.waitForTimeout(3000);

    // Take a screenshot of the items section to verify
    const itemsSection = frame.locator('.order-section-content.items-section').first();
    await itemsSection.screenshot({ path: 'output/test-items-modified.png' });
    console.log('Saved verification screenshot to output/test-items-modified.png');

  } catch (err) {
    console.error('Error during items modification:', err);
  } finally {
    await browser.close();
  }
}

main();
