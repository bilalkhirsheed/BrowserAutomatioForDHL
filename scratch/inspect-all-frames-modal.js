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

    console.log('Listing all frames and searching for "Item details" text...');
    const frames = page.frames();
    console.log(`Found ${frames.length} frames.`);

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const name = f.name();
      const url = f.url();
      console.log(`Frame ${i}: name="${name}" url="${url}"`);

      const hasText = await f.evaluate(() => {
        return document.body.innerText.includes('Item details');
      }).catch(() => false);

      console.log(`  Contains "Item details": ${hasText}`);

      if (hasText) {
        // Find inputs in this frame
        const inputs = await f.evaluate(() => {
          return Array.from(document.querySelectorAll('input, select, textarea, button'))
            .filter(inp => {
              // Only return inputs that are visible or in a modal dialog
              const dialog = inp.closest('.k-window, .modal, .k-dialog, .ssi-modal, div[role="dialog"]') || inp.closest('div');
              return dialog && dialog.innerText && dialog.innerText.includes('Item details');
            })
            .map(inp => {
              let labelText = '';
              const parent = inp.closest('.form-group, .input-row, div');
              if (parent) {
                const label = parent.querySelector('label');
                labelText = label ? label.innerText.trim() : parent.innerText.split('\n')[0].trim();
              }
              return {
                tagName: inp.tagName,
                id: inp.id,
                className: inp.className,
                placeholder: inp.getAttribute('placeholder') || '',
                labelText,
                outerHTML: inp.outerHTML.slice(0, 150)
              };
            });
        });
        console.log('  Inputs inside matching container:');
        console.log(JSON.stringify(inputs, null, 2));
      }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
