import { getWebLicensedUser, updateWebLicensedName } from "@/lib/web-license";
import { webError } from "@/lib/web-auth-common";
export { assertSameOrigin, isWebMode, rateLimit, requireWebMode, webDataDirectory, webError, writePrivateJson } from "@/lib/web-auth-common";
export function getWebAccountUser(userId: string) { return getWebLicensedUser(userId); }
export function assertWebAccountActive(userId: string) {
  const user = getWebLicensedUser(userId);
  if (!user) throw webError("授权已失效，请使用授权码重新激活", 403);
  return user;
}
export function updateWebAccountName(userId: string, name: string) { return updateWebLicensedName(userId, name); }
