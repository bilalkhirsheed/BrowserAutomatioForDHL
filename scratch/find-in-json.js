const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'output', 'expanded-fields.json');
if (!fs.existsSync(filePath)) {
  console.error('expanded-fields.json does not exist!');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log('=== All fields and labels ===');
data.forEach((item, idx) => {
  // Let's print fields that might have label context or are dropdowns
  console.log(`[#${idx}] Tag: ${item.tagName} | ID: "${item.id}" | Placeholder: "${item.placeholder}" | Value: "${item.value}" | Class: "${item.class}" | LabelText: "${item.labelText}"`);
});
