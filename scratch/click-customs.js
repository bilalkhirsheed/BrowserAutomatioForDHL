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

    // Get the frame of the opened order details
    const frames = page.frames();
    let detailFrame = null;
    for (const f of frames) {
      const url = f.url();
      if (url.includes('/orders/new/') || url.includes('/orders/edit/')) {
        detailFrame = f;
        console.log(`Found detail frame: ${url}`);
        break;
      }
    }

    if (!detailFrame) {
      throw new Error('Order details frame not found');
    }

    // Locate elements containing "Customs details" using Javascript inside the frame
    console.log('Searching for "Customs details" elements via evaluation...');
    const customsElements = await detailFrame.evaluate(() => {
      // Find all elements containing the text "Customs details"
      const all = Array.from(document.querySelectorAll('*'));
      const matches = all.filter(el => {
        if (el.children.length > 0) {
          // Only look at elements where the text is directly inside it or has very few children
          if (el.children.length > 3) return false;
        }
        return el.innerText && el.innerText.trim() === 'Customs details';
      });

      return matches.map(el => ({
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        outerHTML: el.outerHTML,
        innerText: el.innerText
      }));
    });

    console.log('Matches found:', customsElements);

    // Click the match
    console.log('Clicking the first Customs details element...');
    await detailFrame.locator('*:has-text("Customs details")').last().click();
    await page.waitForTimeout(3000);

    // Take screenshot of expanded panel
    ensureDir(OUTPUT_DIR);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'customs-expanded.png'), fullPage: true });
    console.log('Saved customs-expanded.png screenshot.');

    // Dump all selects and inputs again to see Incoterms
    const currentFields = await detailFrame.evaluate(() => {
      return Array.from(document.querySelectorAll('input, select')).map(el => ({
        tagName: el.tagName,
        id: el.id,
        name: el.name,
        type: el.type,
        value: el.value,
        placeholder: el.placeholder,
        class: el.className,
        labelText: el.parentElement ? el.parentElement.innerText.split('\n')[0].trim() : ''
      }));
    });

    fs.writeFileSync(path.join(OUTPUT_DIR, 'expanded-fields.json'), JSON.stringify(currentFields, null, 2));
    console.log('Saved expanded-fields.json');

  } catch (err) {
    console.error('Error in script:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main();
