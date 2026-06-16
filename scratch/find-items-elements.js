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
    console.log('Page URL:', page.url());
    console.log('Frame URL:', frame.url());

    const elements = await frame.evaluate(() => {
      // Find all elements containing text "Items" or "ITEM"
      const allElements = Array.from(document.querySelectorAll('*'));
      const matches = allElements.filter(el => {
        if (!el.innerText) return false;
        const text = el.innerText.trim();
        return (text === 'Items' || text === 'ITEM' || text.includes('Items (')) && el.children.length <= 2;
      }).map(el => ({
        tagName: el.tagName,
        className: el.className,
        id: el.id,
        innerText: el.innerText.trim(),
        outerHTML: el.outerHTML.slice(0, 300)
      }));

      // Find all section title elements
      const sectionTitles = Array.from(document.querySelectorAll('[class*="section-title"], [class*="section-header"], [class*="title"], [class*="header"]'))
        .filter(el => el.innerText && el.innerText.length < 100)
        .map(el => ({
          tagName: el.tagName,
          className: el.className,
          innerText: el.innerText.trim().split('\n')[0],
          outerHTML: el.outerHTML.slice(0, 300)
        }));

      return {
        matches,
        sectionTitles
      };
    });

    console.log('=== MATCHING "ITEMS" ELEMENTS ===');
    console.log(JSON.stringify(elements.matches, null, 2));
    
    console.log('=== SECTION TITLES ===');
    console.log(JSON.stringify(elements.sectionTitles, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
