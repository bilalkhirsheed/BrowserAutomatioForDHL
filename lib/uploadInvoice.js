const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const {
  OUTPUT_DIR,
  login,
  getAppFrame,
  openOrderByNumber,
  saveAndCloseOrder,
  selectDocumentTypeInvoice,
  setUploadedDocumentTypeInvoice,
  downloadInvoiceFile
} = require('./dhlHelpers');

async function uploadInvoiceDocument(page, invoicePath) {
  const frame = getAppFrame(page);

  await frame.locator('text=Documents').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1000);

  await selectDocumentTypeInvoice(page);

  const uploadTrigger = frame.locator(
    'text=Upload document, button:has-text("Upload"), label:has-text("Upload")'
  ).first();

  if (await uploadTrigger.isVisible().catch(() => false)) {
    await uploadTrigger.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  const fileInput = frame.locator('input[type="file"]').first();
  await fileInput.waitFor({ state: 'attached', timeout: 30000 });
  await fileInput.setInputFiles(invoicePath);
  await page.waitForTimeout(2000);

  await setUploadedDocumentTypeInvoice(page);
  await selectDocumentTypeInvoice(page);
  await page.waitForTimeout(1000);
}

/**
 * Download invoice from URL and upload to DHL order. Does NOT print labels.
 */
/**
 * Download invoice from URL and upload to DHL order. Does NOT print labels.
 */
async function uploadInvoice({
  orderId,
  invoiceURL,
  packageType,
  insurance,
  incoterms,
  onProgress = () => {}
}) {
  const orderNumber = String(orderId);
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = process.env.DHL_HEADLESS !== 'false';

  if (!email || !password) {
    throw new Error('DHL_EMAIL and DHL_PASSWORD must be set in .env');
  }
  if (!invoiceURL) {
    throw new Error('invoiceURL is required');
  }

  let browser;
  let page;

  try {
    onProgress('Launching browser...');
    browser = await chromium.launch({ headless, slowMo: 300 });

    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 }
    });

    page = await context.newPage();

    onProgress('Logging in to DHL...');
    await login(page, { email, password });

    onProgress('Downloading invoice from URL...');
    const invoicePath = await downloadInvoiceFile(invoiceURL, orderNumber, page);
    onProgress(`Invoice downloaded: ${invoicePath}`);

    onProgress(`Opening order ${orderNumber}...`);
    await openOrderByNumber(page, orderNumber);

    onProgress('Setting document type to Invoice and uploading...');
    await uploadInvoiceDocument(page, invoicePath);

    const frame = getAppFrame(page);

    // 1. Handle Package Type (if provided)
    if (packageType) {
      onProgress(`Setting package type to: ${packageType}...`);
      const packageDropdown = frame.locator('span:has-text("Mini Package"), span:has-text("Midi Package"), span:has-text("Double Mini Package"), span:has-text("Envelpe"), span:has-text("Custom dimensions")').first();
      
      if (await packageDropdown.isVisible().catch(() => false)) {
        await packageDropdown.click();
        await page.waitForTimeout(1000);
        
        const option = frame.locator('.k-list-item, [role="option"], li').filter({ hasText: packageType }).first();
        if (await option.count() > 0) {
          await option.click();
          await page.waitForTimeout(1000);
        } else {
          onProgress(`Warning: Package type option "${packageType}" not found in dropdown.`);
        }
      } else {
        onProgress('Warning: Package type dropdown not visible on page.');
      }
    }

    // 2. Handle Insurance (if provided)
    if (insurance !== undefined && insurance !== null) {
      onProgress(`Setting insurance protection to: ${insurance}...`);
      
      const insuranceCheckbox = frame.locator('#INSURANCE').first();
      if (await insuranceCheckbox.isVisible().catch(() => false)) {
        const isChecked = await insuranceCheckbox.isChecked().catch(() => false);
        if (!isChecked) {
          await insuranceCheckbox.click();
          await page.waitForTimeout(1000);
        }
        
        const insuranceInput = frame.locator('.ssit-input-row, .input-row').filter({ hasText: /Insurance/i }).locator('input').first();
        
        // If the input is not visible, expand the Additional details accordion
        if (!(await insuranceInput.isVisible().catch(() => false))) {
          const additionalDetailsHeader = frame.locator('*:has-text("Additional details")').last();
          if (await additionalDetailsHeader.isVisible().catch(() => false)) {
            await additionalDetailsHeader.click();
            await insuranceInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
          }
        }
        
        if (await insuranceInput.isVisible().catch(() => false)) {
          await insuranceInput.fill('');
          await insuranceInput.fill(String(insurance));
          await insuranceInput.press('Tab');
          await page.waitForTimeout(1000);
        } else {
          onProgress('Warning: Insurance Value input field not found or not visible.');
        }
      } else {
        onProgress('Warning: Shipment Value Protection checkbox (#INSURANCE) not found or not visible.');
      }
    }

    // 3. Handle Incoterms (if provided)
    if (incoterms) {
      onProgress(`Setting Incoterms to: ${incoterms}...`);
      const incotermsRow = frame.locator('.ssit-input-row, .input-row', { hasText: 'Incoterms' }).first();
      
      // If the Incoterms row is not yet visible, expand Customs details
      if (!(await incotermsRow.isVisible().catch(() => false))) {
        const customsHeader = frame.locator('*:has-text("Customs details")').last();
        if (await customsHeader.isVisible().catch(() => false)) {
          await customsHeader.click();
          await incotermsRow.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        }
      }

      if (await incotermsRow.isVisible().catch(() => false)) {
        const incotermsDropdown = incotermsRow.locator('.k-dropdownlist, .k-picker').first();
        if (await incotermsDropdown.isVisible().catch(() => false)) {
          await incotermsDropdown.click();
          await page.waitForTimeout(1000);

          const incotermTextMap = {
            'ddp': 'Delivered Duty Paid',
            'dap': 'Delivered at Place',
            'ddu': 'Delivered at Place'
          };
          const targetText = incotermTextMap[incoterms.toLowerCase()] || incoterms;

          const option = frame.locator('.k-list-item, [role="option"], li').filter({ hasText: targetText }).first();
          if (await option.count() > 0) {
            await option.click();
            await page.waitForTimeout(1000);
          } else {
            onProgress(`Warning: Incoterms option "${targetText}" not found in dropdown.`);
          }
        } else {
          onProgress('Warning: Incoterms dropdown picker not found.');
        }
      } else {
        onProgress('Warning: Incoterms row not visible under Customs details.');
      }
    }

    onProgress('Saving and closing order...');
    await saveAndCloseOrder(page);

    const result = {
      orderId: orderNumber,
      invoiceURL,
      invoiceFile: invoicePath,
      packageType: packageType || null,
      insurance: insurance || null,
      incoterms: incoterms || null,
      status: 'completed',
      message: 'Invoice uploaded and fields updated successfully'
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `invoice-upload-${orderNumber}.json`),
      JSON.stringify(result, null, 2)
    );

    onProgress('Done');
    return result;
  } catch (err) {
    if (page && !page.isClosed()) {
      const debugPath = path.join(OUTPUT_DIR, `debug-invoice-${orderNumber}.png`);
      await page.screenshot({ path: debugPath, fullPage: true }).catch(() => {});
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `debug-invoice-${orderNumber}.html`),
        await page.content().catch(() => '')
      );
    }
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { uploadInvoice };
