try {
  const { PDFParse } = require('pdf-parse');
  console.log('PDFParse import type:', typeof PDFParse);
  if (PDFParse) {
    const p = new PDFParse({ data: new Uint8Array() });
    console.log('PDFParse instance created successfully');
  }
} catch (e) {
  console.error('Error with named import:', e.message);
}

try {
  const pdf = require('pdf-parse');
  console.log('pdf-parse default import type:', typeof pdf);
} catch (e) {
  console.error('Error with default import:', e.message);
}
