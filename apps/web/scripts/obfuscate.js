/**
 * 代码混淆脚本
 * 混淆 Electron 主进程代码，增加逆向难度
 */
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const electronMainPath = path.join(__dirname, '..', 'electron', 'main.js');

console.log('🔒 开始混淆 Electron 主进程代码...');

// 读取原始代码
const originalCode = fs.readFileSync(electronMainPath, 'utf8');

// 混淆配置
const obfuscatedCode = JavaScriptObfuscator.obfuscate(originalCode, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: 2000,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 5,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['rc4'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
});

// 备份原始代码
fs.copyFileSync(electronMainPath, electronMainPath + '.bak');
console.log('✅ 已备份原始代码到 main.js.bak');

// 写入混淆后的代码
fs.writeFileSync(electronMainPath, obfuscatedCode.getObfuscatedCode());
console.log('✅ 混淆完成！');

// 恢复原始代码（打包后我们还要用原始代码开发）
setTimeout(() => {
  if (fs.existsSync(electronMainPath + '.bak')) {
    fs.copyFileSync(electronMainPath + '.bak', electronMainPath);
    fs.unlinkSync(electronMainPath + '.bak');
    console.log('✅ 已恢复原始代码');
  }
}, 5000);
