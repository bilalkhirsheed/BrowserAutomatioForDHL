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

    console.log('Inspecting Packaging section elements...');
    const result = await frame.evaluate(() => {
      // Find the Packaging section div/table/headers
      const packagingHeaders = Array.from(document.querySelectorAll('div, h2, h3, h4, span, label'))
        .filter(el => /packaging/i.test(el.innerText || ''));
      
      // Let's find all inputs inside the block containing 'Packaging' or '.order-section-content'
      const inputs = Array.from(document.querySelectorAll('input, select')).map(inp => {
        let labelText = '';
        // Find nearest label or column header
        const td = inp.closest('td');
        if (td) {
          // get the index of td and look at th in the table
          const table = td.closest('table');
          const tr = td.closest('tr');
          if (table && tr) {
            const colIndex = Array.from(tr.cells).indexOf(td);
            const headers = Array.from(table.querySelectorAll('th'));
            if (headers[colIndex]) {
              labelText = headers[colIndex].innerText.trim();
            }
          }
        }
        if (!labelText) {
          const parentRow = inp.closest('.ssit-input-row, .input-row, tr, div');
          if (parentRow) {
            labelText = parentRow.innerText.split('\n')[0].trim();
          }
        }
        return {
          tagName: inp.tagName,
          id: inp.id,
          name: inp.name,
          type: inp.type,
          value: inp.value,
          className: inp.className,
          placeholder: inp.getAttribute('placeholder') || '',
          labelText,
          outerHTML: inp.outerHTML
        };
      });

      return {
        inputs
      };
    });

    console.log('=== ALL INPUTS ON PAGE ===');
    console.log(JSON.stringify(result.inputs, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
