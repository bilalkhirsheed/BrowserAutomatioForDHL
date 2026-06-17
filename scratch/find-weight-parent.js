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

    console.log('Inspecting #Weight element parents...');
    const result = await frame.evaluate(() => {
      const el = document.getElementById('Weight');
      if (!el) return { error: '#Weight element not found in DOM' };

      const parents = [];
      let parent = el.parentElement;
      while (parent) {
        parents.push({
          tagName: parent.tagName,
          className: parent.className,
          id: parent.id,
          style: parent.getAttribute('style') || '',
          display: window.getComputedStyle(parent).display,
          visibility: window.getComputedStyle(parent).visibility
        });
        parent = parent.parentElement;
      }

      return {
        outerHTML: el.outerHTML,
        parents: parents.slice(0, 10) // Get top 10 parent elements
      };
    });

    console.log('=== WEIGHT PARENT HIERARCHY ===');
    console.log(JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
