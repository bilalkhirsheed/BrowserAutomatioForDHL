const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const {
  OUTPUT_DIR,
  ensureDir,
  login,
  getAppFrame,
  openOrderByNumber,
  saveAndCloseOrder,
  selectDocumentTypeInvoice,
  setUploadedDocumentTypeInvoice,
  downloadInvoiceFile,
  selectOrderByNumber,
  closeDialogs
} = require('./dhlHelpers');

const {
  clickPrintShippingLabels,
  waitForLabelDownload,
  extractTrackingFromPage,
  logShipResult
} = require('./printLabel');

const { extractTrackingFromPdf } = require('./tracking');

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
 * Combined DHL automation flow:
 * 1. Download invoice PDF from URL
 * 2. Log in to DHL Express Commerce
 * 3. Open the order detail page
 * 4. Upload the invoice document
 * 5. Update packageType, insurance, and incoterms if provided
 * 6. Expand items section and validate/correct unit prices and weights
 * 7. Save and close the order details
 * 8. Select the order checkbox on the orders list page
 * 9. Generate and download shipping labels (AWB pdf)
 * 10. Extract tracking number and clean up
 */
async function combinedFlow({
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

  ensureDir(OUTPUT_DIR);

  let browser;
  let page;

  try {
    onProgress('Launching browser...');
    browser = await chromium.launch({ headless, slowMo: 200 });

    const context = await browser.newContext({
      acceptDownloads: true,
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

    // 4. Validate & Correct Item Prices and Weights
    onProgress('Checking if Items section is collapsed...');
    const itemsHeader = frame.locator('*:has-text("Items")').last();
    let isCollapsed = false;

    if (await itemsHeader.isVisible().catch(() => false)) {
      isCollapsed = await frame.evaluate(() => {
        const el = document.querySelector('.order-section-content.items-section .order-section-content-grid-content');
        if (!el) return false;
        return window.getComputedStyle(el).display === 'none';
      });
    }

    const priceInputs = frame.locator('td[data-col-index="3"] input.ssit-input-text');
    const weightInputs = frame.locator('td[data-col-index="4"] input.ssit-input-text');

    if (isCollapsed || (await priceInputs.count() === 0) || !(await priceInputs.first().isVisible().catch(() => false))) {
      onProgress('Items section is collapsed or price inputs not visible. Clicking Items header to expand...');
      if (await itemsHeader.isVisible().catch(() => false)) {
        await itemsHeader.click();
        await page.waitForTimeout(2000);
      }
    }

    const itemsCount = await priceInputs.count();
    onProgress(`Checking prices and weights for ${itemsCount} items...`);

    for (let i = 0; i < itemsCount; i++) {
      const priceInput = priceInputs.nth(i);
      const weightInput = weightInputs.nth(i);

      const priceValStr = await priceInput.inputValue().catch(() => '0');
      const weightValStr = await weightInput.inputValue().catch(() => '0');

      const priceVal = parseFloat(priceValStr) || 0;
      const weightVal = parseFloat(weightValStr) || 0;

      onProgress(`Item ${i + 1}/${itemsCount}: Price = "${priceValStr}", Weight = "${weightValStr}"`);

      if (priceVal <= 0) {
        onProgress(`Item ${i + 1}: Price is <= 0 (${priceValStr}), correcting to "0.1"`);
        await priceInput.click();
        await priceInput.fill('0.1');
        await priceInput.press('Tab');
        await page.waitForTimeout(500);
      }

      if (weightVal <= 0) {
        onProgress(`Item ${i + 1}: Weight is <= 0 (${weightValStr}), correcting to "0.001"`);
        await weightInput.click();
        await weightInput.fill('0.001');
        await weightInput.press('Tab');
        await page.waitForTimeout(500);
      }
    }

    onProgress('Saving and closing order details...');
    await saveAndCloseOrder(page);

    onProgress(`Selecting order ${orderNumber} on orders list...`);
    await selectOrderByNumber(page, orderNumber);

    onProgress('Printing shipping label...');
    const labelButton = await clickPrintShippingLabels(page);
    const labelPath = path.resolve(OUTPUT_DIR, `awb-${orderNumber}.pdf`);

    const download = await waitForLabelDownload(page, labelButton);
    await download.saveAs(labelPath);

    if (!fs.existsSync(labelPath)) {
      throw new Error('AWB PDF label file was not saved');
    }

    onProgress(`Label PDF saved to ${labelPath}`);

    await closeDialogs(page);

    onProgress('Extracting tracking number...');
    let trackingNumber = await extractTrackingFromPdf(labelPath, orderNumber);
    if (!trackingNumber) {
      trackingNumber = await extractTrackingFromPage(page, orderNumber);
    }

    const result = {
      orderId: orderNumber,
      invoiceURL,
      invoiceFile: invoicePath,
      packageType: packageType || null,
      insurance: insurance || null,
      incoterms: incoterms || null,
      trackingNumber: trackingNumber || null,
      labelFile: labelPath,
      status: 'completed',
      message: 'Invoice uploaded, item validations corrected, and shipping label printed successfully'
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `combined-${orderNumber}.json`),
      JSON.stringify(result, null, 2)
    );

    logShipResult(result);
    onProgress('Combined flow completed — closing browser.');
    return result;

  } catch (err) {
    if (page && !page.isClosed()) {
      const debugPngPath = path.join(OUTPUT_DIR, `debug-combined-${orderNumber}.png`);
      await page.screenshot({ path: debugPngPath, fullPage: true }).catch(() => {});
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `debug-combined-${orderNumber}.html`),
        await page.content().catch(() => '')
      );
      onProgress(`Saved error screenshot to ${debugPngPath}`);
    }
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = { combinedFlow };
