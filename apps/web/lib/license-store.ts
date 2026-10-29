// 授权码存储。有效码的唯一来源是 @workbench/core/license
// （内置 LIHUO / TESTER、data/licenses.json、环境变量）。

import {
  loadLicenseCatalog,
  lookupLicense,
  readStoredLicenseFile,
  writeStoredLicenseFile,
  type LicenseRecord,
} from "@workbench/core/license";

export interface LicenseCode {
  code: string;
  createdAt: number;
  unlimited: boolean;
  disabled: boolean;
  note?: string;
}

const MAX_DEVICES_PER_LICENSE = 3;

function toLicenseCode(record: LicenseRecord): LicenseCode {
  return {
    code: record.code,
    createdAt: record.createdAt ?? Date.now(),
    unlimited: record.unlimited,
    disabled: record.disabled,
    note: record.note,
  };
}

export function getAllLicenses(): LicenseCode[] {
  return loadLicenseCatalog().map(toLicenseCode);
}

export function saveLicenses(licenses: LicenseCode[]): void {
  writeStoredLicenseFile(licenses);
}

export function generateLicenseCode(unlimited: boolean = false, note?: string): LicenseCode {
  const random = Math.floor(100000 + Math.random() * 900000);
  const code = `LIHUO${random}`;

  const license: LicenseCode = {
    code,
    createdAt: Date.now(),
    unlimited,
    disabled: false,
    note,
  };

  const licenses = readStoredLicenseFile().map(toLicenseCode);
  licenses.push(license);
  writeStoredLicenseFile(licenses);

  return license;
}

export function toggleLicenseDisabled(code: string): boolean {
  const licenses = readStoredLicenseFile().map(toLicenseCode);
  const license = licenses.find((item) => item.code === code);
  if (!license) return false;
  license.disabled = !license.disabled;
  writeStoredLicenseFile(licenses);
  return license.disabled;
}

export function deleteLicense(code: string): boolean {
  const licenses = readStoredLicenseFile().map(toLicenseCode);
  const next = licenses.filter((item) => item.code !== code);
  if (next.length === licenses.length) return false;
  writeStoredLicenseFile(next);
  return true;
}

export function isLicenseValid(code: string): boolean {
  return Boolean(lookupLicense(code));
}

export function isLicenseUnlimited(code: string): boolean {
  return Boolean(lookupLicense(code)?.unlimited);
}

export { MAX_DEVICES_PER_LICENSE };
