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

    const elements = await frame.evaluate(() => {
      return Array.from(document.querySelectorAll('*'))
        .filter(el => el.innerText && /item/i.test(el.innerText))
        .map(el => ({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          innerText: el.innerText.trim().slice(0, 100),
          childrenCount: el.children.length,
          outerHTML: el.outerHTML.slice(0, 300)
        }));
    });

    console.log('=== ELEMENTS CONTAINING "ITEM" ===');
    // Filter to only display elements that might be headers (short text, or containing class section/heading/title)
    const potentialHeaders = elements.filter(el => 
      el.innerText.length < 150 && 
      (el.className.includes('header') || el.className.includes('heading') || el.className.includes('title') || el.className.includes('chevron') || el.className.includes('toggle') || /item/i.test(el.innerText))
    );
    console.log(JSON.stringify(potentialHeaders, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
