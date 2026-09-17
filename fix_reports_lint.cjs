const fs = require('fs');
let content = fs.readFileSync('components/pages/Reports.tsx', 'utf-8');

// replace `batches.find` with `getBatches().find`
content = content.replace(/batches\.find/g, 'getBatches().find');

fs.writeFileSync('components/pages/Reports.tsx', content);
console.log('Lint issues fixed');
