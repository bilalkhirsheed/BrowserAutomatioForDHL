require('dotenv').config();
const { combinedFlow } = require('./lib/combinedFlow');

combinedFlow({
  orderId: '100013783',
  invoiceURL: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  packageType: 'Double Midi Box',
  incoterms: 'DAP', // DAP to verify unchecking the #DTP checkbox
  numberOfPackages: 2,
  skipPrint: true, // Only save, do not print!
  items: [
    {
      name: 'Power Supply',
      sku: 'TP-MTSE-102300',
      quantity: 1,
      price: 200,
      weight: 6
    }
  ],
  onProgress: (msg) => console.log('[progress]', msg)
})
  .then((r) => {
    console.log('SUCCESS:', JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
