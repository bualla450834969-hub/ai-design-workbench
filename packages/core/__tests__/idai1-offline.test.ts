import assert from "node:assert/strict";
import test from "node:test";
import { OFFLINE_IDAI1_CODES, verifyOfflineIdai1 } from "../src/lib/idai1-offline.ts";
import { lookupLicense } from "../src/lib/license-catalog.ts";

const SAMPLE = OFFLINE_IDAI1_CODES.find((code) => code.includes("KC2026LTAyOC") || code.includes("S0MyMDI2LTAyOA")) || OFFLINE_IDAI1_CODES[0];
const TRIAL = OFFLINE_IDAI1_CODES.find((code) => code.includes("VFJJQUwtN0Q")) || OFFLINE_IDAI1_CODES.at(-1)!;

test("allowlisted IDAI1 codes activate offline", () => {
  const result = verifyOfflineIdai1(SAMPLE);
  assert.equal(result.recognized, true);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.kind, "idai1");
  assert.equal(result.licenseId, "KC2026-028");
  assert.equal(result.seatLimit, 5);
  assert.equal(result.expiresAt, null);
  assert.equal(lookupLicense(SAMPLE), null);
});

test("whitespace is ignored and payload case is preserved", () => {
  const spaced = `${SAMPLE.slice(0, 12)} \n${SAMPLE.slice(12)}`;
  const result = verifyOfflineIdai1(spaced);
  assert.equal(result.ok, true);
  const upper = verifyOfflineIdai1(SAMPLE.toUpperCase());
  assert.equal(upper.ok, false);
  if (!upper.ok && upper.recognized) assert.match(upper.message, /大小写/);
});

test("trial code honors expiresAt", () => {
  const before = verifyOfflineIdai1(TRIAL, Date.parse("2026-10-29T00:00:00.000Z"));
  assert.equal(before.ok, true);
  if (before.ok) {
    assert.equal(before.licenseId, "TRIAL-7D-20261102");
    assert.equal(before.seatLimit, 3);
  }
  const after = verifyOfflineIdai1(TRIAL, Date.parse("2026-11-03T00:00:00.000Z"));
  assert.equal(after.ok, false);
  if (!after.ok && after.recognized) assert.match(after.message, /过期/);
});

test("unknown IDAI1 tokens are rejected without a remote check", () => {
  const fake = "IDAI1.eyJsaWNlbnNlSWQiOiJOT1QtTUlORSIsInVzZXJOYW1lIjoiIiwidHJhbnNmZXJhYmxlIjp0cnVlLCJzZWF0TGltaXQiOjUsImlzc3VlZEF0IjoiMjAyNi0wOS0yOFQwMDowMDowMC4wMDBaIn0.AAAA";
  const result = verifyOfflineIdai1(fake);
  assert.equal(result.recognized, true);
  assert.equal(result.ok, false);
  if (!result.ok && result.recognized) assert.match(result.message, /离线名单|远程/);
});

test("LIHUO codes stay on the existing catalog path", () => {
  assert.equal(verifyOfflineIdai1("LIHUO88888888").recognized, false);
  assert.equal(verifyOfflineIdai1("").recognized, false);
});

test("documented test mode stays off unless enabled", () => {
  const previousAllow = process.env.TABLET_ALLOW_TEST_CODE;
  const previousCode = process.env.TABLET_LOCAL_TEST_CODE;
  delete process.env.TABLET_ALLOW_TEST_CODE;
  delete process.env.TABLET_LOCAL_TEST_CODE;
  try {
    const blocked = verifyOfflineIdai1("LOCAL-TABLET");
    assert.equal(blocked.ok, false);
    process.env.TABLET_ALLOW_TEST_CODE = "1";
    const allowed = verifyOfflineIdai1("LOCAL-TABLET");
    assert.equal(allowed.ok, true);
    if (allowed.ok) assert.equal(allowed.kind, "test");
  } finally {
    if (previousAllow === undefined) delete process.env.TABLET_ALLOW_TEST_CODE;
    else process.env.TABLET_ALLOW_TEST_CODE = previousAllow;
    if (previousCode === undefined) delete process.env.TABLET_LOCAL_TEST_CODE;
    else process.env.TABLET_LOCAL_TEST_CODE = previousCode;
  }
});
