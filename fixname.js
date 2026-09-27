const fs = require('fs');
const p = require('path').join(__dirname, 'apps/web/package.json');
let c = fs.readFileSync(p, 'utf8');
// Fix garbled Chinese - replace the mojibake with correct characters
c = c.replace(/"productName": "[^"]*"/, '"productName": "\u7483\u706b\u77e9\u521b-\u5de5\u4e1a\u8bbe\u8ba1AI"');
c = c.replace(/"shortcutName": "[^"]*"/, '"shortcutName": "\u7483\u706b\u77e9\u521b-\u5de5\u4e1a\u8bbe\u8ba1AI"');
fs.writeFileSync(p, c, 'utf8');
const j = JSON.parse(c);
console.log('productName:', j.build.productName);
console.log('shortcutName:', j.build.nsis.shortcutName);
