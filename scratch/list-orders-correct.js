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
    console.log('Logging in...');
    await login(page, { email, password });

    console.log('Getting frame...');
    const frame = getAppFrame(page);
    console.log('Frame URL:', frame.url());

    console.log('Waiting for grid or rows to load...');
    // Wait for the table rows to appear
    await frame.waitForSelector('tr, [role="row"], .order-row', { timeout: 30000 }).catch(e => console.log('Timeout waiting for rows:', e.message));
    await page.waitForTimeout(5000);

    // Let's dump all text of the frame
    const text = await frame.evaluate(() => document.body ? document.body.innerText : '');
    console.log('Frame text length:', text.length);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'current-orders-text.txt'), text);
    console.log('Saved current-orders-text.txt');

    // Extract any potential order numbers (5+ digits or similar)
    const numbers = text.match(/\b(1000\d{5})\b/g) || [];
    console.log('Detected potential order numbers:', [...new Set(numbers)]);

  } catch (err) {
    console.error('Error occurred:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main();
