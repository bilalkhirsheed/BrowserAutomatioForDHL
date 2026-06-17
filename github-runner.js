require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { combinedFlow } = require('./lib/combinedFlow');

// Map workflow variables to environment variables
const orderId = process.env.ORDER_ID;
const invoiceURL = process.env.INVOICE_URL;
const packageType = process.env.PACKAGE_TYPE;
const incoterms = process.env.INCOTERMS;
const numberOfPackages = process.env.NUMBER_OF_PACKAGES;
const orderIdentity = process.env.ORDER_IDENTITY;

// Parse items JSON string from workflow dispatch inputs
let items = [];
if (process.env.ITEMS) {
  try {
    console.log('Parsing ITEMS environment variable...');
    items = JSON.parse(process.env.ITEMS);
  } catch (err) {
    console.error('ERROR: Failed to parse ITEMS JSON string:', err.message);
  }
}

// Constant webhook callback URL
const callbackURL = 'https://hook.us2.make.com/e9htplj662l7d5p6ijdt2cisnk9lsvvd';

console.log('--- DHL GitHub Actions Runner ---');
console.log('Order ID:      ', orderId);
console.log('Invoice URL:   ', invoiceURL);
console.log('Package Type:  ', packageType);
console.log('Incoterms:     ', incoterms);
console.log('Packages Count:', numberOfPackages);
console.log('Order Identity:', orderIdentity);
console.log('Items Count:   ', items ? items.length : 0);
console.log('Callback URL:  ', callbackURL);
console.log('---------------------------------');

if (!orderId) {
  console.error('ERROR: ORDER_ID is required.');
  process.exit(1);
}

if (!invoiceURL) {
  console.error('ERROR: INVOICE_URL is required.');
  process.exit(1);
}

async function run() {
  const startedAt = new Date().toISOString();
  const logs = ['Job started via GitHub Actions (Combined Process)'];
  
  let status = 'queued';
  let result = null;
  let error = null;

  try {
    status = 'processing';
    console.log('Executing DHL Combined Process Automation...');
    
    result = await combinedFlow({
      orderId,
      invoiceURL,
      packageType,
      incoterms,
      items,
      numberOfPackages: numberOfPackages ? Number(numberOfPackages) : null,
      onProgress: (msg) => {
        console.log(`[PROGRESS] ${msg}`);
        logs.push(msg);
      }
    });

    status = 'completed';
    logs.push('Job completed successfully');
    console.log('Automation completed successfully.');
  } catch (err) {
    status = 'failed';
    error = err.message || String(err);
    logs.push(`Job failed: ${error}`);
    console.error('Automation failed:', error);
  } finally {
    const completedAt = new Date().toISOString();
    const githubRunId = process.env.GITHUB_RUN_ID || 'local';

    // Convert PDF label to Base64 so Make.com receives the actual file
    let labelBase64 = null;
    if (result && result.labelFile && fs.existsSync(result.labelFile)) {
      try {
        console.log(`Reading PDF label for Base64 conversion: ${result.labelFile}`);
        labelBase64 = fs.readFileSync(result.labelFile).toString('base64');
      } catch (readErr) {
        console.error(`Failed to convert PDF to Base64: ${readErr.message}`);
      }
    }
    
    const payload = {
      jobId: `github-run-${githubRunId}`,
      type: 'combined',
      orderId: orderId,
      orderNumber: orderId,
      OrderIdentity: orderIdentity || null,
      orderIdentity: orderIdentity || null,
      status: status,
      trackingNumber: result ? result.trackingNumber : null,
      labelFile: result ? result.labelFile : null,
      labelBase64: labelBase64, // Send Base64 data to Make.com
      result: result,
      error: error,
      completedAt: completedAt,
      logs: logs
    };

    console.log(`Sending callback to webhook: ${callbackURL}...`);
    try {
      const response = await fetch(callbackURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log(`Callback sent. Status: ${response.status} ${response.statusText}`);
    } catch (webhookErr) {
      console.error(`Failed to send callback to webhook: ${webhookErr.message}`);
    }

    if (status === 'failed') {
      process.exit(1);
    }
  }
}

run();
