import fs from "node:fs";
import { isWebMode } from "@/lib/web-auth";
import { assertWebLicenseActive } from "@/lib/web-license";

/** 桌面端生成前校验；只有授权服务暂时不可用且本机宽限期未过时才放行。 */
function denied(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 403 });
}

function offlineUntil(licenseId: string, licenseToken: string, deviceId: string): number {
  const file = process.env.LICENSE_RECORD_FILE?.trim();
  if (!file) throw denied("缺少本机授权记录，请重新激活");
  try {
    const record = JSON.parse(fs.readFileSync(file, "utf8"));
    if (record.licenseId !== licenseId || record.licenseToken !== licenseToken || record.deviceId !== deviceId) {
      throw denied("本机授权记录已失效，请重新激活");
    }
    const until = Date.parse(record.offlineUntil || "");
    if (!Number.isFinite(until)) throw denied("本机授权记录已失效，请重新激活");
    return until;
  } catch (error) {
    if (error instanceof Error && "status" in error) throw error;
    throw denied("本机授权记录已失效，请重新激活");
  }
}

export async function assertLicenseActive(userId?: string, bindingId?: string): Promise<void> {
  if (isWebMode()) {
    await assertWebLicenseActive(userId || "", bindingId);
    return;
  }
  if (process.env.DESKTOP_MODE !== "true") return;
  const serverUrl = process.env.LICENSE_SERVER_URL?.trim();
  const licenseId = process.env.LICENSE_ID?.trim();
  const licenseToken = process.env.LICENSE_TOKEN?.trim();
  const deviceId = process.env.LICENSE_DEVICE_ID?.trim();
  if (!serverUrl || !licenseId || !licenseToken || !deviceId) return;

  const graceUntil = offlineUntil(licenseId, licenseToken, deviceId);
  const allowTemporaryOutage = () => {
    if (graceUntil <= Date.now()) throw denied("离线使用期限已过，请联网校验授权");
  };
  let response: Response;
  try {
    response = await fetch(`${serverUrl.replace(/\/$/, "")}/v1/licenses/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseId, deviceId, licenseToken }),
      signal: AbortSignal.timeout(6_000),
    });
  } catch {
    allowTemporaryOutage();
    return;
  }
  if (response.ok) return;
  if (response.status !== 403) {
    allowTemporaryOutage();
    return;
  }
  const data = await response.json().catch(() => ({}));
  throw denied(data.error || "授权已失效，请联系授权管理员");
}
