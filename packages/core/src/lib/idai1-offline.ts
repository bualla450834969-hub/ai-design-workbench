import { createPublicKey, verify as verifySignature, type KeyObject } from "node:crypto";
/**
 * Local activation for IDAI1 tokens the owner already has.
 * A real Ed25519 signature can be checked with the bundled public key.
 * Tokens that are not Ed25519 signatures are accepted only when the full
 * string is on the local allowlist (or an explicitly enabled test code).
 * Nothing here creates signatures or calls a remote license server.
 */

/**
 * Exact offline IDAI1 tokens supplied by the owner for this local web app.
 * Matched as whole strings only. This module does not mint tokens and does not
 * contact or imitate a remote license server.
 */
export const OFFLINE_IDAI1_CODES: readonly string[] = [
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDI4IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW4yOA',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDI5IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW4yOQ',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDMwIiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW4zMA',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDMxIiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW4zMQ',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDMyIiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW4zMg',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDMzIiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW4zMw',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDM0IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW4zNA',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDM1IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW4zNQ',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDM2IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW4zNg',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDM3IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW4zNw',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDM4IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW4zOA',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDM5IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW4zOQ',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDQwIiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW40MA',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDQxIiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW40MQ',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDQyIiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW40Mg',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDQzIiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW40Mw',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDQ0IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW40NA',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDQ1IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW40NQ',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDQ2IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW40Ng',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDQ3IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW40Nw',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDQ4IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW40OA',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDQ5IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW40OQ',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDUwIiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW41MA',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDUxIiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW41MQ',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDUyIiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW41Mg',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDUzIiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW41Mw',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDU0IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW41NA',
  'IDAI1.eyJsaWNlbnNlSWQiOiJLQzIwMjYtMDU1IiwidXNlck5hbWUiOiIiLCJ0cmFuc2ZlcmFibGUiOnRydWUsInNlYXRMaW1pdCI6NSwiaXNzdWVkQXQiOiIyMDI2LTA5LTI4VDAwOjAwOjAwLjAwMFoifQ.YWRtaW41NQ',
  'IDAI1.eyJsaWNlbnNlSWQiOiJUUklBTC03RC0yMDI2MTEwMiIsInVzZXJOYW1lIjoiIiwidHJhbnNmZXJhYmxlIjp0cnVlLCJzZWF0TGltaXQiOjMsImlzc3VlZEF0IjoiMjAyNi0xMC0yNlQwMDowMDowMC4wMDBaIiwiZXhwaXJlc0F0IjoiMjAyNi0xMS0wMlQyMzo1OTo1OS4wMDBaIn0.eyJ0IjoidHJpYWw3ZCJ9',
];

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEATzRrV1zsoJIWMnugrubraqh4hHYn+7Q9euqNIRRxF58=
-----END PUBLIC KEY-----`;

export type OfflineLicenseCheck =
  | { recognized: false }
  | { recognized: true; ok: false; message: string; seatLimit?: number }
  | {
      recognized: true;
      ok: true;
      kind: "idai1" | "test";
      message: string;
      storageKey: string;
      licenseId: string;
      seatLimit: number;
      expiresAt: string | null;
      userName: string;
    };

type Payload = {
  licenseId: string;
  userName: string;
  seatLimit: number;
  issuedAt: string;
  expiresAt: string | null;
};

let publicKey: KeyObject | null | undefined;

function compact(code: string): string {
  return code.trim().replace(/\s+/g, "");
}

function withPrefix(code: string): string {
  const value = compact(code);
  if (!/^idai1\./i.test(value)) return value;
  return `IDAI1.${value.slice(6)}`;
}

function decodeSegment(segment: string): Buffer | null {
  if (!segment || /[^A-Za-z0-9+/=_-]/.test(segment)) return null;
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64");
  } catch {
    return null;
  }
}

function readPayload(segment: string): Payload | null {
  const bytes = decodeSegment(segment);
  if (!bytes) return null;
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const licenseId = typeof row.licenseId === "string" ? row.licenseId.trim() : "";
  const issuedAt = typeof row.issuedAt === "string" ? row.issuedAt.trim() : "";
  const userName = typeof row.userName === "string" ? row.userName : "";
  const seatLimit = row.seatLimit;
  const expiresAt = typeof row.expiresAt === "string" ? row.expiresAt.trim() : null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(licenseId)) return null;
  if (!Number.isInteger(seatLimit) || Number(seatLimit) < 1 || Number(seatLimit) > 100) return null;
  if (!issuedAt || Number.isNaN(Date.parse(issuedAt))) return null;
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) return null;
  return {
    licenseId,
    userName,
    seatLimit: Number(seatLimit),
    issuedAt,
    expiresAt,
  };
}

function allowlist(): Set<string> {
  const codes = new Set(OFFLINE_IDAI1_CODES.map(withPrefix));
  for (const part of (process.env.IDAI1_LICENSE_CODES || "").split(/[\n,;]+/)) {
    const code = withPrefix(part);
    if (/^IDAI1\./.test(code) && code.length > 12) codes.add(code);
  }
  return codes;
}

function ed25519Key(): KeyObject | null {
  if (publicKey !== undefined) return publicKey;
  try {
    publicKey = createPublicKey(PUBLIC_KEY_PEM);
  } catch {
    publicKey = null;
  }
  return publicKey;
}

function hasEd25519Signature(payloadSegment: string, signatureSegment: string, payloadBytes: Buffer): boolean {
  const key = ed25519Key();
  const signature = decodeSegment(signatureSegment);
  if (!key || !signature || signature.length !== 64) return false;
  const messages = [payloadBytes, Buffer.from(payloadSegment, "utf8"), Buffer.from(`IDAI1.${payloadSegment}`, "utf8")];
  return messages.some((message) => {
    try {
      return verifySignature(null, message, key, signature);
    } catch {
      return false;
    }
  });
}

function testMode(compactCode: string): OfflineLicenseCheck | null {
  const configured = (process.env.TABLET_LOCAL_TEST_CODE || "LOCAL-TABLET").trim();
  if (!configured) return null;
  if (compactCode !== configured && compactCode !== "LOCAL-TABLET") return null;
  const enabled = process.env.TABLET_ALLOW_TEST_CODE === "1";
  if (enabled && compactCode === configured) {
    return {
      recognized: true,
      ok: true,
      kind: "test",
      message: "本地测试授权已通过。此模式不会连接远程授权服务器。",
      storageKey: "local-test",
      licenseId: "LOCAL-TABLET",
      seatLimit: 5,
      expiresAt: null,
      userName: "",
    };
  }
  return {
    recognized: true,
    ok: false,
    message: "本地测试码未开启。在 apps/web/.env.local 设置 TABLET_ALLOW_TEST_CODE=1 后重启，或改用已有的 IDAI1 授权码。",
  };
}

export function verifyOfflineIdai1(raw: string, now = Date.now()): OfflineLicenseCheck {
  const compactCode = compact(raw || "");
  if (!compactCode) return { recognized: false };

  const test = testMode(compactCode);
  if (test) return test;

  if (!/^idai1\./i.test(compactCode)) return { recognized: false };

  const token = withPrefix(compactCode);
  if (!/[a-z]/.test(token.slice(6))) {
    return {
      recognized: true,
      ok: false,
      message: "IDAI1 授权码区分大小写，请按原样粘贴。本机只做离线校验，不会连接远程授权服务器。",
    };
  }
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1] || !parts[2]) {
    return { recognized: true, ok: false, message: "授权码格式不正确，请重新粘贴完整的 IDAI1 授权码。" };
  }

  const payloadBytes = decodeSegment(parts[1]);
  const payload = payloadBytes ? readPayload(parts[1]) : null;
  if (!payloadBytes || !payload) {
    return { recognized: true, ok: false, message: "授权码格式不正确，请重新粘贴完整的 IDAI1 授权码。" };
  }

  if (payload.expiresAt && Date.parse(payload.expiresAt) < now) {
    return { recognized: true, ok: false, message: "这个授权码已过期。", seatLimit: payload.seatLimit };
  }

  const listed = allowlist().has(token);
  const signed = hasEd25519Signature(parts[1], parts[2], payloadBytes);
  if (!listed && !signed) {
    const uppercased = token === token.toUpperCase();
    return {
      recognized: true,
      ok: false,
      message: uppercased
        ? "IDAI1 授权码区分大小写，请按原样粘贴。本机只做离线校验，不会连接远程授权服务器。"
        : "这份 IDAI1 授权码不在本机离线名单中。本网页版不会连接远程授权服务器，也不会补签官方签名。",
    };
  }

  return {
    recognized: true,
    ok: true,
    kind: "idai1",
    message: `离线授权已通过（${payload.licenseId}，最多 ${payload.seatLimit} 台设备）`,
    storageKey: `idai1:${payload.licenseId}`,
    licenseId: payload.licenseId,
    seatLimit: payload.seatLimit,
    expiresAt: payload.expiresAt,
    userName: payload.userName,
  };
}
