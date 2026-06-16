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

    console.log('Dumping items section elements...');
    const result = await frame.evaluate(() => {
      // Find the items section container
      const container = document.querySelector('.order-section-content.items-section');
      if (!container) return { error: 'Items section container not found' };

      // Let's look for sibling headers or parent headers
      const siblings = Array.from(container.parentElement.children).map(s => ({
        tagName: s.tagName,
        className: s.className,
        innerText: s.innerText ? s.innerText.split('\n')[0] : '',
        outerHTML: s.outerHTML.slice(0, 300)
      }));

      // Let's find all elements containing the text "Items" inside the container's parent
      const itemsElements = [];
      const parent = container.parentElement;
      if (parent) {
        Array.from(parent.querySelectorAll('*')).forEach((el) => {
          if (el.innerText && el.innerText.trim() === 'Items' && el.children.length === 0) {
            itemsElements.push({
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              outerHTML: el.outerHTML
            });
          }
        });
      }

      return {
        siblings,
        itemsElements,
        containerHTML: container.outerHTML.slice(0, 500)
      };
    });

    console.log('=== INSPECTION RESULT ===');
    console.log(JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
