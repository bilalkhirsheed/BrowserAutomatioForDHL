require('dotenv').config();
const { chromium } = require('playwright');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013720'; // The order that failed in the GitHub Actions run

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless, slowMo: 100 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('Logging in...');
    await login(page, { email, password });

    console.log(`Opening order ${orderNumber}...`);
    await openOrderByNumber(page, orderNumber);
    await page.waitForTimeout(5000);

    const frame = getAppFrame(page);

    // 1. Set package type and weight in the overall package details (Place #1)
    const packageType = 'Mini';
    const weight = '2';
    
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

    console.log(`Setting overall package weight (Place #1) to: ${weight}...`);
    const overallWeightInput = frame.locator('#Weight, [name="Weight"]').first();
    if (await overallWeightInput.isVisible().catch(() => false)) {
      await overallWeightInput.click();
      await overallWeightInput.fill(String(weight));
      await overallWeightInput.press('Tab');
      await page.waitForTimeout(1000);
    }

    // 2. Expand Items section based on Add Item button visibility
    console.log('Checking if Items section is expanded...');
    const addItemBtn = frame.locator('button.add-item-btn').first();
    const isAddBtnVisible = await addItemBtn.isVisible().catch(() => false);
    console.log('Is Add Item button visible initially:', isAddBtnVisible);

    if (!isAddBtnVisible) {
      console.log('Items section appears collapsed. Clicking Items header to expand...');
      const itemsHeader = frame.locator('*:has-text("Items")').last();
      await itemsHeader.click();
      await page.waitForTimeout(2000);
    }

    // Wait for Add Item button to be visible to ensure grid is fully loaded
    console.log('Waiting for Items grid to load...');
    await addItemBtn.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1000);

    // Get count of existing delete buttons and delete them
    const deleteBtns = frame.locator('i.delete-item-btn');
    const initialCount = await deleteBtns.count();
    console.log(`Found ${initialCount} items to delete.`);

    for (let i = 0; i < initialCount; i++) {
      console.log(`Deleting item index ${i + 1}...`);
      await deleteBtns.first().click();
      await page.waitForTimeout(1000);
    }

    console.log('Clicking Add Item button...');
    await addItemBtn.click();
    await page.waitForTimeout(1500);

    // Fill the new item fields (Place #2 for weight)
    console.log('Filling item fields...');
    const index = 0;
    const skuInput = frame.locator(`#item-SKU-${index}`).first();
    const descInput = frame.locator(`#item-Description-${index}`).first();
    const qtyInput = frame.locator(`#item-Quantity-${index}`).first();
    const priceInput = frame.locator(`#item-UnitPrice-${index}`).first();
    const weightInput = frame.locator(`#item-Weight-${index}`).first();

    await skuInput.fill('TP-MTSE-102300');
    await descInput.fill('Power Supply');
    await qtyInput.fill('1');
    await priceInput.fill('200');
    await weightInput.fill(String(weight)); // Set item weight (Place #2)
    
    console.log('All fields filled. Waiting a bit to see the result...');
    await page.waitForTimeout(2000);

    // Take a screenshot of the items section to verify
    const itemsSection = frame.locator('.order-section-content.items-section').first();
    await itemsSection.screenshot({ path: 'output/test-items-modified-fixed.png' });
    console.log('Saved verification screenshot to output/test-items-modified-fixed.png');

  } catch (err) {
    console.error('Error during items modification:', err);
  } finally {
    await browser.close();
  }
}

main();
