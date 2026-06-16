require('dotenv').config();
const { chromium } = require('playwright');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013724';

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

    console.log('Dumping HTML elements in the items section...');
    const elements = await frame.evaluate(() => {
      const container = document.querySelector('.order-section-content.items-section');
      if (!container) return { error: 'Items section container not found' };

      const buttons = Array.from(container.querySelectorAll('button, a, i, span[class*="icon"], span[class*="btn"], td')).map(el => {
        // If it's a td, check if it contains buttons or specific classes
        if (el.tagName === 'TD') {
          const colIndex = el.getAttribute('data-col-index');
          if (colIndex === '7') {
            return {
              tagName: el.tagName,
              colIndex,
              innerHTML: el.innerHTML,
              outerHTML: el.outerHTML.slice(0, 300)
            };
          }
          return null;
        }

        return {
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          innerText: el.innerText.trim(),
          outerHTML: el.outerHTML.slice(0, 300)
        };
      }).filter(Boolean);

      return {
        buttons,
        containerHTML: container.outerHTML.slice(0, 1000)
      };
    });

    console.log('=== BUTTONS AND LINKS IN ITEMS SECTION ===');
    console.log(JSON.stringify(elements.buttons, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
