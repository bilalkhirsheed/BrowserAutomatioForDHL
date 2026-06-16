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
  const orderNumber = '100013724'; // Using a known order number in "New" tab

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless, slowMo: 100 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  try {
    console.log('Logging in to DHL...');
    await login(page, { email, password });

    console.log('Listing all frames on current page before opening order...');
    const frames = page.frames();
    console.log(`Total frames: ${frames.length}`);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const url = f.url();
      const content = await f.evaluate(() => document.body ? document.body.innerText.length : 0).catch(() => 0);
      console.log(`Frame ${i}: name="${f.name()}", url="${url}", textLength=${content}`);
    }

    console.log(`Opening order ${orderNumber}...`);
    await openOrderByNumber(page, orderNumber);

    console.log('Waiting for order details to load...');
    await page.waitForTimeout(5000);

    console.log('Listing all frames on page AFTER opening order...');
    const framesAfter = page.frames();
    console.log(`Total frames: ${framesAfter.length}`);
    let targetFrame = page.mainFrame();
    
    for (let i = 0; i < framesAfter.length; i++) {
      const f = framesAfter[i];
      const url = f.url();
      const content = await f.evaluate(() => document.body ? document.body.innerText.length : 0).catch(() => 0);
      console.log(`Frame ${i}: name="${f.name()}", url="${url}", textLength=${content}`);
      if (url.includes('orders') && content > 500) {
        targetFrame = f;
      }
    }

    console.log('Using target frame:', targetFrame.url());

    // Take screenshot
    ensureDir(OUTPUT_DIR);
    const screenshotPath = path.join(OUTPUT_DIR, `order-inspect-${orderNumber}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);

    // Dump DOM elements from the target frame
    console.log('Extracting inputs and selects from target frame...');
    const result = await targetFrame.evaluate(() => {
      const dump = [];

      const findLabel = (el) => {
        if (el.id) {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          if (lbl) return lbl.innerText.trim();
        }
        // Try searching parents or sibling text
        let parent = el.parentElement;
        while (parent) {
          const text = parent.innerText || '';
          if (text.trim()) {
            const firstLine = text.split('\n')[0].trim();
            if (firstLine && firstLine !== el.value) {
              return firstLine;
            }
          }
          parent = parent.parentElement;
        }
        return '';
      };

      // 1. Selects
      const selects = Array.from(document.querySelectorAll('select'));
      dump.push(`=== SELECT ELEMENTS (${selects.length}) ===`);
      selects.forEach((sel, index) => {
        const labelText = findLabel(sel);
        const options = Array.from(sel.options).map(opt => ({
          value: opt.value,
          text: opt.text,
          selected: opt.selected
        }));
        dump.push(`[SELECT #${index}]`);
        dump.push(`  ID:          ${sel.id}`);
        dump.push(`  Name:        ${sel.name}`);
        dump.push(`  Class:       ${sel.className}`);
        dump.push(`  Label Context: ${labelText}`);
        dump.push(`  Options:`);
        options.forEach(opt => {
          dump.push(`    - Value: "${opt.value}" | Text: "${opt.text}"${opt.selected ? ' (SELECTED)' : ''}`);
        });
        dump.push('');
      });

      // 2. Inputs
      const inputs = Array.from(document.querySelectorAll('input'));
      dump.push(`=== INPUT ELEMENTS (${inputs.length}) ===`);
      inputs.forEach((inp, index) => {
        if (['hidden', 'submit', 'button', 'image'].includes(inp.type)) return;
        const labelText = findLabel(inp);
        dump.push(`[INPUT #${index}]`);
        dump.push(`  ID:          ${inp.id}`);
        dump.push(`  Name:        ${inp.name}`);
        dump.push(`  Type:        ${inp.type}`);
        dump.push(`  Value:       ${inp.value}`);
        dump.push(`  Placeholder: ${inp.placeholder}`);
        dump.push(`  Class:       ${inp.className}`);
        dump.push(`  Label Context: ${labelText}`);
        dump.push('');
      });

      // 3. Page Text Content snippet (first 12000 chars)
      const textSnippet = document.body.innerText.slice(0, 12000);
      dump.push('=== PAGE TEXT SNIPPET ===');
      dump.push(textSnippet);

      return dump.join('\n');
    });

    const dumpPath = path.join(OUTPUT_DIR, `order-inspect-dump-${orderNumber}.txt`);
    fs.writeFileSync(dumpPath, result);
    console.log(`DOM dump written to ${dumpPath}`);

  } catch (err) {
    console.error('Error occurred:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main();
