const fs = require('fs');

const BASE = '/mandruva-invest';
const file = 'dist/index.html';

let html = fs.readFileSync(file, 'utf8');

if (html.includes(`src="${BASE}/_expo/`)) {
  console.log(`Paths already correct natively (base: ${BASE})`);
} else {
  html = html
    .replace(/src="\/_expo\//g, `src="${BASE}/_expo/`)
    .replace(/href="\/favicon/g, `href="${BASE}/favicon`);
  fs.writeFileSync(file, html);
  console.log(`Paths corrected for GitHub Pages (base: ${BASE})`);
}
