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
  incoterms,
  items,
  numberOfPackages,
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


    // 4. Handle Items Update (Delete all existing items and add/update only the passed item)
    if (items && Array.isArray(items) && items.length > 0) {
      onProgress('Updating items section: deleting existing items and adding the new item...');
      
      const isBlazor = page.url().includes('/orders/new') || (await frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').count() > 0);
      onProgress(`Detected UI layout: ${isBlazor ? 'Blazor (New Order)' : 'jQuery (Printed Order)'}`);

      if (isBlazor) {
        // --- BLAZOR VIEW FLOW ---
        // Expand Items section if collapsed
        const itemsHeader = frame.locator('.order-section-title.items-section, .order-section-heading:has-text("Items")').first();
        if (await itemsHeader.isVisible().catch(() => false)) {
          const addItemBtn = frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').first();
          if (!(await addItemBtn.isVisible().catch(() => false))) {
            onProgress('Items section is collapsed. Clicking Items header to expand...');
            await itemsHeader.click();
            await page.waitForTimeout(2000);
          }
        }

        // Wait for Add Item button to be visible
        const addItemBtn = frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').first();
        await addItemBtn.waitFor({ state: 'visible', timeout: 25000 });
        await page.waitForTimeout(1500);

        const skusToKeep = [];

        // Add items one by one via modal
        for (const item of items) {
          onProgress(`Adding new item SKU "${item.sku}"...`);
          await addItemBtn.click();
          await page.waitForTimeout(3000); // Wait for Blazor row to enter edit mode

          // Click edit button for the newly added row (the last row)
          const editBtns = frame.locator('button.grid-button-edit');
          await editBtns.last().click();
          await page.waitForTimeout(3000);

          const modal = frame.locator('div.blazored-modal').first();
          await modal.waitFor({ state: 'visible', timeout: 10000 });

          const nameInput = modal.locator('input[placeholder*="Short sleeve"]').first();
          const skuInput = modal.locator('input[placeholder*="Item SKU"]').first();
          const weightInput = modal.locator('input[type="number"][placeholder="1.0"]').first();
          const priceInput = modal.locator('input[type="number"][placeholder="00.00"]').first();
          const qtyInput = modal.locator('input.ssit-input-numeric').first();
          const qtyToShipInput = modal.locator('input.ssit-input-numeric').nth(1);

          onProgress(`Filling fields in modal for SKU "${item.sku}"...`);
          
          await skuInput.fill(String(item.sku || ''));
          await skuInput.press('Escape');
          await page.waitForTimeout(500);

          await nameInput.fill(String(item.name || ''));
          await nameInput.press('Escape');
          await page.waitForTimeout(500);
          
          await qtyInput.fill(String(item.quantity || '1'));
          if (await qtyToShipInput.isVisible().catch(() => false)) {
            await qtyToShipInput.fill(String(item.quantity || '1'));
          }
          await priceInput.fill(String(item.price || '0.1'));
          await weightInput.fill('0.001'); // Force item weight to 0.001

          await page.waitForTimeout(1000);

          // Click Update Order button in modal
          const updateBtn = modal.locator('button.btn-modal.add, button:has-text("Update order")').first();
          await updateBtn.click();
          
          // Wait for modal to close and changes to apply
          await page.waitForTimeout(3000);

          skusToKeep.push(String(item.sku || ''));
        }

        // Delete all other existing items that aren't in skusToKeep
        onProgress('Deleting other items...');
        while (true) {
          // Find index of first row that does not contain one of our SKUs in any of its inputs
          const oldRowIndex = await frame.evaluate((keepSkus) => {
            const rows = Array.from(document.querySelectorAll('.order-section-content.items-section tr.k-master-row, .items-section tr.k-master-row'));
            for (let i = 0; i < rows.length; i++) {
              const tr = rows[i];
              const inputs = Array.from(tr.querySelectorAll('input'));
              const inputValues = inputs.map(inp => (inp.value || '').trim());
              const hasKeepSku = inputValues.some(val => keepSkus.includes(val));
              if (!hasKeepSku) {
                return i;
              }
            }
            return -1;
          }, skusToKeep);

          if (oldRowIndex === -1) {
            onProgress('No other items left to delete.');
            break;
          }

          onProgress(`Deleting old item at row index ${oldRowIndex}...`);
          const row = frame.locator('.order-section-content.items-section tr.k-master-row, .items-section tr.k-master-row').nth(oldRowIndex);
          const ellipsis = row.locator('button.grid-button-ellipsis').first();
          await ellipsis.click();
          await page.waitForTimeout(1000);

          const deleteOption = frame.locator('.k-popup .k-menu-item:has-text("Delete"), .k-popup [role="menuitem"]:has-text("Delete"), .ssit-grid-menu-item:has-text("Delete")').first();
          if (await deleteOption.isVisible()) {
            await deleteOption.click({ force: true });
            // Wait for this specific row to disappear from the DOM
            await row.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(1500); // Extra safety buffer
          } else {
            onProgress('Warning: Delete menu option not visible.');
            break;
          }
        }

      } else {
        // --- JQUERY VIEW FLOW ---
        const itemsHeader = frame.locator('*:has-text("Items")').last();
        let isCollapsed = false;
        if (await itemsHeader.isVisible().catch(() => false)) {
          isCollapsed = await frame.evaluate(() => {
            const el = document.querySelector('.order-section-content.items-section .order-section-content-grid-content');
            if (!el) return false;
            return window.getComputedStyle(el).display === 'none';
          });
        }

        if (isCollapsed) {
          onProgress('Items section is collapsed. Clicking Items header to expand...');
          await itemsHeader.click();
          await page.waitForTimeout(2000);
        }

        // Wait for the Add Item button to be attached and visible to ensure grid is fully loaded
        const addItemBtn = frame.locator('button.add-item-btn').first();
        onProgress('Waiting for Items grid to load...');
        await addItemBtn.waitFor({ state: 'visible', timeout: 25000 }).catch((e) => {
          onProgress(`Warning: Add Item button did not become visible: ${e.message}`);
        });
        await page.waitForTimeout(1500); // Wait for items and delete buttons to render fully

        // Delete all existing items
        const deleteBtns = frame.locator('i.delete-item-btn');
        const initialCount = await deleteBtns.count();
        onProgress(`Found ${initialCount} existing items to delete.`);
        
        for (let i = 0; i < initialCount; i++) {
          onProgress(`Deleting item index ${i + 1}...`);
          await deleteBtns.first().click();
          await page.waitForTimeout(1000);
        }

        // Add all items in the array
        let index = 0;
        for (const targetItem of items) {
          onProgress(`Clicking Add Item button for SKU "${targetItem.sku}"...`);
          await addItemBtn.click();
          await page.waitForTimeout(1500);

          onProgress(`Filling new item fields: Description="${targetItem.name}", SKU="${targetItem.sku}", Qty="${targetItem.quantity}", Price="${targetItem.price}", Weight="${targetItem.weight}"`);
          
          const skuInput = frame.locator(`#item-SKU-${index}`).first();
          const descInput = frame.locator(`#item-Description-${index}`).first();
          const qtyInput = frame.locator(`#item-Quantity-${index}`).first();
          const priceInput = frame.locator(`#item-UnitPrice-${index}`).first();
          const weightInput = frame.locator(`#item-Weight-${index}`).first();

          await skuInput.fill(String(targetItem.sku || ''));
          await descInput.fill(String(targetItem.name || ''));
          await qtyInput.fill(String(targetItem.quantity || '1'));
          await priceInput.fill(String(targetItem.price || '0.1'));
          await weightInput.fill('0.001'); // Force item weight to 0.001
          
          await page.waitForTimeout(1000);
          index++;
        }
      }
    } else {
      onProgress('No items array passed. Running standard minimum error correction...');
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
    }

    // --- PACKAGING & INCOTERMS UPDATE ---
    // 1. Handle Package Type (if provided)
    if (packageType) {
      let normalizedPackageType = packageType.trim();
      const lowerType = normalizedPackageType.toLowerCase();
      if (lowerType.includes('double midi')) {
        normalizedPackageType = 'Double Midi Package';
      } else if (lowerType.includes('double mini')) {
        normalizedPackageType = 'Double Mini Package';
      } else if (lowerType.includes('mini')) {
        normalizedPackageType = 'Mini Package';
      } else if (lowerType.includes('midi')) {
        normalizedPackageType = 'Midi Package';
      } else if (lowerType.includes('envelope') || lowerType.includes('envelpe')) {
        normalizedPackageType = 'Envelope';
      }

      onProgress(`Setting package type to: ${normalizedPackageType} (mapped from input "${packageType}")...`);
      const packageDropdown = frame.locator('.package-selected-packing, span:has-text("Mini Package"), span:has-text("Midi Package"), span:has-text("Double Mini Package"), span:has-text("Double Midi Package"), span:has-text("Envelpe"), span:has-text("Custom dimensions")').first();
      
      if (await packageDropdown.isVisible().catch(() => false)) {
        let opened = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          await packageDropdown.scrollIntoViewIfNeeded().catch(() => {});
          await packageDropdown.click({ force: true });
          const firstListItem = frame.locator('.k-list-item, [role="option"], li.k-list-item').first();
          try {
            await firstListItem.waitFor({ state: 'visible', timeout: 2000 });
            opened = true;
            break;
          } catch (e) {
            onProgress(`Package type dropdown did not open on attempt ${attempt}, retrying...`);
          }
        }

        if (opened) {
          const option = frame.locator('.k-list-item, [role="option"], li').filter({ hasText: normalizedPackageType }).first();
          try {
            await option.waitFor({ state: 'visible', timeout: 5000 });
            await option.click();
            await page.waitForTimeout(1000);
          } catch (err) {
            onProgress(`Warning: Package type option "${normalizedPackageType}" not found or not visible in dropdown.`);
          }
        } else {
          onProgress('Warning: Package type dropdown did not open or list options not visible.');
        }
      } else {
        onProgress('Warning: Package type dropdown not visible on page.');
      }
    }

    // 2. Handle Number of Packages (if provided)
    if (numberOfPackages) {
      onProgress(`Setting number of packages to: ${numberOfPackages}...`);
      
      const packagingHeader = frame.locator('.order-section-title:has-text("Packaging"), .order-section-heading:has-text("Packaging"), *:has-text("Packaging details")').first();
      let packagingRow = frame.locator('tr:has(.package-selected-packing)').first();
      let packageQtyInput = packagingRow.locator('td[data-col-index="1"] input, input[type="number"].ssit-input-numeric').first();
      let jqueryQtyInput = frame.locator('#Pieces, [name="Pieces"]').first();
      
      if (!(await packageQtyInput.isVisible().catch(() => false)) && !(await jqueryQtyInput.isVisible().catch(() => false))) {
        onProgress('Packaging section appears collapsed. Attempting to expand...');
        if (await packagingHeader.isVisible().catch(() => false)) {
          await packagingHeader.click();
          await page.waitForTimeout(2000);
        }
      }

      if (await packageQtyInput.isVisible().catch(() => false)) {
        await packageQtyInput.click();
        await packageQtyInput.fill(String(numberOfPackages));
        await packageQtyInput.evaluate((el, val) => {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(numberOfPackages));
        await packageQtyInput.press('Tab');
        await page.waitForTimeout(1000);
      } else if (await jqueryQtyInput.isVisible().catch(() => false)) {
        await jqueryQtyInput.click();
        await jqueryQtyInput.fill(String(numberOfPackages));
        await jqueryQtyInput.evaluate((el, val) => {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(numberOfPackages));
        await jqueryQtyInput.press('Tab');
        await page.waitForTimeout(1000);
      } else {
        onProgress('Warning: Package quantity input not visible or not found.');
      }
    }

    // 3. Set overall package weight if weight is provided (Place #1)
    const targetItem = items && items[0];
    const weight = targetItem ? targetItem.weight : null;
    if (weight !== undefined && weight !== null && weight !== '') {
      onProgress(`Setting overall package weight (Place #1) to: ${weight}...`);
      let overallWeightInput = frame.locator('#Weight, [name="Weight"], input.default-package-select').first();
      
      // If weight input is not visible, check if we need to expand Packaging section
      if (!(await overallWeightInput.isVisible().catch(() => false))) {
        onProgress('Packaging section appears collapsed. Attempting to expand...');
        const packagingHeader = frame.locator('.order-section-title:has-text("Packaging"), .order-section-heading:has-text("Packaging"), *:has-text("Packaging details")').first();
        if (await packagingHeader.isVisible().catch(() => false)) {
          await packagingHeader.click();
          await page.waitForTimeout(2000);
        }
      }

      // Check visibility again
      overallWeightInput = frame.locator('#Weight, [name="Weight"], input.default-package-select').first();
      if (await overallWeightInput.isVisible().catch(() => false)) {
        await overallWeightInput.click();
        await overallWeightInput.fill(String(weight));
        await overallWeightInput.evaluate((el, val) => {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(weight));
        await overallWeightInput.press('Tab');
        await page.waitForTimeout(1000);
      } else {
        onProgress('Warning: Overall package weight input (#Weight or .default-package-select) not visible or not found.');
      }
    }

    // 4. Handle Incoterms (if provided)
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
          let opened = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            await incotermsDropdown.scrollIntoViewIfNeeded().catch(() => {});
            await incotermsDropdown.click({ force: true });
            const firstListItem = frame.locator('.k-list-item, [role="option"], li.k-list-item').first();
            try {
              await firstListItem.waitFor({ state: 'visible', timeout: 2000 });
              opened = true;
              break;
            } catch (e) {
              onProgress(`Incoterms dropdown did not open on attempt ${attempt}, retrying...`);
            }
          }

          if (opened) {
            const incotermTextMap = {
              'ddp': 'Delivered Duty Paid',
              'dap': 'Delivered at Place',
              'ddu': 'Delivered at Place'
            };
            const targetText = incotermTextMap[incoterms.toLowerCase()] || incoterms;

            const option = frame.locator('.k-list-item, [role="option"], li').filter({ hasText: targetText }).first();
            try {
              await option.waitFor({ state: 'visible', timeout: 5000 });
              await option.click();
              await page.waitForTimeout(1000);
            } catch (err) {
              onProgress(`Warning: Incoterms option "${targetText}" not found or not visible in dropdown.`);
            }
          } else {
            onProgress('Warning: Incoterms dropdown did not open or list options not visible.');
          }
        } else {
          onProgress('Warning: Incoterms dropdown picker not found.');
        }
      } else {
        onProgress('Warning: Incoterms row not visible under Customs details.');
      }
    }

    onProgress('Saving and closing order details...');
    await page.screenshot({ path: path.join(OUTPUT_DIR, `debug-before-save-${orderNumber}.png`), fullPage: true }).catch(() => {});
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
      insurance: null,
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
