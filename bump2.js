const fs = require('fs');
const p = require('path').join(__dirname, 'apps/web/package.json');
let c = fs.readFileSync(p, 'utf8');
c = c.replace(/"version": "[^"]+"/, '"version": "1.0.5"');
fs.writeFileSync(p, c, 'utf8');
const v = JSON.parse(c).version;
console.log('apps/web version:', v);
