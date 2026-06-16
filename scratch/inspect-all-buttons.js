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

    // List all frames and check their content
    const frames = page.frames();
    console.log(`Total frames found: ${frames.length}`);
    
    for (let fIdx = 0; fIdx < frames.length; fIdx++) {
      const f = frames[fIdx];
      const url = f.url();
      console.log(`Frame ${fIdx}: url="${url}"`);
      
      const buttons = await f.evaluate(() => {
        return Array.from(document.querySelectorAll('button, a, .k-button')).map(el => ({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          innerText: el.innerText ? el.innerText.trim() : '',
          outerHTML: el.outerHTML.slice(0, 300)
        })).filter(b => b.innerText.includes('Add') || b.innerText.includes('item') || b.className.includes('btn'));
      }).catch(() => []);
      
      console.log(`  - Found ${buttons.length} matching buttons in this frame:`);
      console.log(JSON.stringify(buttons, null, 2));
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
