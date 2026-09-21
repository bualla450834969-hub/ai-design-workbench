// 授权码管理 - 数据存储层
// 支持文件存储（本地/Electron）和 Redis（生产）

import * as fs from 'fs';
import * as path from 'path';

export interface LicenseCode {
  code: string;
  createdAt: number;
  unlimited: boolean;
  disabled: boolean;
  note?: string;
}

const MAX_DEVICES_PER_LICENSE = 3;

// 文件存储路径
const dataDir = path.join(process.cwd(), 'data');
const licensesFile = path.join(dataDir, 'licenses.json');

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// 读取所有授权码
export function getAllLicenses(): LicenseCode[] {
  // 直接返回默认授权码列表，不读写文件（兼容 Vercel Serverless）
  return [
    { code: 'LIHUO88888888', createdAt: Date.now(), unlimited: false, disabled: false, note: '管理员授权码' },
    { code: 'TESTER88888888', createdAt: Date.now(), unlimited: true, disabled: false, note: '测试员授权码（无限设备）' },
    { code: 'LIHUO479624', createdAt: Date.now(), unlimited: false, disabled: false, note: '' },
    { code: 'LIHUO244331', createdAt: Date.now(), unlimited: false, disabled: false, note: '' },
    { code: 'LIHUO696506', createdAt: Date.now(), unlimited: false, disabled: false, note: '' },
    { code: 'LIHUO954400', createdAt: Date.now(), unlimited: false, disabled: false, note: '' },
    { code: 'LIHUO844214', createdAt: Date.now(), unlimited: false, disabled: false, note: '' },
  ];
}
export function saveLicenses(licenses: LicenseCode[]): void {
  ensureDataDir();
  fs.writeFileSync(licensesFile, JSON.stringify(licenses, null, 2));
}

// 生成新授权码
export function generateLicenseCode(unlimited: boolean = false, note?: string): LicenseCode {
  // 生成 LIHUO + 6位随机数字
  const random = Math.floor(100000 + Math.random() * 900000);
  const code = `LIHUO${random}`;
  
  const license: LicenseCode = {
    code,
    createdAt: Date.now(),
    unlimited,
    disabled: false,
    note,
  };

  const licenses = getAllLicenses();
  licenses.push(license);
  saveLicenses(licenses);

  return license;
}

// 禁用/启用授权码
export function toggleLicenseDisabled(code: string): boolean {
  const licenses = getAllLicenses();
  const license = licenses.find(l => l.code === code);
  if (license) {
    license.disabled = !license.disabled;
    saveLicenses(licenses);
    return license.disabled;
  }
  return false;
}

// 删除授权码
export function deleteLicense(code: string): boolean {
  let licenses = getAllLicenses();
  const initialLength = licenses.length;
  licenses = licenses.filter(l => l.code !== code);
  if (licenses.length !== initialLength) {
    saveLicenses(licenses);
    return true;
  }
  return false;
}

// 检查授权码是否有效
export function isLicenseValid(code: string): boolean {
  const licenses = getAllLicenses();
  const license = licenses.find(l => l.code === code);
  return !!(license && !license.disabled);
}

// 检查授权码是否无限设备
export function isLicenseUnlimited(code: string): boolean {
  const licenses = getAllLicenses();
  const license = licenses.find(l => l.code === code);
  return license?.unlimited || false;
}

export { MAX_DEVICES_PER_LICENSE };
