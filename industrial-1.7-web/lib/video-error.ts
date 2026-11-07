import { userFacingError } from "@/lib/user-facing-error";
import { AIHUBMIX_VIDEO_ERROR_MESSAGES, APIYI_VIDEO_ERROR_MESSAGES } from "@/lib/video-failure-messages";

const knownSupplierError = /^(提交视频任务|查询视频进度|保存视频)失败：(GeekAI 视频|供应商视频)接口返回错误（状态码 (5\d\d)(?:；供应商请求编号 ([A-Za-z0-9][A-Za-z0-9._:-]{7,79}))?）。/;
const metadata = /^(?: 涉及参数：(视频音轨|产品首帧图片|清晰度|时长|画幅)。)?（状态码 ([45]\d\d)(?:；供应商请求编号 ([A-Za-z0-9][A-Za-z0-9._:-]{7,79}))?）/;
const knownMessages = [...new Set([...Object.values(AIHUBMIX_VIDEO_ERROR_MESSAGES), ...Object.values(APIYI_VIDEO_ERROR_MESSAGES)])];

/** Keep the vetted support reference on saved video jobs without exposing supplier text. */
export function videoJobErrorMessage(reason: string): string {
  // These bounded, application-owned messages distinguish saving a completed
  // video from submitting a new paid generation. Keep their recovery action.
  if (/^(?:下载视频|保存视频|查询视频进度)(?:超时|连接中断|未完成)，请检查网络或代理后重试。 (?:已暂停自动保存；点击重新保存获取已有结果，不会重新生成视频。|已暂停自动查询，可手动刷新原任务；不要重复提交。|稍后自动重试已有任务，不重新生成视频。)$/.test(reason)) return reason;
  const action = /^(提交视频任务|查询视频进度|保存视频)失败：/.exec(reason)?.[1];
  if (action) {
    for (const message of knownMessages) {
      const prefix = `${action}失败：${message}`;
      if (!reason.startsWith(prefix)) continue;
      // Rebuild only controlled copy and bounded metadata. Ignore any appended
      // supplier text, and keep the request reference even for HTTP 5xx errors.
      const parsed = metadata.exec(reason.slice(prefix.length));
      if (!parsed) return prefix;
      const [, parameter, status, rawId] = parsed;
      const requestId = rawId && !/sk[-_][A-Za-z0-9]/i.test(rawId) ? rawId : undefined;
      return `${prefix}${parameter ? ` 涉及参数：${parameter}。` : ""}（状态码 ${status}${requestId ? `；供应商请求编号 ${requestId}` : ""}）`;
    }
  }
  const match = knownSupplierError.exec(reason);
  if (!match || (match[4] && /sk[-_][A-Za-z0-9]/i.test(match[4]))) return userFacingError(reason, "视频生成失败");
  const [, failureAction, supplier, status, requestId] = match;
  const name = supplier.startsWith("GeekAI") ? "GeekAI" : "原供应商";
  const reference = requestId ? `；供应商请求编号 ${requestId}` : "";
  const advice = requestId
    ? `请先核对 ${name} 任务和账单；若没有任务记录，请将请求编号提供给 ${name} 支持排查，不要直接重复提交。`
    : `请先核对 ${name} 任务和账单；若没有任务记录，请联系 ${name} 支持并说明状态码，不要直接重复提交。`;
  return `${failureAction}失败：${supplier}接口返回错误（状态码 ${status}${reference}）。${advice}`;
}
