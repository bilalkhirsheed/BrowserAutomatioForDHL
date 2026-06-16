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

    // 1. Inspect Customs details section
    console.log('Checking "Customs details" text/button...');
    // We can locate it by text
    const customsHeader = detailFrame.locator('text=Customs details, :text-matches("Customs details", "i")').first();
    if (await customsHeader.isVisible()) {
      console.log('Customs details section is visible. Clicking to expand/view...');
      await customsHeader.click();
      await page.waitForTimeout(2000);
      
      const customsHtml = await customsHeader.evaluate(el => {
        let parent = el;
        for (let i = 0; i < 4; i++) {
          if (parent.parentElement) parent = parent.parentElement;
        }
        return parent.outerHTML;
      });
      fs.writeFileSync(path.join(OUTPUT_DIR, 'customs-html-dump.html'), customsHtml);
      console.log('Saved customs HTML dump');

      // Now print all inputs and selects inside this expanded customs section
      const customsFields = await detailFrame.evaluate(() => {
        // Find the customs details panel/content
        const headers = Array.from(document.querySelectorAll('*'));
        const header = headers.find(el => el.innerText && el.innerText.trim().toLowerCase() === 'customs details');
        if (!header) return [];
        
        // Find the sibling or parent container containing details
        let container = header.parentElement;
        while (container && !container.innerHTML.includes('input') && !container.innerHTML.includes('select')) {
          container = container.parentElement;
        }
        if (!container) return [];

        const inputs = Array.from(container.querySelectorAll('input, select'));
        return inputs.map(el => ({
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
      console.log('Fields inside Customs details container:', customsFields);
      fs.writeFileSync(path.join(OUTPUT_DIR, 'customs-fields.json'), JSON.stringify(customsFields, null, 2));

    } else {
      console.log('Customs details header not found!');
    }

    // 2. Find package type elements and dropdown options
    console.log('Searching for package dropdown...');
    // In our previous dump, "Mini Package" was a text on the page, and the input next to it was Total Weight.
    // Let's find any element containing "Mini Package" and click it, then extract popups.
    const miniPkgText = detailFrame.locator('text=Mini Package').first();
    if (await miniPkgText.isVisible()) {
      console.log('Found Mini Package text. Clicking parent element...');
      // Click the parent element or nearby dropdown arrow
      const dropdownSpan = detailFrame.locator('span:has-text("Mini Package"), td:has-text("Mini Package")').first();
      await dropdownSpan.click();
      await page.waitForTimeout(2000);

      // Save screenshot of open dropdown
      await page.screenshot({ path: path.join(OUTPUT_DIR, `order-dropdowns-${orderNumber}.png`), fullPage: true });
      console.log('Saved dropdown screenshot.');

      // Extract list items in the entire document (popups might be in the body of the detailFrame)
      const popupOptions = await detailFrame.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.k-list-item, .k-item, [role="option"], li'));
        return items.map(el => ({
          text: el.innerText.trim(),
          id: el.id,
          class: el.className
        }));
      });
      console.log('Found popup options:', popupOptions);
      fs.writeFileSync(path.join(OUTPUT_DIR, 'active-popups.json'), JSON.stringify(popupOptions, null, 2));
    } else {
      console.log('Mini Package text not found.');
    }

  } catch (err) {
    console.error('Error in script:', err);
    if (page && !page.isClosed()) {
      const errorScreenshotPath = path.join(OUTPUT_DIR, `error-${orderNumber}.png`);
      await page.screenshot({ path: errorScreenshotPath, fullPage: true }).catch(() => {});
      console.log(`Saved error screenshot to ${errorScreenshotPath}`);
    }
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main();
