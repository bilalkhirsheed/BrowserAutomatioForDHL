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

    const inputsInfo = await frame.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input.ssit-input-text'));
      return inputs.map((inp, idx) => {
        const td = inp.closest('td');
        const tr = inp.closest('tr');
        const rect = inp.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(inp);
        
        // Find parent tree display properties
        const parentTree = [];
        let current = inp.parentElement;
        while (current && current !== document.body) {
          parentTree.push({
            tagName: current.tagName,
            className: current.className,
            display: window.getComputedStyle(current).display,
            visibility: window.getComputedStyle(current).visibility,
            offsetWidth: current.offsetWidth,
            offsetHeight: current.offsetHeight
          });
          current = current.parentElement;
        }

        return {
          index: idx,
          value: inp.value,
          colIndex: td ? td.getAttribute('data-col-index') : null,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          },
          offsetWidth: inp.offsetWidth,
          offsetHeight: inp.offsetHeight,
          display: computedStyle.display,
          visibility: computedStyle.visibility,
          parentTreeSummary: parentTree.map(p => `${p.tagName}.${p.className.split(' ').join('.')}[display=${p.display},vis=${p.visibility},size=${p.offsetWidth}x${p.offsetHeight}]`).join(' -> ')
        };
      });
    });

    console.log('Inputs info:', JSON.stringify(inputsInfo, null, 2));
    fs.writeFileSync(path.join(OUTPUT_DIR, 'inputs-visibility.json'), JSON.stringify(inputsInfo, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
