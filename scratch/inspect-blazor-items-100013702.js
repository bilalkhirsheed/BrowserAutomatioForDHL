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

    console.log('Inspecting items table structure...');
    const result = await frame.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.order-section-content.items-section tr, .items-section tr')).map((tr, rIdx) => {
        const cells = Array.from(tr.querySelectorAll('td, th')).map((cell, cIdx) => {
          return {
            colIndex: cIdx,
            tagName: cell.tagName,
            innerText: cell.innerText ? cell.innerText.trim() : '',
            className: cell.className,
            outerHTML: cell.outerHTML
          };
        });
        return {
          rowIndex: rIdx,
          className: tr.className,
          cells
        };
      });

      return {
        rows
      };
    });

    console.log('=== ITEMS TABLE ROWS ===');
    console.log(JSON.stringify(result.rows, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
