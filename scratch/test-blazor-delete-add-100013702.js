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

    // 1. Delete all existing items
    console.log('Beginning deletion of existing items...');
    const ellipsisButtons = frame.locator('button.grid-button-ellipsis');
    const count = await ellipsisButtons.count();
    console.log(`Currently found ${count} items with ellipsis buttons.`);
    if (count > 0) {
      console.log('Clicking the first ellipsis button...');
      await ellipsisButtons.first().click();
      await page.waitForTimeout(1000);

      const deleteMenuItem = frame.locator('.k-popup .k-menu-item:has-text("Delete"), .k-popup [role="menuitem"]:has-text("Delete"), .ssit-grid-menu-item:has-text("Delete")').first();
      
      if (await deleteMenuItem.isVisible()) {
        console.log('Clicking Delete menu option...');
        await deleteMenuItem.click({ force: true });
        await page.waitForTimeout(2000); // Wait for potential dialog or deletion
        
        // Take a screenshot to see if a dialog is present
        await page.screenshot({ path: 'output/debug-after-delete-click.png', fullPage: true });
        console.log('Saved screenshot debug-after-delete-click.png');
      }
    }

    // Check count after deletion
    const finalCount = await frame.locator('button.grid-button-ellipsis').count();
    console.log(`Items count after deletion: ${finalCount}`);

    // 2. Click Add Item
    console.log('Clicking Add Item button...');
    const addItemBtn = frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').first();
    await addItemBtn.click();
    await page.waitForTimeout(3000); // Wait for new row to be created

    // Inspect elements after Add Item to see if a row is in edit mode or if we need to click edit
    console.log('Locating edit row or first row...');
    
    // Let's check if there is a .k-grid-edit-row
    const editRow = frame.locator('.k-grid-edit-row, tr:has(input#ItemSKU)').first();
    const hasEditRow = await editRow.isVisible().catch(() => false);
    console.log('Is .k-grid-edit-row or tr:has(input#ItemSKU) visible:', hasEditRow);

    if (!hasEditRow) {
      console.log('No edit row detected automatically. Let\'s see if a new row was added to the table.');
      const rows = frame.locator('.order-section-content.items-section tr, .items-section tr');
      console.log('Total rows in items table:', await rows.count());
      
      // Let's print out the class names of the rows
      const rowClasses = await frame.evaluate(() => {
        return Array.from(document.querySelectorAll('.order-section-content.items-section tr, .items-section tr'))
          .map(tr => ({ className: tr.className, innerText: tr.innerText.slice(0, 50) }));
      });
      console.log('Rows on page:', rowClasses);

      // Let's click the edit button of the newly added row (should be the last row or the only row if all others deleted)
      const editButtons = frame.locator('button.grid-button-edit');
      const editBtnCount = await editButtons.count();
      console.log(`Found ${editBtnCount} edit buttons.`);
      if (editBtnCount > 0) {
        console.log('Clicking the last edit button...');
        await editButtons.last().click();
        await page.waitForTimeout(2000);
      }
    }

    // Now check if editRow is visible again
    const finalEditRow = frame.locator('.k-grid-edit-row, tr:has(input#ItemSKU)').first();
    const isFinalEditRowVisible = await finalEditRow.isVisible().catch(() => false);
    console.log('Is edit row visible now:', isFinalEditRowVisible);

    if (isFinalEditRowVisible) {
      console.log('Filling out item fields in the edit row...');
      const skuInput = finalEditRow.locator('input#ItemSKU').first();
      const descInput = finalEditRow.locator('input#ItemDescription').first();
      const qtyInput = finalEditRow.locator('td').nth(2).locator('input').first();
      const priceInput = finalEditRow.locator('td').nth(3).locator('input').first();
      const weightInput = finalEditRow.locator('td').nth(4).locator('input').first();

      await skuInput.fill('TP-MTSE-102300');
      await descInput.fill('Power Supply');
      
      await qtyInput.click();
      await qtyInput.fill('1');
      
      await priceInput.click();
      await priceInput.fill('200');
      
      await weightInput.click();
      await weightInput.fill('2');
      
      await page.waitForTimeout(1000);
      console.log('Fields filled successfully.');
    } else {
      console.log('Could not find any edit row to fill!');
    }

    await page.screenshot({ path: 'output/debug-test-blazor-result.png', fullPage: true });
    console.log('Saved screenshot debug-test-blazor-result.png');

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
}

main();
