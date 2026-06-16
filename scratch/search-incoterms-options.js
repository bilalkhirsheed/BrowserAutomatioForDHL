require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

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

    const frames = page.frames();
    let detailFrame = null;
    for (const f of frames) {
      const url = f.url();
      if (url.includes('/orders/new/') || url.includes('/orders/edit/')) {
        detailFrame = f;
        break;
      }
    }

    if (!detailFrame) {
      throw new Error('Order details frame not found');
    }

    console.log('Expanding Customs details...');
    await detailFrame.locator('*:has-text("Customs details")').last().click().catch(() => {});
    await page.waitForTimeout(2000);

    const searchResult = await detailFrame.evaluate(() => {
      const results = [];
      
      // 1. Search for text on the page containing trade terms
      const bodyText = document.body.innerText;
      results.push(`Body contains 'terms of trade': ${bodyText.toLowerCase().includes('terms of trade')}`);
      results.push(`Body contains 'incoterm': ${bodyText.toLowerCase().includes('incoterm')}`);
      results.push(`Body contains 'ddp': ${bodyText.toLowerCase().includes('ddp')}`);
      results.push(`Body contains 'dap': ${bodyText.toLowerCase().includes('dap')}`);

      // 2. Search for any elements containing "DAP" or "DDP" or "Terms of Trade"
      const allElements = Array.from(document.querySelectorAll('*'));
      allElements.forEach(el => {
        const text = (el.innerText || '').trim();
        if (text === 'Terms of Trade' || text === 'Incoterms' || text === 'Incoterm') {
          results.push(`Found element with text "${text}": tag=${el.tagName}, className=${el.className}, HTML=${el.outerHTML}`);
        }
      });

      // 3. Find all labels and check if any contain customs/trade terms
      const labels = Array.from(document.querySelectorAll('label, div'));
      labels.forEach(lbl => {
        const txt = lbl.innerText || '';
        if (txt.toLowerCase().includes('trade') || txt.toLowerCase().includes('incoterm') || txt.toLowerCase().includes('delivery terms')) {
          results.push(`Found label/div text: "${txt}" | parent HTML: ${lbl.parentElement ? lbl.parentElement.outerHTML : ''}`);
        }
      });

      return results;
    });

    console.log('=== SEARCH RESULTS ===');
    searchResult.forEach(r => console.log(r));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
