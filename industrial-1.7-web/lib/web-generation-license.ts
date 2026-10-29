import { assertWebLicenseActive } from "@/lib/web-license";

/** Queue records and server-authenticated sessions carry an opaque binding ID,
 * never an activation code or license token. Legacy records fail closed. */
export function requireWebLicenseBinding(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 200) {
    throw Object.assign(new Error("此任务缺少浏览器设备授权绑定，请重新激活后手动提交；不会自动调用模型。"), { status: 403 });
  }
  return value;
}

export async function assertWebGenerationLicense(userId: string, binding: unknown) {
  const bindingId = requireWebLicenseBinding(binding);
  await assertWebLicenseActive(userId, bindingId);
  return bindingId;
}
