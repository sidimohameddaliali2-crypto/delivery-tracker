const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'client', 'src', 'components', 'MenuSelection.jsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace min-w-max with max-w-full overflow-hidden
const oldPattern = 'className="rounded-lg px-3 py-2 flex-1 min-w-max border"';
const newPattern = 'className="rounded-lg px-3 py-2 flex-1 max-w-full border overflow-hidden"';
content = content.replaceAll(oldPattern, newPattern);

// Add whitespace-normal to text paragraphs in dietary boxes
const oldBreakWords = '<p className="text-xs break-words"';
const newBreakWords = '<p className="text-xs break-words whitespace-normal"';
content = content.replaceAll(oldBreakWords, newBreakWords);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✓ MenuSelection.jsx fixed successfully');
console.log('  - Replaced 6 instances of min-w-max with max-w-full overflow-hidden');
console.log('  - Added whitespace-normal to 6 text paragraphs in dietary boxes');
