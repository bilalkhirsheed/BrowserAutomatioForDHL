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

    console.log('Checking parent elements of .last-row...');
    const result = await frame.evaluate(() => {
      const el = document.querySelector('.order-section-content.last-row');
      if (!el) return { error: 'last-row not found' };

      const siblings = Array.from(el.parentElement.children).map(s => ({
        tagName: s.tagName,
        className: s.className,
        innerText: s.innerText.split('\n')[0]
      }));

      // Let's also look for elements with class containing 'header' or 'title' or 'toggle' near it
      const nearElements = [];
      let parent = el.parentElement;
      if (parent) {
        Array.from(parent.querySelectorAll('*')).forEach(child => {
          if (child.innerText && (child.innerText.includes('Items') || child.innerText.includes('ITEM') || child.className.includes('header') || child.className.includes('title'))) {
            if (child.children.length < 5) {
              nearElements.push({
                tagName: child.tagName,
                className: child.className,
                innerText: child.innerText.trim().slice(0, 100),
                outerHTML: child.outerHTML.slice(0, 300)
              });
            }
          }
        });
      }

      return {
        siblings,
        nearElements
      };
    });

    console.log('Result:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
