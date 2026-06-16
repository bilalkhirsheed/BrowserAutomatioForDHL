require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { login, getAppFrame, ensureDir } = require('../lib/dhlHelpers');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless, slowMo: 100 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  try {
    console.log('Logging in to DHL...');
    await login(page, { email, password });

    console.log('Waiting for orders page...');
    if (!page.url().includes('/orders')) {
      await page.goto('https://app2.dhlexpresscommerce.com/orders', { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(5000);

    const frame = getAppFrame(page);
    console.log('Frame URL:', frame.url());

    const bodyText = await frame.evaluate(() => document.body.innerText);
    console.log('Body Text snippet length:', bodyText.length);

    // Let's find all links and table rows to find order numbers
    const orderLinks = await frame.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links
        .map(a => ({ text: a.innerText.trim(), href: a.href }))
        .filter(l => l.text.match(/^\d+$/) || l.href.includes('orders/new/'));
    });

    console.log('Found order links:', orderLinks);

    // Let's find text in table rows
    const rows = await frame.evaluate(() => {
      const trs = Array.from(document.querySelectorAll('tr'));
      return trs.slice(0, 15).map(tr => tr.innerText.replace(/\s+/g, ' ').trim());
    });

    console.log('First 15 table rows:');
    rows.forEach((r, i) => console.log(`Row ${i}:`, r));

  } catch (err) {
    console.error('Error occurred:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main();
