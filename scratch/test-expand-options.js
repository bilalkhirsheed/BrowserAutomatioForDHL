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
    await page.waitForTimeout(6000);

    const frame = getAppFrame(page);

    // Let's test different click selectors to see which one works
    const selectors = [
      { name: '1. Chevron Icon', selector: '.order-section-title.items-section i.order-section-toggle' },
      { name: '2. Title Div', selector: '.order-section-title.items-section' },
      { name: '3. Text Items', selector: 'text=Items' },
      { name: '4. Chevron Icon (general)', selector: '.order-section-toggle' }
    ];

    for (const sel of selectors) {
      console.log(`Testing click target: ${sel.name} (${sel.selector})`);
      
      // Reload page to start with fresh collapsed state
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(6000);
      
      const target = frame.locator(sel.selector).last();
      const isVisibleBefore = await frame.locator('button.add-item-btn').first().isVisible().catch(() => false);
      console.log(`  - Add Item button visible before click: ${isVisibleBefore}`);
      
      if (await target.isVisible().catch(() => false)) {
        await target.click();
        console.log('  - Clicked target, waiting 3s...');
        await page.waitForTimeout(3000);
        
        const isVisibleAfter = await frame.locator('button.add-item-btn').first().isVisible().catch(() => false);
        console.log(`  - Add Item button visible after click: ${isVisibleAfter}`);
        
        if (isVisibleAfter) {
          console.log(`🎉 SUCCESS: Click target "${sel.name}" successfully expanded the section!`);
          break;
        }
      } else {
        console.log('  - Target not visible/found.');
      }
    }

  } catch (err) {
    console.error('Error during testing:', err);
  } finally {
    await browser.close();
  }
}

main();
