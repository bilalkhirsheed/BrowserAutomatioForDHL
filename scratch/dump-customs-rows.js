require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { login, openOrderByNumber, getAppFrame, ensureDir } = require('../lib/dhlHelpers');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013724';

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless, slowMo: 150 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  try {
    console.log('Logging in...');
    await login(page, { email, password });

    console.log(`Opening order ${orderNumber}...`);
    await openOrderByNumber(page, orderNumber);
    await page.waitForTimeout(5000);

    // Get the frame of the opened order details
    const frames = page.frames();
    let detailFrame = null;
    for (const f of frames) {
      const url = f.url();
      if (url.includes('/orders/new/') || url.includes('/orders/edit/')) {
        detailFrame = f;
        console.log(`Found detail frame: ${url}`);
        break;
      }
    }

    if (!detailFrame) {
      throw new Error('Order details frame not found');
    }

    console.log('Expanding Customs details...');
    await detailFrame.locator('*:has-text("Customs details")').last().click();
    await page.waitForTimeout(3000);

    // Extract all rows with class "ssit-input-row" under the customs section
    console.log('Extracting rows...');
    const rows = await detailFrame.evaluate(() => {
      // Find the customs details panel
      const headers = Array.from(document.querySelectorAll('*'));
      const header = headers.find(el => el.innerText && el.innerText.trim().toLowerCase() === 'customs details');
      if (!header) return [];

      let container = header.parentElement;
      while (container && !container.innerHTML.includes('input') && !container.innerHTML.includes('select')) {
        container = container.parentElement;
      }
      if (!container) return [];

      const inputRows = Array.from(container.querySelectorAll('.ssit-input-row, .input-row'));
      return inputRows.map(row => {
        const cols = Array.from(row.querySelectorAll('div[class*="col-"]'));
        const labelText = cols[0] ? cols[0].innerText.trim() : '';
        const inputContainer = cols[1] ? cols[1].outerHTML : '';
        return { labelText, inputContainer };
      });
    });

    console.log(`Extracted ${rows.length} rows:`);
    rows.forEach((r, idx) => {
      console.log(`\nRow #${idx}: Label="${r.labelText}"`);
      console.log(`HTML: ${r.inputContainer}`);
    });

    ensureDir(OUTPUT_DIR);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'customs-rows-extracted.json'), JSON.stringify(rows, null, 2));
    console.log('Saved to output/customs-rows-extracted.json');

  } catch (err) {
    console.error('Error in script:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main();
