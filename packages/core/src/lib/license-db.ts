import { Pool, type QueryResultRow } from "pg";

declare global {
  var __licensePool: Pool | undefined;
}

function getConnectionString() {
  return (process.env.LICENSE_DATABASE_URL || process.env.DATABASE_URL || "").trim();
}

function shouldUseSsl(connectionString: string) {
  if (!/^postgres(ql)?:\/\//i.test(connectionString)) return false;
  if (/localhost|127\.0\.0\.1/i.test(connectionString)) return false;
  if (/[?&]sslmode=disable/i.test(connectionString)) return false;
  return true;
}

export function isLicenseDatabaseConfigured() {
  return Boolean(getConnectionString());
}

export function getLicensePool() {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error("服务端未配置 LICENSE_DATABASE_URL。");
  }

  if (!globalThis.__licensePool) {
    globalThis.__licensePool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      query_timeout: 10_000,
      statement_timeout: 8_000,
      ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined
    });
  }

  return globalThis.__licensePool;
}

export async function queryLicenses<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  const result = await getLicensePool().query<T>(text, params);
  return result.rows;
}
