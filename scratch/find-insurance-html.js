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

    // Click the checkbox
    console.log('Checking insurance checkbox...');
    const insuranceCheckbox = frame.locator('#INSURANCE').first();
    if (await insuranceCheckbox.isVisible()) {
      await insuranceCheckbox.check();
      await page.waitForTimeout(2000);
    }

    // Now dump the HTML of all inputs and their ancestors
    const inputsInfo = await frame.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.map((inp, idx) => {
        let parent = inp.parentElement;
        let parentHtml = parent ? parent.outerHTML : '';
        let grandParentHtml = (parent && parent.parentElement) ? parent.parentElement.outerHTML : '';
        return {
          idx,
          id: inp.id,
          value: inp.value,
          className: inp.className,
          parentHtml: parentHtml.slice(0, 400),
          grandParentHtml: grandParentHtml.slice(0, 800)
        };
      });
    });

    console.log('=== INPUTS INFO ===');
    inputsInfo.forEach(info => {
      if (info.value === '0.00' || info.parentHtml.toLowerCase().includes('insurance') || info.grandParentHtml.toLowerCase().includes('insurance')) {
        console.log(`\nInput #${info.idx}: ID="${info.id}", Value="${info.value}", Class="${info.className}"`);
        console.log(`Parent HTML: ${info.parentHtml}`);
        console.log(`Grandparent HTML: ${info.grandParentHtml}`);
      }
    });

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

main();
