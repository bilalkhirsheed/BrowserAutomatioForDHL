require('dotenv').config();
const { chromium } = require('playwright');
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

    console.log('Checking if Packaging section is expanded...');
    const packagingHeader = frame.locator('.order-section-title:has-text("Packaging"), .order-section-heading:has-text("Packaging"), *:has-text("Packaging details")').first();
    if (await packagingHeader.isVisible().catch(() => false)) {
      await packagingHeader.click().catch(() => {});
      await page.waitForTimeout(2000);
    }

    console.log('Dumping inputs near the package dropdown...');
    const inputs = await frame.evaluate(() => {
      const allInputs = Array.from(document.querySelectorAll('input, select, button, span'));
      return allInputs.map(inp => {
        const rect = inp.getBoundingClientRect();
        return {
          tagName: inp.tagName,
          id: inp.id,
          name: inp.name,
          value: inp.value,
          className: inp.className,
          innerText: inp.innerText ? inp.innerText.trim() : '',
          placeholder: inp.getAttribute('placeholder') || '',
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }
        };
      }).filter(inp => {
        // filter elements around the center/top where packaging is
        return inp.rect.top > 0 && inp.rect.width > 0;
      });
    });

    // Let's filter inputs that contain keywords like weight, pack, qty, dimensions
    const relevantInputs = inputs.filter(inp => 
      /weight|pack|qty|quantity|number|piece|dimension|width|height|length/i.test(inp.id || '') ||
      /weight|pack|qty|quantity|number|piece|dimension|width|height|length/i.test(inp.name || '') ||
      /weight|pack|qty|quantity|number|piece|dimension|width|height|length/i.test(inp.innerText || '') ||
      /weight|pack|qty|quantity|number|piece|dimension|width|height|length/i.test(inp.className || '')
    );

    console.log('RELEVANT INPUTS:');
    console.log(JSON.stringify(relevantInputs, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
