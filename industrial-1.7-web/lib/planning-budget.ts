export function planningTokenBudget(count: unknown) {
  return Math.min(14_000, 1800 + Math.max(1, Math.min(100, Math.trunc(Number(count) || 1))) * 120);
}

export const COMPACT_PLANNING_RULE = "精简输出以尽快开始生图：基础功能/硬约束/可变项各最多4项，每项不超过40字；参考语言每项一个线索，服从参考强度；analysisSummary不超过100字。variantDirections必须与图片张数一致，每条只用30至60字描述两个具体、互不重复的设计变量，不重复品类、功能、安全、尺寸、视角等公共约束，不写长篇方案说明。每条路线在当前重构幅度和工作范围内成立，不靠换背景、相机或产品品类制造差异。";

export function transientPlanningError(error: unknown) {
  const value = error as { status?: unknown; name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (value?.status !== undefined) return false;
  return /TimeoutError|AbortError|timeout|timed out|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|UND_ERR_|socket|other side closed|network/i.test(`${value?.name || ""} ${value?.message || ""} ${value?.cause?.code || ""} ${value?.cause?.message || ""}`);
}

export function planningNetworkMessage(error: unknown, attempted = 1) {
  const value = error as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const raw = `${value?.name || ""} ${value?.message || ""} ${value?.cause?.code || ""} ${value?.cause?.message || ""}`;
  const reason = /timeout|timed out|超时/i.test(raw) ? "文字分析响应超时"
    : /ECONNRESET|UND_ERR_SOCKET|other side closed|fetch failed|socket|连接/i.test(raw) ? "文字分析连接被中断" : "文字分析暂时无法完成";
  return `${reason}${attempted > 1 ? "，已重新连接一次仍未完成" : ""}；本次尚未开始生图，请稍后重试。`;
}
