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

    const result = await frame.evaluate(() => {
      // Find all inputs on the page
      const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(inp => {
        let labelText = '';
        const parentDiv = inp.closest('.ssit-input-row, .input-row, tr, td, div');
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

      // Find all tables and their rows
      const tables = Array.from(document.querySelectorAll('table')).map((table, tIdx) => {
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
        const rows = Array.from(table.querySelectorAll('tr')).map((tr, rIdx) => {
          const cells = Array.from(tr.querySelectorAll('td')).map((td, cIdx) => {
            const buttons = Array.from(td.querySelectorAll('button, a, i, span')).map(el => ({
              tagName: el.tagName,
              className: el.className,
              innerText: el.innerText ? el.innerText.trim() : '',
              outerHTML: el.outerHTML.slice(0, 200)
            }));
            return {
              colIndex: cIdx,
              innerText: td.innerText ? td.innerText.trim() : '',
              buttons,
              outerHTML: td.outerHTML.slice(0, 250)
            };
          });
          return { rowIndex: rIdx, cells };
        });
        return { tableIndex: tIdx, headers, rows };
      });

      // Find all icons/trash buttons
      const icons = Array.from(document.querySelectorAll('i, span')).filter(el => 
        /trash|delete|remove|close|times|clear/i.test(el.className || '')
      ).map(el => ({
        tagName: el.tagName,
        className: el.className,
        outerHTML: el.outerHTML
      }));

      return {
        inputs,
        tables,
        icons
      };
    });

    console.log('=== INSPECTION RESULT ===');
    console.log(JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
