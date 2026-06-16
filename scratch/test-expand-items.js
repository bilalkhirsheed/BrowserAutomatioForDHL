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

    const frame = getAppFrame(page);

    // Let's find the Items header
    console.log('Checking Items header visibility and state...');
    const itemsHeader = frame.locator('*:has-text("Items")').last();
    console.log('Items header visible:', await itemsHeader.isVisible());
    
    // We can check the display property of the items section container
    const isCollapsed = await frame.evaluate(() => {
      const el = document.querySelector('.order-section-content.items-section .order-section-content-grid-content');
      if (!el) return 'Not found';
      return window.getComputedStyle(el).display === 'none';
    });
    console.log('Is Items section collapsed:', isCollapsed);

    if (isCollapsed === true || isCollapsed === 'true') {
      console.log('Items section is collapsed. Clicking Items header to expand...');
      await itemsHeader.click();
      await page.waitForTimeout(2000);
      
      const newCollapsed = await frame.evaluate(() => {
        const el = document.querySelector('.order-section-content.items-section .order-section-content-grid-content');
        if (!el) return 'Not found';
        return window.getComputedStyle(el).display === 'none';
      });
      console.log('Is Items section collapsed now:', newCollapsed);
    }

    // Now let's check input visibility
    const inputVisible = await frame.locator('td[data-col-index="3"] input.ssit-input-text').first().isVisible().catch(() => false);
    console.log('First unit price input visible:', inputVisible);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
