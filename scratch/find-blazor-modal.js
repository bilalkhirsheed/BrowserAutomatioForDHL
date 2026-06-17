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

    console.log('Searching for elements containing "Item details"...');
    const result = await frame.evaluate(() => {
      // Find all elements that contain the text "Item details"
      const candidates = Array.from(document.querySelectorAll('div'))
        .filter(el => {
          const h2 = el.querySelector('h2, h3, h4, h5, div');
          return h2 && h2.innerText && h2.innerText.includes('Item details');
        });

      return candidates.map(c => {
        // For each candidate, find all input elements inside it
        const inputs = Array.from(c.querySelectorAll('input, select, textarea, button')).map(inp => {
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

        return {
          tagName: c.tagName,
          className: c.className,
          id: c.id,
          outerHTML: c.outerHTML.slice(0, 200),
          inputs
        };
      });
    });

    console.log('=== MATCHING MODAL CONTAINERS ===');
    console.log(JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
