require('dotenv').config();
const { chromium } = require('playwright');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013724';

  const browser = await chromium.launch({ headless, slowMo: 150 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  try {
    await login(page, { email, password });
    await openOrderByNumber(page, orderNumber);
    await page.waitForTimeout(5000);

    const frame = getAppFrame(page);

    // Expand "Additional details"
    console.log('Searching for "Additional details" header...');
    const additionalDetailsHeader = frame.locator('*:has-text("Additional details")').last();
    if (await additionalDetailsHeader.isVisible()) {
      console.log('Clicking "Additional details" header...');
      await additionalDetailsHeader.click();
      await page.waitForTimeout(2000);
    }

    // Check the checkbox
    console.log('Checking insurance checkbox...');
    const insuranceCheckbox = frame.locator('#INSURANCE').first();
    await insuranceCheckbox.check();
    await page.waitForTimeout(2000);

    // Let's inspect the element directly in the browser
    const debugResult = await frame.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ssit-input-row, .input-row'));
      const targetRow = rows.find(r => r.innerText.includes('Insurance Value'));
      if (!targetRow) return { error: 'Row not found by text' };

      const input = targetRow.querySelector('input');
      if (!input) return { error: 'Input not found inside row', rowHtml: targetRow.outerHTML };

      const rect = input.getBoundingClientRect();
      const style = window.getComputedStyle(input);

      // Climb up parent tree to check if any parent has display: none or offsetWidth/offsetHeight 0
      const parentTree = [];
      let current = input;
      while (current) {
        parentTree.push({
          tagName: current.tagName,
          className: current.className,
          id: current.id,
          offsetWidth: current.offsetWidth,
          offsetHeight: current.offsetHeight,
          display: window.getComputedStyle(current).display
        });
        current = current.parentElement;
      }

      return {
        rowHtml: targetRow.outerHTML,
        inputVisible: input.offsetWidth > 0 && input.offsetHeight > 0,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        parentTree
      };
    });

    console.log('=== DEBUG RESULT ===');
    console.log(JSON.stringify(debugResult, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

main();
