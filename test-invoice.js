require('dotenv').config();
const { uploadInvoice } = require('./lib/uploadInvoice');

uploadInvoice({
  orderId: '100013724',
  invoiceURL: 'https://drive.google.com/file/d/1XO5RNxD9o80c6o2WptLPrJ9-sgC4tM59/view?usp=sharing',
  packageType: 'Midi Package',
  insurance: '100.00',
  incoterms: 'DDP',
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
