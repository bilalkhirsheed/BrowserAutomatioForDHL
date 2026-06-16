require('dotenv').config();

const { uploadInvoice } = require('./lib/uploadInvoice');
const { printLabel } = require('./lib/printLabel');
const { combinedFlow } = require('./lib/combinedFlow');

// Map workflow variables to environment variables
const orderId = process.env.ORDER_ID;
const flowType = process.env.FLOW_TYPE || 'combined'; // 'combined', 'ship', or 'invoice'
const invoiceURL = process.env.INVOICE_URL;
const packageType = process.env.PACKAGE_TYPE;
const insurance = process.env.INSURANCE;
const incoterms = process.env.INCOTERMS;
const callbackURL = process.env.CALLBACK_URL || 'https://hook.us2.make.com/e9htplj662l7d5p6ijdt2cisnk9lsvvd';

console.log('--- DHL GitHub Actions Runner ---');
console.log('Order ID:      ', orderId);
console.log('Flow Type:     ', flowType);
console.log('Invoice URL:   ', invoiceURL);
console.log('Package Type:  ', packageType);
console.log('Insurance:     ', insurance);
console.log('Incoterms:     ', incoterms);
console.log('Callback URL:  ', callbackURL);
console.log('---------------------------------');

if (!orderId) {
  console.error('ERROR: ORDER_ID is required.');
  process.exit(1);
}

if ((flowType === 'combined' || flowType === 'invoice') && !invoiceURL) {
  console.error(`ERROR: INVOICE_URL is required for flow type "${flowType}".`);
  process.exit(1);
}

async function run() {
  const startedAt = new Date().toISOString();
  const logs = ['Job started via GitHub Actions'];
  
  let runner;
  if (flowType === 'invoice') {
    runner = uploadInvoice;
  } else if (flowType === 'ship') {
    runner = printLabel;
  } else if (flowType === 'combined') {
    runner = combinedFlow;
  } else {
    console.error(`ERROR: Invalid flowType "${flowType}". Expected: invoice, ship, combined.`);
    process.exit(1);
  }

  let status = 'queued';
  let result = null;
  let error = null;

  try {
    status = 'processing';
    console.log(`Executing automation flow: ${flowType}...`);
    
    result = await runner({
      orderId,
      ...(flowType === 'invoice' || flowType === 'combined' ? {
        invoiceURL,
        packageType,
        insurance,
        incoterms
      } : {}),
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
    
    const payload = {
      jobId: `github-run-${githubRunId}`,
      type: flowType,
      orderId: orderId,
      orderNumber: orderId,
      status: status,
      trackingNumber: result ? result.trackingNumber : null,
      labelFile: result ? result.labelFile : null,
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
