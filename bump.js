const fs = require('fs');
const p = 'package.json';
let c = fs.readFileSync(p, 'utf8');
c = c.replace('"version": "1.0.4"', '"version": "1.0.5"');
fs.writeFileSync(p, c, 'utf8');
JSON.parse(c);
console.log('version bumped to 1.0.5');
