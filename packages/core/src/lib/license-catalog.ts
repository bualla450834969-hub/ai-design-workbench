import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Single LIHUO / TESTER license catalog for the browser app and the desktop app.
 *
 * Built-in codes always work. More codes come from apps/web/data/licenses.json
 * and from environment variables. This is not the tablet (ID2 / IDAI) product.
 */
export type LicenseRecord = {
  code: string;
  unlimited: boolean;
  disabled: boolean;
  note?: string;
  createdAt?: number;
};

const BUILTIN_LICENSES: LicenseRecord[] = [
  {
    code: "LIHUO88888888",
    unlimited: false,
    disabled: false,
    note: "管理员授权码",
  },
  {
    code: "TESTER88888888",
    unlimited: true,
    disabled: false,
    note: "测试员授权码（无限设备）",
  },
  {
    code: "LIHUO000001",
    unlimited: false,
    disabled: false,
    note: "内置开发授权码",
  },
];

const ENV_KEYS = [
  "LICENSE_CODES_FILE",
  "LICENSE_CODES",
  "APP_ACCESS_CODE",
  "APP_ACCESS_CODES",
  "UNLIMITED_LICENSE_CODES",
  "TESTER_LICENSE_CODES",
] as const;

export function normalizeLicenseCode(code: string): string {
  return code.trim().replace(/[\s-]+/g, "").toUpperCase();
}

/**
 * LIHUO / TESTER codes are a valid shape with or without dashes or spaces.
 * LIHUO88888888 and LIHUO-88888888 are the same code.
 */
export function isLihuoTesterCode(code: string): boolean {
  const normalized = normalizeLicenseCode(code);
  return /^LIHUO\d{5,16}$/.test(normalized) || /^TESTER\d{5,16}$/.test(normalized);
}

export function unknownLicenseMessage(code: string): string {
  const normalized = normalizeLicenseCode(code);
  if (!normalized) return "请先填写授权码。";
  if (/^(IDAI|ID2)/.test(normalized)) {
    return "请使用 LIHUO 或 TESTER 授权码。";
  }
  return "授权码不正确或已停用。";
}

function splitEnv(name: string): string[] {
  return (process.env[name] || "")
    .split(/[\n,;，；]+/)
    .map((item) => normalizeLicenseCode(item))
    .filter(Boolean);
}

function catalogRoots(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    process.cwd(),
    path.resolve(here, "../../../.."),
    path.resolve(here, "../../.."),
  ];
}

export function licenseCatalogFileCandidates(): string[] {
  const fromEnv = (process.env.LICENSE_CODES_FILE || "").trim();
  const relative = [
    path.join("data", "licenses.json"),
    path.join("apps", "web", "data", "licenses.json"),
  ];
  const files = [
    fromEnv,
    ...catalogRoots().flatMap((root) => relative.map((rel) => path.join(root, rel))),
  ].filter(Boolean);
  return [...new Set(files)];
}

export function resolveLicenseCatalogFile(create = false): string | null {
  for (const file of licenseCatalogFileCandidates()) {
    if (fs.existsSync(file)) return file;
  }
  if (!create) return null;
  const fallback = path.join(process.cwd(), "data", "licenses.json");
  fs.mkdirSync(path.dirname(fallback), { recursive: true });
  return fallback;
}

function parseRecord(value: unknown): LicenseRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const code = normalizeLicenseCode(typeof row.code === "string" ? row.code : "");
  if (!code) return null;
  return {
    code,
    unlimited: Boolean(row.unlimited),
    disabled: Boolean(row.disabled),
    note: typeof row.note === "string" ? row.note : "",
    createdAt: typeof row.createdAt === "number" ? row.createdAt : undefined,
  };
}

export function readStoredLicenseFile(): LicenseRecord[] {
  const file = resolveLicenseCatalogFile(false);
  if (!file) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map(parseRecord).filter((row): row is LicenseRecord => Boolean(row));
  } catch {
    return [];
  }
}

export function writeStoredLicenseFile(records: LicenseRecord[]): void {
  const file = resolveLicenseCatalogFile(true);
  if (!file) return;
  const payload = records.map((record) => ({
    code: normalizeLicenseCode(record.code),
    createdAt: record.createdAt ?? Date.now(),
    unlimited: Boolean(record.unlimited),
    disabled: Boolean(record.disabled),
    note: record.note ?? "",
  }));
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  clearLicenseCatalogCache();
}

type CacheEntry = { stamp: string; records: LicenseRecord[] };
let cache: CacheEntry | null = null;

function fileStamp(): string {
  const file = resolveLicenseCatalogFile(false);
  if (!file) return "nofile";
  try {
    const stat = fs.statSync(file);
    return `${file}:${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "nostat";
  }
}

function envStamp(): string {
  return ENV_KEYS.map((key) => `${key}=${process.env[key] || ""}`).join("\n");
}

export function clearLicenseCatalogCache(): void {
  cache = null;
}

export function loadLicenseCatalog(): LicenseRecord[] {
  const stamp = `${fileStamp()}\n${envStamp()}`;
  if (cache?.stamp === stamp) return cache.records;

  const map = new Map<string, LicenseRecord>();
  for (const record of readStoredLicenseFile()) {
    map.set(record.code, record);
  }

  for (const code of splitEnv("LICENSE_CODES")) {
    const prev = map.get(code);
    map.set(code, {
      code,
      unlimited: prev?.unlimited ?? false,
      disabled: false,
      note: prev?.note || "LICENSE_CODES",
      createdAt: prev?.createdAt,
    });
  }

  for (const code of [...splitEnv("APP_ACCESS_CODE"), ...splitEnv("APP_ACCESS_CODES")]) {
    const prev = map.get(code);
    if (prev) {
      if (prev.disabled) map.set(code, { ...prev, disabled: false });
      continue;
    }
    map.set(code, { code, unlimited: false, disabled: false, note: "APP_ACCESS_CODE" });
  }

  for (const code of [...splitEnv("UNLIMITED_LICENSE_CODES"), ...splitEnv("TESTER_LICENSE_CODES")]) {
    const prev = map.get(code);
    map.set(code, {
      code,
      unlimited: true,
      disabled: false,
      note: prev?.note || "无限设备授权码",
      createdAt: prev?.createdAt,
    });
  }

  for (const builtin of BUILTIN_LICENSES) {
    const prev = map.get(builtin.code);
    map.set(builtin.code, {
      ...prev,
      ...builtin,
      disabled: false,
      createdAt: prev?.createdAt,
    });
  }

  const records = [...map.values()];
  cache = { stamp, records };
  return records;
}

export function lookupLicense(code: string): LicenseRecord | null {
  const normalized = normalizeLicenseCode(code);
  if (!normalized) return null;
  const record = loadLicenseCatalog().find((item) => item.code === normalized);
  if (!record || record.disabled) return null;
  return record;
}
