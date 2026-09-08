import crypto from "node:crypto";
import { getLicensePool, isLicenseDatabaseConfigured } from "../lib/license-db";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;
const TOKEN_REFRESH_GRACE_SECONDS = 60 * 60 * 24 * 365;
const DEVICE_NAME_MAX = 120;
const EMERGENCY_REVOKED_LICENSE_HASHES = new Set([
  "db52608cff344841d054b2a11e56a90f091f3c9382f7715c7fe911f84d267657"
]);

type LicenseRow = {
  id: string;
  code_hash: string;
  label: string | null;
  status: string;
  plan: string | null;
  max_devices: number;
  expires_at: Date | string | null;
};

type DeviceRow = {
  id: string;
  status: string;
};

type LicenseTokenPayload = {
  licenseId: string;
  codeHash: string;
  deviceHash: string;
  exp: number;
};

export type LicenseSession = {
  licenseId: string;
  token: string;
  expiresAt: number;
  maxDevices: number;
  activeDevices: number;
  message: string;
};

export class LicenseError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "LicenseError";
    this.status = status;
  }
}

function envString(name: string, fallback = "") {
  return (process.env[name] || fallback).trim();
}

function getTokenSecret() {
  return envString("LICENSE_TOKEN_SECRET", envString("NEXTAUTH_SECRET", envString("AUTH_SECRET", "dev-license-token-secret")));
}

function getHashSecret() {
  return envString("LICENSE_HASH_SECRET", envString("APP_ACCESS_CODE", "license-hash-secret"));
}

function configuredAccessCodes() {
  const legacyCode = envString("APP_ACCESS_CODE");
  const codeList = envString("APP_ACCESS_CODES")
    .split(/[\n,;，；]+/)
    .map((code) => code.trim())
    .filter(Boolean);

  return Array.from(new Set([legacyCode, ...codeList].filter(Boolean)));
}

function normalizeCode(code: string) {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

function hashValue(scope: string, value: string) {
  return crypto
    .createHash("sha256")
    .update(`${scope}:${getHashSecret()}:${value}`)
    .digest("hex");
}

function hashLicenseCode(code: string) {
  return hashValue("license-code", normalizeCode(code));
}

function rejectEmergencyRevokedLicense(codeHash: string) {
  if (EMERGENCY_REVOKED_LICENSE_HASHES.has(codeHash)) {
    throw new LicenseError("这个授权码已停用，请联系管理员。");
  }
}

function hashDeviceId(deviceId: string) {
  return hashValue("device-id", deviceId.trim());
}

function hashOptional(scope: string, value: string) {
  const normalized = value.trim();
  return normalized ? hashValue(scope, normalized) : null;
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload: LicenseTokenPayload) {
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", getTokenSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function parseAndVerifyToken(token: string, allowExpired = false): LicenseTokenPayload {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) throw new LicenseError("授权登录已过期，请重新填写授权码。");

  const expected = crypto.createHmac("sha256", getTokenSecret()).update(encodedPayload).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw new LicenseError("授权登录已失效，请重新填写授权码。");
  }

  let payload: LicenseTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as LicenseTokenPayload;
  } catch {
    throw new LicenseError("授权登录已失效，请重新填写授权码。");
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || (payload.exp < now && (!allowExpired || payload.exp < now - TOKEN_REFRESH_GRACE_SECONDS))) {
    throw new LicenseError("授权登录已过期，请重新填写授权码。");
  }

  return payload;
}

function createSessionToken(licenseId: string, codeHash: string, deviceHash: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  return {
    token: signPayload({ licenseId, codeHash, deviceHash, exp: expiresAt }),
    expiresAt
  };
}

function dateExpired(value: Date | string | null) {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getClientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    ""
  );
}

export function getLicenseRequestMeta(request: Request) {
  return {
    userAgent: request.headers.get("user-agent") || "",
    ip: getClientIp(request)
  };
}

async function activateLegacyLicense(code: string, deviceId: string): Promise<LicenseSession> {
  const accessCodes = configuredAccessCodes();
  if (!accessCodes.length) {
    throw new LicenseError("服务端未配置授权码或授权数据库。", 500);
  }

  const normalized = normalizeCode(code);
  const matched = accessCodes.some((item) => normalizeCode(item) === normalized);
  if (!matched) throw new LicenseError("授权码不正确或已停用。");

  const codeHash = hashLicenseCode(code);
  const deviceHash = hashDeviceId(deviceId);
  const { token, expiresAt } = createSessionToken("legacy", codeHash, deviceHash);
  return {
    licenseId: "legacy",
    token,
    expiresAt,
    maxDevices: 0,
    activeDevices: 1,
    message: "授权已验证。"
  };
}

export async function activateLicense({
  code,
  deviceId,
  deviceName,
  userAgent,
  ip
}: {
  code: string;
  deviceId: string;
  deviceName?: string;
  userAgent?: string;
  ip?: string;
}): Promise<LicenseSession> {
  if (!code.trim()) throw new LicenseError("请先填写授权码。");
  if (!deviceId.trim()) throw new LicenseError("当前设备标识缺失，请刷新页面后重试。");
  const codeHash = hashLicenseCode(code);
  rejectEmergencyRevokedLicense(codeHash);

  if (!isLicenseDatabaseConfigured()) {
    return activateLegacyLicense(code, deviceId);
  }

  const pool = getLicensePool();
  const client = await pool.connect();
  const deviceHash = hashDeviceId(deviceId);
  const safeDeviceName = (deviceName || "当前设备").trim().slice(0, DEVICE_NAME_MAX);
  const userAgentHash = hashOptional("user-agent", userAgent || "");
  const ipHash = hashOptional("ip", ip || "");

  try {
    await client.query("begin");

    const licenseResult = await client.query<LicenseRow>(
      `select id, code_hash, label, status, plan, max_devices, expires_at
       from licenses
       where code_hash = $1
       for update`,
      [codeHash]
    );
    const license = licenseResult.rows[0];
    if (!license) throw new LicenseError("授权码不正确或不存在。");
    if (license.status !== "active") throw new LicenseError("这个授权码已停用，请联系管理员。");
    if (dateExpired(license.expires_at)) throw new LicenseError("这个授权码已过期，请联系管理员。");

    const deviceResult = await client.query<DeviceRow>(
      `select id, status
       from license_devices
       where license_id = $1 and device_hash = $2
       limit 1`,
      [license.id, deviceHash]
    );
    const existingDevice = deviceResult.rows[0];
    if (existingDevice?.status === "revoked") {
      throw new LicenseError("这台设备的授权已被移除，请联系管理员。");
    }

    const activeCountResult = await client.query<{ count: string }>(
      `select count(*)::text as count
       from license_devices
       where license_id = $1 and status = 'active'`,
      [license.id]
    );
    const activeDevices = Number(activeCountResult.rows[0]?.count || 0);
    const maxDevices = Math.max(Number(license.max_devices || 1), 1);

    let deviceIdInDb = existingDevice?.id;
    let nextActiveDevices = activeDevices;
    if (!existingDevice) {
      if (activeDevices >= maxDevices) {
        throw new LicenseError(`这个授权码最多绑定 ${maxDevices} 台设备，当前已满。请联系管理员解绑旧设备。`);
      }

      const inserted = await client.query<{ id: string }>(
        `insert into license_devices
          (license_id, device_hash, device_name, user_agent_hash, ip_hash, status, first_seen_at, last_seen_at)
         values ($1, $2, $3, $4, $5, 'active', now(), now())
         returning id`,
        [license.id, deviceHash, safeDeviceName, userAgentHash, ipHash]
      );
      deviceIdInDb = inserted.rows[0]?.id;
      nextActiveDevices += 1;
    } else {
      await client.query(
        `update license_devices
         set device_name = $3, user_agent_hash = $4, ip_hash = $5, last_seen_at = now()
         where license_id = $1 and device_hash = $2`,
        [license.id, deviceHash, safeDeviceName, userAgentHash, ipHash]
      );
    }

    await client.query(
      `insert into license_events (license_id, device_id, event_type, message, ip_hash, user_agent_hash)
       values ($1, $2, 'activate', $3, $4, $5)`,
      [license.id, deviceIdInDb || null, existingDevice ? "设备重新验证授权。" : "新设备绑定授权。", ipHash, userAgentHash]
    );

    await client.query("commit");

    const { token, expiresAt } = createSessionToken(license.id, license.code_hash, deviceHash);
    return {
      licenseId: license.id,
      token,
      expiresAt,
      maxDevices,
      activeDevices: nextActiveDevices,
      message: existingDevice ? "授权已验证，当前设备可继续使用。" : `授权成功，已绑定当前设备（${nextActiveDevices}/${maxDevices}）。`
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof LicenseError) throw error;
    throw new LicenseError(error instanceof Error ? `授权数据库校验失败：${error.message}` : "授权数据库校验失败。", 500);
  } finally {
    client.release();
  }
}

async function verifyDatabaseToken(payload: LicenseTokenPayload, deviceId: string, renew = false): Promise<LicenseSession> {
  rejectEmergencyRevokedLicense(payload.codeHash);
  const deviceHash = hashDeviceId(deviceId);
  if (payload.deviceHash !== deviceHash) throw new LicenseError("授权设备不匹配，请重新填写授权码。");

  if (!isLicenseDatabaseConfigured()) {
    if (payload.licenseId !== "legacy") throw new LicenseError("授权数据库未配置，请重新填写授权码。", 500);
    const renewed = renew ? createSessionToken(payload.licenseId, payload.codeHash, deviceHash) : null;
    return {
      licenseId: "legacy",
      token: renewed?.token || signPayload(payload),
      expiresAt: renewed?.expiresAt || payload.exp,
      maxDevices: 0,
      activeDevices: 1,
      message: "授权已验证。"
    };
  }

  if (!isUuid(payload.licenseId)) {
    throw new LicenseError("授权模式已更新，请重新输入授权码完成设备绑定。");
  }

  const pool = getLicensePool();
  const result = await pool.query<LicenseRow & { active_devices: string }>(
    `select l.id, l.code_hash, l.label, l.status, l.plan, l.max_devices, l.expires_at,
            count(d.id)::text as active_devices
     from licenses l
     left join license_devices d on d.license_id = l.id and d.status = 'active'
     where l.id = $1
       and l.code_hash = $2
       and exists (
         select 1 from license_devices
         where license_id = l.id and device_hash = $3 and status = 'active'
       )
     group by l.id`,
    [payload.licenseId, payload.codeHash, deviceHash]
  );

  const license = result.rows[0];
  if (!license) throw new LicenseError("授权已失效，请重新填写授权码。");
  if (license.status !== "active") throw new LicenseError("这个授权码已停用，请联系管理员。");
  if (dateExpired(license.expires_at)) throw new LicenseError("这个授权码已过期，请联系管理员。");

  await pool.query(
    `update license_devices
     set last_seen_at = now()
     where license_id = $1 and device_hash = $2`,
    [license.id, deviceHash]
  );

  const renewed = renew ? createSessionToken(license.id, license.code_hash, deviceHash) : null;
  return {
    licenseId: license.id,
    token: renewed?.token || signPayload(payload),
    expiresAt: renewed?.expiresAt || payload.exp,
    maxDevices: Math.max(Number(license.max_devices || 1), 1),
    activeDevices: Number(license.active_devices || 1),
    message: "授权已验证。"
  };
}

export async function refreshLicenseSession(token: string, deviceId: string): Promise<LicenseSession> {
  if (!token.trim()) throw new LicenseError("没有可续期的授权会话，请填写授权码。");
  if (!deviceId.trim()) throw new LicenseError("当前设备标识缺失，请刷新页面后重试。");
  return verifyDatabaseToken(parseAndVerifyToken(token, true), deviceId, true);
}

export async function requireLicense(request: Request, bodyAccessCode?: string): Promise<LicenseSession> {
  const deviceId = (request.headers.get("x-device-id") || "").trim();
  const token = (request.headers.get("x-license-token") || "").trim();
  const headerAccessCode = (request.headers.get("x-access-code") || "").trim();
  const accessCode = (bodyAccessCode || headerAccessCode || "").trim();
  const { userAgent, ip } = getLicenseRequestMeta(request);

  if (token && deviceId) {
    try {
      return await verifyDatabaseToken(parseAndVerifyToken(token, true), deviceId);
    } catch (error) {
      if (!accessCode) throw error;
    }
  }

  if (accessCode) {
    return activateLicense({
      code: accessCode,
      deviceId,
      deviceName: "当前浏览器",
      userAgent,
      ip
    });
  }

  if (!deviceId) throw new LicenseError("当前设备标识缺失，请刷新页面后重试。");
  throw new LicenseError("请先填写授权码并完成设备绑定。");
}
