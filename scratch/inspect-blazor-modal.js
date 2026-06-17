require('dotenv').config();
const { chromium } = require('playwright');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013702';

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless, slowMo: 100 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('Logging in...');
    await login(page, { email, password });

    console.log(`Opening order ${orderNumber}...`);
    await openOrderByNumber(page, orderNumber);
    await page.waitForTimeout(7000);

    const frame = getAppFrame(page);

    console.log('Expanding items section...');
    const itemsHeader = frame.locator('.order-section-title.items-section, .order-section-heading:has-text("Items")').first();
    await itemsHeader.click().catch(() => {});
    await page.waitForTimeout(3000);

    console.log('Clicking Add Item button...');
    const addItemBtn = frame.locator('button.btn-order-action.ssit-order-action-add, button:has-text("Add item")').first();
    await addItemBtn.click();
    await page.waitForTimeout(3000);

    console.log('Clicking edit button of the new row...');
    const editBtns = frame.locator('button.grid-button-edit');
    await editBtns.last().click();
    await page.waitForTimeout(3000);

    console.log('Inspecting inputs inside the open modal...');
    const modalInputs = await frame.evaluate(() => {
      // Find the modal or popup window container
      const dialog = document.querySelector('.k-window, .modal, .k-dialog, .ssi-modal, div[role="dialog"], .k-window-content') || document.body;
      
      const inputs = Array.from(dialog.querySelectorAll('input, select, textarea, button')).map(inp => {
        let labelText = '';
        // Look for preceding label or label within parent div
        const parentDiv = inp.closest('.form-group, .input-row, div');
        if (parentDiv) {
          const label = parentDiv.querySelector('label');
          if (label) {
            labelText = label.innerText.trim();
          } else {
            labelText = parentDiv.innerText.split('\n')[0].trim();
          }
        }
        return {
          tagName: inp.tagName,
          id: inp.id,
          name: inp.name,
          type: inp.type,
          value: inp.value,
          className: inp.className,
          placeholder: inp.getAttribute('placeholder') || '',
          labelText,
          outerHTML: inp.outerHTML.slice(0, 300)
        };
      });

      return {
        dialogClassName: dialog.className,
        dialogTagName: dialog.tagName,
        inputs
      };
    });

    console.log('=== MODAL DIALOG INFO ===');
    console.log(`Dialog Element: ${modalInputs.dialogTagName}.${modalInputs.dialogClassName}`);
    console.log('=== MODAL INPUTS ===');
    console.log(JSON.stringify(modalInputs.inputs, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
