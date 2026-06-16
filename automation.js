/**
 * CLI entry point — print label for a single order.
 * Usage: node automation.js [orderId]
 */
const { printLabel } = require('./lib/printLabel');

const orderId = process.argv[2] || process.env.DHL_ORDER_NUMBER || '100013726';

printLabel({
  orderId,
  onProgress: (msg) => console.log(msg)
})
  .then((result) => {
    console.log('RESULT:', JSON.stringify(result, null, 2));
    console.log('Tracking Number:', result.trackingNumber || 'Not found');
  })
  .catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
