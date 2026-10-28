import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLicenseCatalogCache,
  isLihuoTesterCode,
  lookupLicense,
  normalizeLicenseCode,
  readStoredLicenseFile,
  unknownLicenseMessage,
} from "../src/lib/license-catalog.ts";

test("LIHUO and TESTER codes are a valid shape, including dashed input", () => {
  assert.equal(normalizeLicenseCode(" lihuo-8888-8888 "), "LIHUO88888888");
  assert.equal(isLihuoTesterCode("LIHUO88888888"), true);
  assert.equal(isLihuoTesterCode("LIHUO-88888888"), true);
  assert.equal(isLihuoTesterCode("tester88888888"), true);
  assert.equal(isLihuoTesterCode("LIHUO479624"), true);
  assert.equal(isLihuoTesterCode("IDAI1-ABCD-EFGH"), false);

  for (const code of ["LIHUO88888888", "LIHUO-88888888", "TESTER88888888", "LIHUO000001"]) {
    assert.doesNotMatch(unknownLicenseMessage(code), /格式/);
  }
  assert.match(unknownLicenseMessage("IDAI1-ABCD"), /LIHUO/);
  assert.doesNotMatch(unknownLicenseMessage("LIHUO99999999"), /格式/);
});

test("built-in codes and issued file codes resolve from one catalog", () => {
  clearLicenseCatalogCache();
  assert.equal(lookupLicense("LIHUO88888888")?.code, "LIHUO88888888");
  assert.equal(lookupLicense("LIHUO-8888-8888")?.unlimited, false);
  assert.equal(lookupLicense("TESTER88888888")?.unlimited, true);
  assert.equal(lookupLicense("IDAI10001"), null);

  const issued = readStoredLicenseFile().find(
    (record) => record.code.startsWith("LIHUO") && record.code !== "LIHUO88888888" && record.code !== "LIHUO000001" && !record.disabled
  );
  assert.ok(issued, "expected issued LIHUO codes in the license file");
  assert.equal(lookupLicense(issued.code)?.code, issued.code);
  assert.doesNotMatch(unknownLicenseMessage(issued.code), /格式/);
});

test("environment variables extend the same catalog", () => {
  const previousCodes = process.env.LICENSE_CODES;
  const previousTester = process.env.TESTER_LICENSE_CODES;
  process.env.LICENSE_CODES = "LIHUO246810,CUSTOM-ENV-CODE";
  process.env.TESTER_LICENSE_CODES = "TESTER135791";
  clearLicenseCatalogCache();
  try {
    assert.equal(lookupLicense("LIHUO246810")?.unlimited, false);
    assert.equal(lookupLicense("CUSTOM-ENV-CODE")?.code, "CUSTOMENVCODE");
    assert.equal(lookupLicense("TESTER135791")?.unlimited, true);
    assert.equal(lookupLicense("LIHUO88888888")?.code, "LIHUO88888888");
  } finally {
    if (previousCodes === undefined) delete process.env.LICENSE_CODES;
    else process.env.LICENSE_CODES = previousCodes;
    if (previousTester === undefined) delete process.env.TESTER_LICENSE_CODES;
    else process.env.TESTER_LICENSE_CODES = previousTester;
    clearLicenseCatalogCache();
  }
});
