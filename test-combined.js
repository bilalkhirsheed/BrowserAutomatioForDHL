require('dotenv').config();
const { combinedFlow } = require('./lib/combinedFlow');

combinedFlow({
  orderId: '100013720',
  invoiceURL: 'https://drive.google.com/file/d/1VxxXRve1nfM2ESBddfhH84iuP3j1ds2B/view?usp=sharing',
  packageType: 'Mini',
  incoterms: 'DAP',
  items: [
    {
      name: 'Power Supply',
      sku: 'TP-MTSE-102300',
      quantity: 1,
      price: 200,
      weight: 2
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
