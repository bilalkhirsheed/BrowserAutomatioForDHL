const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const pdfPath = path.join(__dirname, '..', 'awb-label.pdf');

async function run() {
  try {
    console.log('Reading pdf from:', pdfPath);
    const buffer = new Uint8Array(fs.readFileSync(pdfPath));
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    console.log('PDF text successfully parsed! Length:', (result.text || '').length);
    console.log('Text snippet:', (result.text || '').substring(0, 100));
  } catch (e) {
    console.error('Error parsing real PDF:', e.message);
    console.error(e.stack);
  }
}

run();
