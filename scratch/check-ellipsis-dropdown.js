require('dotenv').config();
const { chromium } = require('playwright');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013702';

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

    console.log('Expanding items section...');
    const itemsHeader = frame.locator('.order-section-title.items-section, .order-section-heading:has-text("Items")').first();
    await itemsHeader.click().catch(() => {});
    await page.waitForTimeout(3000);

    // Click ellipsis button of the first item
    console.log('Locating ellipsis button...');
    const ellipsisBtn = frame.locator('button.grid-button-ellipsis').first();
    if (await ellipsisBtn.isVisible()) {
      console.log('Clicking ellipsis button...');
      await ellipsisBtn.click();
      await page.waitForTimeout(2000);

      // Inspect dropdown container HTML
      const dropdownHtml = await frame.evaluate(() => {
        // Let's find all active dropdowns or menus on the page
        const dropdowns = Array.from(document.querySelectorAll('.ssit-dropdown-container, .k-popup, [role="menu"], .k-animation-container'))
          .map(el => ({
            className: el.className,
            id: el.id,
            outerHTML: el.outerHTML
          }));
        return dropdowns;
      });

      console.log('=== DETECTED DROPDOWNS ===');
      console.log(JSON.stringify(dropdownHtml, null, 2));

      // Take a screenshot
      await page.screenshot({ path: 'output/debug-ellipsis-clicked.png', fullPage: true });
      console.log('Saved screenshot debug-ellipsis-clicked.png');
    } else {
      console.log('Ellipsis button not found or not visible.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
