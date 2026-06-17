const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function main() {
  const pdfPath = path.resolve(__dirname, '..', 'output', 'awb-100013698.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF not found at: ${pdfPath}`);
    return;
  }

  console.log(`Parsing PDF: ${pdfPath}...`);
  const dataBuffer = new Uint8Array(fs.readFileSync(pdfPath));
  try {
    const parser = new PDFParse({ data: dataBuffer });
    const data = await parser.getText();
    console.log('=== PDF TEXT CONTENT ===');
    console.log(data);
    
    // Look for weights (e.g. 2.0 kg or 2 kg or weights like 0.001)
    const weightMatches = data.match(/\b\d+(\.\d+)?\s*(kg|lbs)\b/gi) || [];
    console.log('=== DETECTED WEIGHTS ===', weightMatches);
  } catch (err) {
    console.error('Failed to parse PDF:', err.stack || err.message);
  }
}

main();
