const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const {
  OUTPUT_DIR,
  ensureDir,
  login,
  getAppFrame,
  selectOrderByNumber,
  closeDialogs
} = require('./dhlHelpers');

async function clickWizardOnce(page) {
  const frame = getAppFrame(page);
  const buttons = [
    'button:has-text("Continue")',
    'button:has-text("Confirm")',
    'button:has-text("Generate")',
    'button:has-text("Print"):not(.ssit-order-grid-btn-print):not(.ssit-order-grid)'
  ];

  for (const sel of buttons) {
    const btn = frame.locator(sel).first();
    if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
      const text = ((await btn.textContent()) || '').trim();
      if (/cancel|close|back/i.test(text)) continue;
      await btn.click();
      await page.waitForTimeout(1500);
      return true;
    }
  }
  return false;
}

async function waitForLabelDownload(page, labelButton, timeoutMs = 90000) {
  const started = Date.now();

  const tryDownload = (ms) =>
    page.waitForEvent('download', { timeout: ms }).catch(() => null);

  await labelButton.click();
  await page.waitForTimeout(1500);

  let download = await tryDownload(12000);
  if (download) return download;

  while (Date.now() - started < timeoutMs) {
    const clicked = await clickWizardOnce(page);
    if (!clicked) break;

    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) break;

    download = await tryDownload(Math.min(remaining, 15000));
    if (download) return download;
  }

  const remaining = timeoutMs - (Date.now() - started);
  if (remaining > 0) {
    download = await tryDownload(remaining);
    if (download) return download;
  }

  throw new Error('Label download did not start — check DHL for errors on this order');
}

async function clickPrintShippingLabels(page) {
  const frame = getAppFrame(page);
  const labelButtons = [
    'text=Print shipping labels',
    'text=Print Shipping Labels',
    'text=Create shipping labels',
    'text=Create Shipping Labels',
    'button:has-text("Print shipping")',
    'button:has-text("Create shipping")'
  ];

  for (const sel of labelButtons) {
    const btn = frame.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) return btn;
  }

  throw new Error('Print shipping labels button not found');
}

const {
  extractTrackingFromPdf,
  extractTrackingFromText
} = require('./tracking');

async function extractTrackingFromPage(page, orderNumber) {
  const frame = getAppFrame(page);
  const rowText = await frame.locator('tr, [role="row"]')
    .filter({ hasText: orderNumber })
    .first()
    .innerText()
    .catch(() => '');

  let tracking = extractTrackingFromText(rowText, orderNumber);
  if (tracking) return tracking;

  const pageText = await frame.evaluate(() => document.body.innerText).catch(() => '');
  return extractTrackingFromText(pageText, orderNumber);
}

function logShipResult(result) {
  console.log('\n========== SHIP COMPLETE ==========');
  console.log('Order ID:       ', result.orderId);
  console.log('Tracking Number:', result.trackingNumber || '(not found)');
  console.log('Label File:     ', result.labelFile);
  console.log('===================================\n');
}

/**
 * Select order, print shipping label, save PDF, return tracking, then stop.
 */
async function printLabel({ orderId, onProgress = () => {} }) {
  const orderNumber = String(orderId);
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = process.env.DHL_HEADLESS !== 'false';

  if (!email || !password) {
    throw new Error('DHL_EMAIL and DHL_PASSWORD must be set in .env');
  }

  ensureDir(OUTPUT_DIR);

  let browser;
  let page;

  try {
    onProgress('Launching browser...');
    browser = await chromium.launch({ headless, slowMo: 150 });

    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1400, height: 900 }
    });

    page = await context.newPage();

    onProgress('Logging in to DHL...');
    await login(page, { email, password });

    onProgress(`Selecting order ${orderNumber}...`);
    await selectOrderByNumber(page, orderNumber);

    onProgress('Printing shipping label...');
    const labelButton = await clickPrintShippingLabels(page);
    const labelPath = path.resolve(OUTPUT_DIR, `awb-${orderNumber}.pdf`);

    const download = await waitForLabelDownload(page, labelButton);
    await download.saveAs(labelPath);

    if (!fs.existsSync(labelPath)) {
      throw new Error('Label file was not saved');
    }

    onProgress(`Label saved: ${labelPath}`);

    await closeDialogs(page);

    let trackingNumber = await extractTrackingFromPdf(labelPath, orderNumber);
    if (!trackingNumber) {
      trackingNumber = await extractTrackingFromPage(page, orderNumber);
    }

    const result = {
      orderId: orderNumber,
      trackingNumber: trackingNumber || null,
      labelFile: labelPath,
      status: 'completed',
      message: 'Label printed successfully'
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `ship-${orderNumber}.json`),
      JSON.stringify(result, null, 2)
    );

    logShipResult(result);
    onProgress('Done — browser closing');
    return result;
  } catch (err) {
    if (page && !page.isClosed()) {
      const debugPath = path.join(OUTPUT_DIR, `debug-ship-${orderNumber}.png`);
      await page.screenshot({ path: debugPath, fullPage: true }).catch(() => {});
    }
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = {
  printLabel,
  logShipResult,
  clickPrintShippingLabels,
  waitForLabelDownload,
  extractTrackingFromPage
};
