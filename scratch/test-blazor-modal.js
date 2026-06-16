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
    console.log('Frame URL:', frame.url());

    // Locate the Blazor "Add item" button
    const addItemBtn = frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').first();
    console.log('Is Add Item button visible:', await addItemBtn.isVisible());

    console.log('Clicking Add Item button...');
    await addItemBtn.click();
    await page.waitForTimeout(3000); // Wait for modal to render

    console.log('Dumping DOM inputs after click...');
    const result = await frame.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea, button')).map(inp => {
        let labelText = '';
        const parentDiv = inp.closest('.ssit-input-row, .input-row, td, div');
        if (parentDiv) {
          labelText = parentDiv.innerText ? parentDiv.innerText.split('\n')[0].trim() : '';
        }
        return {
          tagName: inp.tagName,
          id: inp.id,
          name: inp.name,
          type: inp.type,
          value: inp.value,
          className: inp.className,
          labelText,
          outerHTML: inp.outerHTML.slice(0, 250)
        };
      });

      return {
        inputs
      };
    });

    console.log('=== INPUTS AFTER CLICKING ADD ITEM ===');
    console.log(JSON.stringify(result.inputs, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
