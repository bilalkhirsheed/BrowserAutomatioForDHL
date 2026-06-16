require('dotenv').config();
const { combinedFlow } = require('./lib/combinedFlow');

combinedFlow({
  orderId: '100013707',
  invoiceURL: 'https://pdf-temp-files.s3.us-west-2.amazonaws.com/53MUJH2LBU89Y3UK0SDT6U5LAEK7HCYY/htmltopdf.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA4NRRSZPHPZV7KQXY%2F20260616%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260616T150847Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=e2b0c4e5f15e1801f6315710331385f29c516d0f56fd5c4287557cc4b91c15d1',
  packageType: 'Midi Package',
  incoterms: 'DDP',
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
