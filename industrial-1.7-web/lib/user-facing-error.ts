/** Keep supplier and runtime diagnostics out of customer-facing error text. */
export function userFacingError(reason: unknown, fallback = "操作失败"): string {
  const raw = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
  const message = raw.trim();
  const source = message || fallback;
  const lower = source.toLowerCase();

  if (/项目不存在或无权访问|无权访问.*项目/.test(source))
    return "项目不存在或无权访问，请重新登录并刷新项目后重试。";
  if (/授权服务暂时不可用|授权不可用/.test(source))
    return "授权服务暂时不可用，请检查网络后重试；若持续发生，请联系授权管理员。";
  if (/最多使用\s*\d+\s*张图片|最多接收\s*\d+\s*张图片/.test(source))
    return `${source.replace(/[。；，\s]+$/, "")}，请减少选择的图片后重试。`;
  if (/余额|欠费|额度不足|insufficient[_ -]?(balance|credit|quota)|out of credits|payment required|402\b/.test(lower))
    return "模型账户余额或额度不足，请充值，或切换到可用模型后重试。";
  if (/(?:403\b|forbidden|无权调用|权限不足|没有权限)/.test(lower) && /模型|供应商|api.?key|密钥|provider/.test(lower))
    return "当前模型密钥没有调用权限，请检查账户权限，或切换可用模型后重试。";
  if (/api.?key|invalid.?key|unauthorized|authentication|鉴权|密钥无效|密钥过期|401\b/.test(lower))
    return "模型密钥无效或已过期，请到模型设置中检查并重新保存密钥。";
  if (/rate.?limit|too many requests|限流|429\b/.test(lower))
    return "模型服务请求过于频繁，请稍等片刻再重试。";
  if (/model.*(?:not found|unsupported|unavailable)|(?:unsupported|unknown).*model|模型.*(?:不支持|不可用|不存在)/.test(lower))
    return /[\u3400-\u9fff]/.test(source) && !/[A-Za-z]{4,}/.test(source)
      ? `${source.replace(/[。；，\s]+$/, "")}，请在模型设置中更换支持的模型后重试。`
      : "当前模型暂不支持这项操作，请在模型设置中更换支持的模型后重试。";
  if (/enospc|磁盘空间|存储空间不足|disk full/.test(lower))
    return "设备存储空间不足，请清理项目所在磁盘的空间后重试保存。";
  if (/eacces|eperm|permission denied|access denied|文件权限|目录权限/.test(lower))
    return "没有读写项目文件的权限，请检查保存目录权限后重试。";
  if (/timeout|timed out|etimedout|超时/.test(lower))
    return "请求等待超时，请先核对供应商任务和账单；若未生成结果，再检查网络后重试。";
  if (/aborterror|aborted|已取消|用户取消/.test(lower))
    return "操作已取消；如已提交生成任务，请先查看任务记录，确认状态后再操作。";
  if (/fetch failed|network.?error|econnreset|enotfound|网络连接|连接中断|dns/.test(lower))
    return "网络连接中断，请检查网络或代理设置，恢复连接后重试。";
  if (/safety|content.?filter|policy violation|内容审核|安全审核/.test(lower))
    return "内容未通过模型服务审核，请调整图片或描述后重试。";
  if (/invalid json|unexpected token|parse error|解析失败|格式异常/.test(lower))
    return "模型或本机服务返回的内容格式异常，请稍后重试；若持续发生，请联系支持。";
  if (/server error|service unavailable|bad gateway|internal error|服务繁忙|50[0-9]\b/.test(lower))
    return "服务暂时无法完成请求，请稍后重试；若已提交生成任务，请先查看任务记录和供应商账单。";
  if (/文件过大|payload too large|413\b/.test(lower))
    return "文件超过允许大小，请压缩图片或选择较小的文件后重试。";
  if (/项目不存在|图片不存在|素材不存在/.test(lower))
    return "所需项目或图片已不存在，请刷新项目并重新选择素材。";
  if (/not found|404\b/.test(lower))
    return "请求的内容暂时找不到，请刷新页面并重试；若持续发生，请联系支持。";

  // Existing Chinese validation messages are useful, provided they do not
  // contain unfiltered supplier text. Keep their specific instructions.
  if (/[\u3400-\u9fff]/.test(source) && !/(?:供应商返回|upstream|response body|traceback|error:|exception|stack trace)/i.test(source)) {
    const withoutTechnicalTail = source.replace(/(?:\s*\([^)]*[A-Za-z]{3,}[^)]*\))+/g, "").trim();
    if (!/[A-Za-z]{4,}/.test(withoutTechnicalTail.replace(/\b(?:API|PNG|JPEG|WebP|MP4|Windows|macOS|GeekAI|AIHubMix|RelayRouter|Oxygen|Kling|Veo|Gemini|GPT|JSON|HTTP)\b/gi, ""))) {
      return /请|稍后|重试|检查|确认|联系|重新|先.+再/.test(withoutTechnicalTail)
        ? withoutTechnicalTail
        : `${withoutTechnicalTail}，请检查相关设置后重试。`;
    }
  }
  const prefix = /[\u3400-\u9fff]/.test(fallback) ? fallback.replace(/[：:，。\s]+$/, "") : "操作失败";
  return `${prefix}，请检查网络和模型设置后重试；若持续发生，请联系支持。`;
}
