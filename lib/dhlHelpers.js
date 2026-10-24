const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function dismissCookieBanner(page) {
  const cookieSelectors = [
    '#onetrust-accept-btn-handler',
    'button:has-text("Accept All")',
    'button:has-text("Alle akzeptieren")',
    'button:has-text("Accept")',
    'button:has-text("I agree")'
  ];

  for (const sel of cookieSelectors) {
    const btn = page.locator(sel).first();
    try {
      await btn.waitFor({ state: 'visible', timeout: 4000 });
      await btn.click().catch(() => {});
      await page.locator('#onetrust-banner-sdk, .onetrust-pc-dark-filter, #onetrust-consent-sdk').first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
      return;
    } catch (_) {}
  }
}

async function login(page, { email, password }) {
  const loginUrl =
    'https://dhlexpresscommerce.com/Account/MemberLogin.aspx?ReturnUrl=https%3A%2F%2Fnext.dhlexpresscommerce.com%2Forders';
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dismissCookieBanner(page);

  await page.locator('#LoginUser_UserName').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#LoginUser_UserName').fill(email);
  await page.locator('#LoginUser_Password').fill(password);

  await Promise.all([
    page.waitForURL(/(app2|next)\.dhlexpresscommerce\.com/i, { timeout: 90000 }).catch(() =>
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 90000 }).catch(() => {})
    ),
    page.locator('#LoginUser_LoginButton').click({ force: true })
  ]);

  await page.waitForTimeout(3000);
}

function getAppFrame(page) {
  return page.frames().find(f => /(app2|next)\.dhlexpresscommerce\.com/i.test(f.url())) || page.mainFrame();
}

async function waitForOrdersLoaded(page, orderNumber) {
  if (!page.url().includes('/orders')) {
    await page.goto('https://next.dhlexpresscommerce.com/orders', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(4000);

  const frame = getAppFrame(page);
  await frame.locator('input[placeholder*="Filter" i], input[placeholder*="Search" i], table, [role="row"]').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function searchOrder(page, orderNumber) {
  const frame = getAppFrame(page);
  const searchSelectors = [
    'input[placeholder*="Filter" i]',
    'input[aria-label*="Filter" i]',
    'input[placeholder*="Search" i]',
    'input[aria-label*="Search" i]',
    'input[type="search"]',
    'input[name*="search" i]',
    'input[id*="search" i]'
  ];

  for (const sel of searchSelectors) {
    const input = frame.locator(sel).first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill('');
      await input.fill(orderNumber);
      await input.press('Enter').catch(() => {});
      await page.waitForTimeout(3000);
      return;
    }
  }
}

async function openOrderByNumber(page, orderNumber) {
  await waitForOrdersLoaded(page, orderNumber);
  await searchOrder(page, orderNumber);

  const frame = getAppFrame(page);
  let row = frame.locator('tr, [role="row"], .order-row, [class*="order-row"]')
    .filter({ hasText: orderNumber })
    .first();

  if (await row.count() === 0) {
    // If not found in current tab, check if it is in the Printed tab
    const printedTab = frame.locator('a:has-text("Printed"), button:has-text("Printed")').first();
    if (await printedTab.isVisible().catch(() => false)) {
      await printedTab.click().catch(() => {});
      await page.waitForTimeout(3000);
      await searchOrder(page, orderNumber);
      row = frame.locator('tr, [role="row"], .order-row, [class*="order-row"]')
        .filter({ hasText: orderNumber })
        .first();
    }
  }

  if (await row.count() === 0) {
    throw new Error(`Order ${orderNumber} not found on orders page`);
  }

  const orderLink = row.locator(`a:has-text("${orderNumber}"), button:has-text("${orderNumber}"), [href*="${orderNumber}"]`).first();
  if (await orderLink.count() > 0) {
    await orderLink.click();
  } else {
    await row.click();
  }

  await page.waitForTimeout(3000);
  await page.locator('button:has-text("Save and close"), h1, button:has-text("Back")').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
}

async function selectOrderByNumber(page, orderNumber) {
  await waitForOrdersLoaded(page, orderNumber);
  await searchOrder(page, orderNumber);

  const frame = getAppFrame(page);
  let row = frame.locator('tr, [role="row"], .order-row, [class*="order-row"]')
    .filter({ hasText: orderNumber })
    .first();

  if (await row.count() === 0) {
    // If not found in current tab, check if it is in the Printed tab
    const printedTab = frame.locator('a:has-text("Printed"), button:has-text("Printed")').first();
    if (await printedTab.isVisible().catch(() => false)) {
      await printedTab.click().catch(() => {});
      await page.waitForTimeout(3000);
      await searchOrder(page, orderNumber);
      row = frame.locator('tr, [role="row"], .order-row, [class*="order-row"]')
        .filter({ hasText: orderNumber })
        .first();
    }
  }

  if (await row.count() === 0) {
    throw new Error(`Order ${orderNumber} not found on orders page`);
  }

  // Header checkbox: uncheck if currently checked
  const headerCheckbox = frame.locator(
    'thead input[type="checkbox"], th input[type="checkbox"], thead button[role="checkbox"], th button[role="checkbox"], thead [role="checkbox"], th [role="checkbox"]'
  ).first();
  if (await headerCheckbox.isVisible().catch(() => false)) {
    const isHeaderChecked =
      (await headerCheckbox.getAttribute('data-state').catch(() => '')) === 'checked' ||
      (await headerCheckbox.getAttribute('aria-checked').catch(() => '')) === 'true' ||
      (await headerCheckbox.isChecked().catch(() => false));
    if (isHeaderChecked) {
      await headerCheckbox.click().catch(() => {});
    }
  }

  // Row checkbox (supports standard HTML checkbox and Radix/Tailwind button[role="checkbox"])
  const rowCheckbox = row.locator(
    'button[role="checkbox"], input[type="checkbox"], [role="checkbox"]'
  ).first();
  if (await rowCheckbox.count() === 0) {
    throw new Error(`Checkbox not found for order ${orderNumber}`);
  }

  const isChecked =
    (await rowCheckbox.getAttribute('data-state').catch(() => '')) === 'checked' ||
    (await rowCheckbox.getAttribute('aria-checked').catch(() => '')) === 'true' ||
    (await rowCheckbox.isChecked().catch(() => false));

  if (!isChecked) {
    await rowCheckbox.click();
  }

  await page.waitForTimeout(1500);
}

async function saveAndCloseOrder(page) {
  const frame = getAppFrame(page);

  const saveBtn = frame.locator(
    'button:has-text("Save and close"), button:has-text("Save"), input[type="submit"][value="Save"], button:has-text("SAVE")'
  ).first();

  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(1000);
    // Wait for the loading overlay to be hidden before continuing
    const overlay = frame.locator('#overlay, .loading, .overlay').first();
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.waitFor({ state: 'hidden', timeout: 35000 }).catch(() => {});
    }
    await page.waitForTimeout(2000);
  }

  if (page.url().endsWith('/orders') || page.url().endsWith('/orders/')) {
    return;
  }

  const closeBtn = frame.locator(
    'button:has-text("Close"), button[aria-label="Close"], button:has-text("CLOSE")'
  ).first();

  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(2000);
    return;
  }

  const backBtn = frame.locator('button:has-text("Back"), a:has-text("Back"), a:has-text("Orders")').first();
  if (await backBtn.isVisible().catch(() => false)) {
    await backBtn.click();
    await page.waitForTimeout(2000);
  }
}

async function closeDialogs(page) {
  const frame = getAppFrame(page);
  const closeSelectors = [
    'button:has-text("Close")',
    'button[aria-label="Close"]',
    'button:has-text("Done")',
    'button:has-text("OK")'
  ];

  for (let i = 0; i < 2; i++) {
    let closed = false;
    for (const sel of closeSelectors) {
      const btn = frame.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(800);
        closed = true;
        break;
      }
    }
    if (!closed) break;
  }
}

async function selectDocumentTypeInvoice(page) {
  const frame = getAppFrame(page);

  await frame.locator('text=Documents').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  const byLabel = frame.getByLabel(/document type/i);
  if (await byLabel.count() > 0) {
    const tag = await byLabel.first().evaluate(el => el.tagName).catch(() => '');
    if (tag === 'SELECT') {
      await byLabel.first().selectOption({ label: 'Invoice' });
      await page.waitForTimeout(500);
      return;
    }
    await byLabel.first().click();
    await frame.getByRole('option', { name: /^Invoice$/i }).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    return;
  }

  const docTypeSelect = frame.locator(
    'select:near(:text("Document type"), 80), select[name*="document" i], select[id*="document" i]'
  ).first();

  if (await docTypeSelect.count() > 0) {
    await docTypeSelect.selectOption({ label: 'Invoice' }).catch(async () => {
      await docTypeSelect.selectOption({ value: 'Invoice' }).catch(async () => {
        await docTypeSelect.selectOption({ index: 1 });
      });
    });
    await page.waitForTimeout(500);
    return;
  }

  const dropdownTrigger = frame.locator(
    ':text("Document type") >> xpath=following::select[1] | :text("Document type") >> xpath=following::*[@role="combobox" or @role="listbox" or contains(@class,"select")][1]'
  ).first();

  if (await dropdownTrigger.isVisible().catch(() => false)) {
    const tag = await dropdownTrigger.evaluate(el => el.tagName).catch(() => '');
    if (tag === 'SELECT') {
      await dropdownTrigger.selectOption({ label: 'Invoice' });
    } else {
      await dropdownTrigger.click();
      await frame.locator('[role="option"]:has-text("Invoice"), li:has-text("Invoice")').first().click();
    }
    await page.waitForTimeout(500);
    return;
  }

  const invoiceOption = frame.locator(
    'option:has-text("Invoice"), [role="option"]:has-text("Invoice")'
  ).first();
  const parentSelect = frame.locator('select:has(option:has-text("Invoice"))').first();
  if (await parentSelect.count() > 0) {
    await parentSelect.selectOption({ label: 'Invoice' });
    await page.waitForTimeout(500);
  }
}

async function setUploadedDocumentTypeInvoice(page) {
  const frame = getAppFrame(page);

  const docRowSelect = frame.locator(
    'tr:has(input[type="file"]), tr:has(a[href*=".pdf"]), [class*="document"]:has(select)'
  ).last().locator('select').first();

  if (await docRowSelect.count() > 0) {
    await docRowSelect.selectOption({ label: 'Invoice' }).catch(() =>
      docRowSelect.selectOption({ value: 'Invoice' })
    );
    await page.waitForTimeout(500);
    return;
  }

  const lastDocSelect = frame.locator('select').filter({ has: frame.locator('option:has-text("Invoice")') }).last();
  if (await lastDocSelect.count() > 0) {
    await lastDocSelect.selectOption({ label: 'Invoice' });
    await page.waitForTimeout(500);
  }
}

function extractGoogleDriveFileId(url) {
  const patterns = [
    /drive\.google\.com\/file\/d\/([^/]+)/i,
    /drive\.google\.com\/open\?id=([^&]+)/i,
    /drive\.google\.com\/uc\?(?:[^#]*&)?id=([^&]+)/i,
    /docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([^/]+)/i
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function normalizeInvoiceUrl(url) {
  const fileId = extractGoogleDriveFileId(url);
  if (fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  return url;
}

function downloadWithHttp(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlink(destPath, () => {});
        return downloadWithHttp(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
    }).on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function downloadInvoiceFile(invoiceUrl, orderId, page = null) {
  ensureDir(OUTPUT_DIR);

  const destPath = path.join(OUTPUT_DIR, `invoice-${orderId}.pdf`);

  if (invoiceUrl.startsWith('file://') || fs.existsSync(invoiceUrl)) {
    const localPath = invoiceUrl.replace(/^file:\/\//, '').replace(/^\/([A-Za-z]:)/, '$1');
    if (fs.existsSync(localPath)) {
      if (path.resolve(localPath) !== path.resolve(destPath)) {
        fs.copyFileSync(localPath, destPath);
      }
      return destPath;
    }
  }

  const fileId = extractGoogleDriveFileId(invoiceUrl);
  const candidates = fileId
    ? [
        `https://drive.google.com/uc?export=download&id=${fileId}`,
        `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`
      ]
    : [normalizeInvoiceUrl(invoiceUrl)];

  let lastError = null;

  for (const url of candidates) {
    try {
      if (page) {
        const response = await page.request.get(url, { maxRedirects: 10, timeout: 120000 });
        if (!response.ok()) {
          throw new Error(`HTTP ${response.status()}`);
        }
        const body = await response.body();
        const contentType = (response.headers()['content-type'] || '').toLowerCase();
        if (contentType.includes('text/html') && body.slice(0, 15).toString().includes('<!DOCTYPE')) {
          throw new Error('Received HTML instead of file (Google Drive may require public access)');
        }
        fs.writeFileSync(destPath, body);
      } else {
        await downloadWithHttp(url, destPath);
      }

      const stat = fs.statSync(destPath);
      if (stat.size < 100) {
        throw new Error('Downloaded file is too small — check the URL is publicly accessible');
      }

      return destPath;
    } catch (err) {
      lastError = err;
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    }
  }

  throw new Error(`Could not download invoice: ${lastError?.message || lastError}`);
}

module.exports = {
  OUTPUT_DIR,
  ensureDir,
  login,
  getAppFrame,
  openOrderByNumber,
  selectOrderByNumber,
  saveAndCloseOrder,
  closeDialogs,
  selectDocumentTypeInvoice,
  setUploadedDocumentTypeInvoice,
  downloadInvoiceFile,
  extractGoogleDriveFileId
};
