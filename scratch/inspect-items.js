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

    const frame = getAppFrame(page);

    console.log('Inspecting items table structure...');
    const result = await frame.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr, [role="row"]'));
      const itemsRows = rows.filter(r => r.querySelector('td[data-col-index]') || r.outerHTML.includes('data-col-index'));
      
      const tablesInfo = Array.from(document.querySelectorAll('table')).map((table, tIdx) => {
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
        const rowData = Array.from(table.querySelectorAll('tr')).map((tr, rIdx) => {
          const cells = Array.from(tr.querySelectorAll('td')).map((td, cIdx) => {
            const inputs = Array.from(td.querySelectorAll('input, select')).map(inp => ({
              tagName: inp.tagName,
              type: inp.type,
              value: inp.value,
              className: inp.className,
              id: inp.id,
              name: inp.name
            }));
            return {
              colIndex: td.getAttribute('data-col-index'),
              innerText: td.innerText.trim(),
              inputs,
              html: td.outerHTML.slice(0, 300)
            };
          });
          return { rowIndex: rIdx, cells };
        });
        return { tableIndex: tIdx, headers, rowData };
      });

      return {
        totalRows: rows.length,
        itemsRowsCount: itemsRows.length,
        tablesInfo
      };
    });

    console.log('=== INSPECTION RESULT ===');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'items-table-structure.json'), JSON.stringify(result, null, 2));
    console.log('Saved items-table-structure.json');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main();
