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

    console.log('Clicking Add Item button...');
    const addItemBtn = frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').first();
    await addItemBtn.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'output/debug-modal-open-check.png', fullPage: true });
    console.log('Saved screenshot output/debug-modal-open-check.png');

    console.log('Dumping all labels and input details from the main app frame...');
    const inputsAndLabels = await frame.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label, h1, h2, h3, h4, h5, span, div.modal-title, .k-window-title'))
        .map(el => ({
          tagName: el.tagName,
          className: el.className,
          innerText: el.innerText ? el.innerText.trim() : ''
        }))
        .filter(l => l.innerText.length > 0 && l.innerText.length < 100);

      const inputs = Array.from(document.querySelectorAll('input, select, textarea'))
        .map(inp => ({
          tagName: inp.tagName,
          id: inp.id,
          className: inp.className,
          placeholder: inp.getAttribute('placeholder') || '',
          value: inp.value,
          outerHTML: inp.outerHTML.slice(0, 250)
        }));

      return {
        labels,
        inputs
      };
    });

    console.log('=== LABELS ON PAGE ===');
    console.log(JSON.stringify(inputsAndLabels.labels, null, 2));
    console.log('=== INPUTS ON PAGE ===');
    console.log(JSON.stringify(inputsAndLabels.inputs, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
