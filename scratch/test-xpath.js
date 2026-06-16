require('dotenv').config();
const { chromium } = require('playwright');
const { login, openOrderByNumber, getAppFrame } = require('../lib/dhlHelpers');

async function main() {
  const email = process.env.DHL_EMAIL;
  const password = process.env.DHL_PASSWORD;
  const headless = true;
  const orderNumber = '100013724';

  const browser = await chromium.launch({ headless, slowMo: 150 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  try {
    await login(page, { email, password });
    await openOrderByNumber(page, orderNumber);
    await page.waitForTimeout(5000);

    const frame = getAppFrame(page);

    // Click/check the checkbox
    console.log('Checking insurance checkbox...');
    const insuranceCheckbox = frame.locator('#INSURANCE').first();
    await insuranceCheckbox.check();
    await page.waitForTimeout(2000);

    // Find the input field using XPath
    console.log('Locating Insurance Value input via XPath...');
    const xpath = 'xpath=//div[contains(@class, "ssit-input-row") and .//*[text()="Insurance Value"]]//input';
    const insuranceInput = frame.locator(xpath).first();

    if (await insuranceInput.isVisible()) {
      console.log('SUCCESS: Input is visible. Current value:', await insuranceInput.inputValue());
      await insuranceInput.fill('123.45');
      console.log('SUCCESS: Input filled. New value:', await insuranceInput.inputValue());
    } else {
      console.log('FAILED: Input is not visible via XPath.');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

main();
