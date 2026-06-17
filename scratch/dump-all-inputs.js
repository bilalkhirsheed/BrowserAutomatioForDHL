require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013698';

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

    console.log('Expanding Packaging section...');
    const packagingHeader = frame.locator('.order-section-title:has-text("Packaging"), .order-section-heading:has-text("Packaging"), *:has-text("Packaging details")').first();
    if (await packagingHeader.isVisible().catch(() => false)) {
      await packagingHeader.click().catch(() => {});
      await page.waitForTimeout(2000);
    }

    console.log('Dumping inputs and surrounding labels...');
    const dump = await frame.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, span.k-input-inner'));
      return inputs.map((inp, idx) => {
        let labelText = '';
        // Try to find a label or preceding element with text
        const parentRow = inp.closest('.ssit-input-row, .input-row, tr, div');
        if (parentRow) {
          labelText = parentRow.innerText.slice(0, 100).trim();
        }
        return {
          index: idx,
          tagName: inp.tagName,
          id: inp.id,
          name: inp.name,
          value: inp.tagName === 'SPAN' ? inp.innerText : inp.value,
          className: inp.className,
          placeholder: inp.getAttribute('placeholder') || '',
          labelText,
          outerHTML: inp.outerHTML.slice(0, 300)
        };
      });
    });

    console.log(`Found ${dump.length} inputs.`);
    fs.writeFileSync('output/all-inputs-dump.json', JSON.stringify(dump, null, 2));
    console.log('Saved to output/all-inputs-dump.json');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
