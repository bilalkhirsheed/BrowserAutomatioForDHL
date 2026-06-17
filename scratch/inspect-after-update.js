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

    // Click Add Item button to add a new row
    console.log('Clicking Add Item button...');
    const addItemBtn = frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').first();
    await addItemBtn.click();
    await page.waitForTimeout(3000);

    // Click Edit button on the newly added row
    console.log('Opening modal for the newly added row...');
    const editBtns = frame.locator('button.grid-button-edit');
    await editBtns.last().click();
    await page.waitForTimeout(3000);

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

    console.log('Clicking Update Order button...');
    const updateBtn = modal.locator('button.btn-modal.add, button:has-text("Update order")').first();
    await updateBtn.click();
    await page.waitForTimeout(4000);

    console.log('Dumping DOM structure of rows...');
    const rowsDump = await frame.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.order-section-content.items-section tr.k-master-row, .items-section tr.k-master-row'));
      return rows.map((tr, idx) => {
        const inputs = Array.from(tr.querySelectorAll('input')).map(inp => ({
          id: inp.id,
          name: inp.name,
          value: inp.value,
          outerHTML: inp.outerHTML
        }));
        return {
          rowIndex: idx,
          className: tr.className,
          innerText: tr.innerText,
          inputs: inputs
        };
      });
    });

    console.log('ROWS DUMP:');
    console.log(JSON.stringify(rowsDump, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
