require('dotenv').config();
const { chromium } = require('playwright');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013707';

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless, slowMo: 100 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('Logging in...');
    await login(page, { email, password });

    console.log(`Opening order ${orderNumber}...`);
    await openOrderByNumber(page, orderNumber);
    await page.waitForTimeout(5000);

    const frame = getAppFrame(page);

    console.log('Inspecting package details inputs near package type dropdown...');
    const result = await frame.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select')).map(inp => {
        // Find parent label context
        let labelText = '';
        const parentRow = inp.closest('.ssit-input-row, .input-row, tr, div');
        if (parentRow) {
          labelText = parentRow.innerText.split('\n')[0].trim();
        }
        return {
          tagName: inp.tagName,
          id: inp.id,
          name: inp.name,
          type: inp.type,
          value: inp.value,
          className: inp.className,
          labelText
        };
      });

      // Filter inputs that are relevant to package (weight, length, width, height, package type, etc.)
      const packageInputs = inputs.filter(inp => 
        /weight|package|width|length|height|dim/i.test(inp.id || '') || 
        /weight|package|width|length|height|dim/i.test(inp.name || '') || 
        /weight|package|width|length|height|dim/i.test(inp.labelText || '') ||
        /kg/i.test(inp.labelText || '')
      );

      return {
        packageInputs
      };
    });

    console.log('=== PACKAGE DETAIL INPUTS ===');
    console.log(JSON.stringify(result.packageInputs, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
