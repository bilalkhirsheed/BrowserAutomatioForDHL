const fs = require('fs');
const { PDFParse } = require('pdf-parse');

/**
 * Parse DHL waybill formats like "WAYBILL 41 0788 1772" → "4107881772"
 */
function parseWaybillFromText(text, orderNumber) {
  if (!text) return null;

  const spaced = text.match(
    /(?:WAYBILL|Waybill|AWB|Tracking\s*#?|Shipment\s*#?)[\s:#-]*((?:\d{2,4}[\s-]*){2,5}\d{2,4})/i
  );
  if (spaced) {
    const digits = spaced[1].replace(/[\s-]/g, '');
    if (digits.length >= 10 && digits.length <= 14 && digits !== orderNumber) {
      return digits;
    }
  }

  const continuous = text.match(
    /(?:WAYBILL|Waybill|AWB|Tracking|Shipment)[^\d]{0,30}(\d{10,14})/i
  );
  if (continuous && continuous[1] !== orderNumber) {
    return continuous[1];
  }

  const digitGroups = text.match(/\b(\d{2}\s+\d{4}\s+\d{4})\b/);
  if (digitGroups) {
    const digits = digitGroups[1].replace(/\s+/g, '');
    if (digits.length >= 10 && digits !== orderNumber) return digits;
  }

  return null;
}

async function extractTextFromPdf(pdfPath) {
  const buffer = new Uint8Array(fs.readFileSync(pdfPath));
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text || '';
}

async function extractTrackingFromPdf(pdfPath, orderNumber) {
  const text = await extractTextFromPdf(pdfPath);
  return parseWaybillFromText(text, orderNumber);
}

function extractTrackingFromText(text, orderNumber) {
  return parseWaybillFromText(text, orderNumber);
}

module.exports = {
  parseWaybillFromText,
  extractTrackingFromPdf,
  extractTrackingFromText
};
