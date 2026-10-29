import crypto from "node:crypto";
import { getAgent } from "@/lib/agents/catalog";
import { estimateGenerationCost } from "@/lib/model-pricing";
import { activeImageModel, generateImages, generateText } from "@/lib/providers/router";
import { activeProviderSettings } from "@/lib/providers/geekai";
import { BOARD_ITEM_OPTIONS, boardPrompt, normalizeNaturalBoardItemCount, type BoardItemCount } from "@/lib/generation-board";
import { stripGeneratedPromptBoilerplate } from "@/lib/product-identity";
import type { DesignPlan, ProviderContext } from "@/lib/providers/types";
import { prepareAssetContext } from "@/lib/services/asset-context";
import { assetRoleLabel, sortAssetsByRole } from "@/lib/services/asset-roles";
import { beginJob, endJob } from "@/lib/services/job-cancellation";
import { persistGeneratedImages } from "@/lib/services/result-assets";
import { annotationSourceId } from "@/lib/workspace-generation";
import { detectNaturalDesignIntent, DRAWING_STYLE_REFERENCE_CONSTRAINT, explicitFreeChatImageCount as explicitCount, isSurfaceEditingTask, multiViewBoardLabel, requestedCmfVariantCount, requestedMultiViewViews, requestedStandardViewCount, requestsSeparateViews, resolveMultiViewBoard, resolveFreeChatImageCount, resolveFreeChatResolution, separatelyRequestedCmfCount, separatelyRequestedDesignVariantCount, separatelyRequestedViewCount, standardMultiViewViews, SURFACE_ONLY_CONSTRAINT } from "@/lib/services/natural-intent";
export { resolveFreeChatImageCount, resolveFreeChatResolution } from "@/lib/services/natural-intent";
import { store } from "@/lib/store";
import { projectStorageLocation } from "@/lib/project-storage-copy";
import type { Asset, GenerationResult, Message } from "@/types/domain";

export type FreeChatPlan = {
  action: "answer" | "generate" | "edit" | "local-edit" | "multi-view" | "cmf" | "scene" | "detail";
  count: number;
  resolution: "1K" | "2K" | "4K";
  aspectRatio: "auto" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  instructions: string;
  preserve: string[];
  change: string[];
  views: string[];
  needsClarification: boolean;
  response: string;
  variantDirections: string[];
  boardItems: number;
};

const FREE_CHAT_PLANNER_SYSTEM = `你是工业设计自由对话任务路由器。只依据当前自由对话历史、本轮用户指令和本轮附件，不得使用项目名称、参数面板、重构滑杆或预设设计方向。
只返回严格 JSON：{"action":"answer|generate|edit|local-edit|multi-view|cmf|scene|detail","count":1,"resolution":"1K","aspectRatio":"auto","instructions":"","preserve":[],"change":[],"views":[],"needsClarification":false,"response":"","variantDirections":[],"boardItems":1}。
规则：
1. 分析、解释、建议、询问类用 answer，并在 response 中直接回答。
2. count 只表示最终输出图片张数。用户没有明确写出“N张图/图片/效果图/结果”时 count 必须为1，最多100。“N个方案/N种配色/六视图/八视图”都描述一张图里的内容，不等于图片张数；只有明确要求“每个角度或每种配色单独一张”时，才按对应数量输出。
3. “只把孔缩小、仅调整按钮”等是 local-edit；明确局部但位置有多个候选时 needsClarification=true，并用 response 提一个简短问题。
4. 不同角度、多角度、正侧背面用 multi-view，views 写清每一张视角。
5. 每张图必须有独立 variantDirections；同款多角度时差异只来自视角，不得改变产品身份。配色任务必须锁定产品角度、透视、轮廓、结构和部件位置，只改变颜色、材质、纹理、光泽和工艺分区。
6. 若用户说“N个/N款/N种方案”但没有说“N张图”，count=1，并把 boardItems 设为对应的固定方案板档位。boardItems 只允许1、4、9，分别对应单方案、2×2四宫格、3×3九宫格；不得返回3、6或其他数值。若用户明确要求不受支持的每图方案数，needsClarification=true，并请用户从1、4、9中选择，不得擅自改数量。若明确“N张图”或“每种方案单独一张”，count=N、boardItems=1。boardItems 不能误当成图片张数。
7. 必须忠实保留用户写明的数量、角度、局部位置、保留项和禁止项，不得擅自扩大改动范围。
8. 原图已有三/四/五/六/八视图时，“保留原视图、只改贴花/涂装/颜色/图案”是 cmf 表面编辑，不是 multi-view，也不是外观重设计。${SURFACE_ONLY_CONSTRAINT}
9. 只有用户要求新角度时才创建 multi-view。六视图和八视图分别是一张3×2和4×2整版，未指定分辨率时4K；明确每个角度单独一张时分别count=6或8，未指定分辨率时1K。六视图为正、后、左、右、顶、底，八视图追加左前45°、右前45°；不得输出重复拼版。
10. 附件中的“参考绘画风格”只用于画面表现，不当作产品造型参考。${DRAWING_STYLE_REFERENCE_CONSTRAINT}`;

const FREE_CHAT_ENHANCER_SYSTEM = `你是工业设计提示词编辑助手。结合用户当前草稿、当前附件摘要和自由对话上下文，把要求整理为一段清晰、简洁、可编辑的中文指令。必须保留数量、角度、指定局部、必须保留项、禁止项、分辨率和画幅；不得添加用户没有要求的产品、品牌、结构或参数。附件数量和编号只能以“当前附件”清单为准，不得臆造清单中不存在的附件；标注图及其生成所需的干净原图属于同一个用户附件。只补充当前目标产品实际具有且能够确认的必要结构，不罗列其他品类部件，不从风格参考猜测部件数量或结构。用户明确改变某项结构时按要求执行，只解除该项约束。不要复制内部模板、通用核对清单或无关产品示例；保持文案简洁。只返回严格 JSON：{"prompt":""}。不要自动执行任务。`;

function cleanList(value: unknown, max = 100) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, max) : [];
}

function jsonObject(text: string) {
  try { return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}"); }
  catch { return {}; }
}

function numericToken(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const map: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
  return map[value];
}

function rawRequestedDesignVariantCount(text: string) {
  const compact = text.replace(/\s+/g, "");
  const token = "(\\d{1,2}|十二|十一|[一二两三四五六七八九十])";
  const match = compact.match(new RegExp(`${token}(?:个|款|套|种)(?:差异化|不同|全新)?(?:外观|造型|设计)?方案`))
    || compact.match(new RegExp(`(?:生成|做|设计)${token}(?:个|款|套|种)(?:差异化|不同|全新)?(?:外观|造型|设计)(?:方案)?`))
    || compact.match(new RegExp(`(?:一张|每张)(?:图|图片)?(?:里|内|中)(?:生成|放|排|包含|展示|设计)?${token}(?:个|款|套|种)(?:方案|外观|造型|设计)?`));
  const count = match ? numericToken(match[1]) : undefined;
  return count ? Math.max(1, Math.min(12, count)) : undefined;
}

export function requestedDesignVariantCount(text: string): BoardItemCount | undefined {
  const count = rawRequestedDesignVariantCount(text);
  return BOARD_ITEM_OPTIONS.includes(count as BoardItemCount) ? count as BoardItemCount : undefined;
}

function requestedBoardItemCount(action: FreeChatPlan["action"], content: string) {
  if (separatelyRequestedDesignVariantCount(content) !== undefined || separatelyRequestedViewCount(content) !== undefined) return undefined;
  return action === "cmf"
    ? requestedCmfVariantCount(content) ?? rawRequestedDesignVariantCount(content)
    : rawRequestedDesignVariantCount(content);
}

function unsupportedBoardItemCount(action: FreeChatPlan["action"], content: string) {
  const count = requestedBoardItemCount(action, content);
  return count !== undefined && !BOARD_ITEM_OPTIONS.includes(count as BoardItemCount) ? count : undefined;
}

function naturalBoardItemCount(action: FreeChatPlan["action"], content: string, legacyBoardItems?: number, plannedBoardItems?: unknown) {
  if (action === "multi-view" || separatelyRequestedDesignVariantCount(content) !== undefined || separatelyRequestedViewCount(content) !== undefined) return 1;
  const explicit = requestedBoardItemCount(action, content);
  if (explicit !== undefined) return BOARD_ITEM_OPTIONS.includes(explicit as BoardItemCount) ? explicit as BoardItemCount : 1;
  return normalizeNaturalBoardItemCount(legacyBoardItems ?? plannedBoardItems ?? 1);
}

export function fallbackPlan(content: string, assets: Asset[], requestedResolution?: FreeChatPlan["resolution"], requestedAspectRatio?: FreeChatPlan["aspectRatio"], requestedBoardItems?: number): FreeChatPlan {
  const count = resolveFreeChatImageCount(content);
  const intent = detectNaturalDesignIntent(content);
  const multiView = intent === "multi-view";
  const cmf = isSurfaceEditingTask({ content, hasProductImage: assets.some((asset) => asset.type.startsWith("image/") && (asset.role === "structure" || asset.role === "result")) });
  const local = assets.some((asset) => asset.role === "annotation") || /(?:只|仅|不要动其他|其余不变|其他不变).{0,30}(?:改|调整|缩小|放大|加宽|变窄|降低|提高)|(?:孔|按钮|屏幕|把手|接口).{0,16}(?:缩小|放大|加宽|变窄|调整)/.test(content);
  const generate = assets.some((asset) => asset.type.startsWith("image/")) || /生成|生图|设计|改图|改款|渲染|效果图/.test(content);
  const answerOnly = /分析|解释|建议|评价|为什么|怎么样/.test(content) && !/生成|出图|改图|改成|换成|添加|贴上/.test(content);
  const action: FreeChatPlan["action"] = answerOnly ? "answer" : multiView ? "multi-view" : cmf ? "cmf" : local ? "local-edit" : generate ? (assets.length ? "edit" : "generate") : "answer";
  const unsupportedBoard = unsupportedBoardItemCount(action, content);
  const board = action === "multi-view" && resolveMultiViewBoard(content, count);
  const views = multiView ? (board ? [multiViewBoardLabel(content)] : requestedMultiViewViews(content, count).slice(0, count)) : [];
  return {
    action, count, resolution: resolveFreeChatResolution(content, requestedResolution, board),
    aspectRatio: requestedAspectRatio && requestedAspectRatio !== "auto" ? requestedAspectRatio : (content.match(/(?:1:1|4:3|3:4|16:9|9:16)/)?.[0] as FreeChatPlan["aspectRatio"]) || "auto",
    instructions: content, preserve: cmf ? [SURFACE_ONLY_CONSTRAINT] : local ? ["除用户指定局部外，其他结构、比例、CMF、视角和背景保持不变"] : [],
    change: [content], views, needsClarification: unsupportedBoard !== undefined,
    response: unsupportedBoard !== undefined ? `每图方案数目前支持1、4或9个。你要求的是${unsupportedBoard}个，请选择一个支持的数量。` : action === "answer" ? "请继续说明希望我分析或处理的设计问题。" : "",
    variantDirections: Array.from({ length: count }, (_, index) => multiView ? (views[index] || `环绕视角 ${Math.round(index * 360 / count)}°`) : cmf ? `表面方案 ${index + 1}：仅执行用户指定的表面变化，原几何、原角度与原版式完全保留` : `方案 ${index + 1}：在严格执行用户要求的前提下采用独立、可辨识的设计路线`),
    boardItems: naturalBoardItemCount(action, content, requestedBoardItems),
  };
}

function freeHistory(userId: string, projectId: string) {
  return store.listMessages(userId, projectId)
    .filter((message) => message.agentId === "free-chat" && (message.role === "user" || message.role === "assistant"))
    .slice(-12)
    .map((message) => `${message.role === "user" ? "用户" : "助手"}：${stripGeneratedPromptBoilerplate(message.content).replace(/\s+/g, " ").slice(0, 1200)}`)
    .join("\n");
}

export function logicalFreeChatAttachments(assets: Asset[]) {
  const hiddenSourceIds = new Set(assets
    .filter((asset) => asset.role === "annotation")
    .map(annotationSourceId)
    .filter((id): id is string => Boolean(id)));
  return assets.filter((asset) => !hiddenSourceIds.has(asset.id));
}

export function normalizeFreeChatSelectedAssetIds(selectedIds: string[]) {
  return [...new Set(selectedIds)];
}

export function freeChatProviderImageManifest(providerAssets: Asset[], logicalOrderAssets: Asset[] = providerAssets) {
  const logicalAssets = logicalFreeChatAttachments(logicalOrderAssets);
  const attachmentNumbers = new Map(logicalAssets.map((asset, index) => [asset.id, index + 1]));
  return providerAssets.filter((asset) => asset.type.startsWith("image/")).map((asset, index) => {
    const directNumber = attachmentNumbers.get(asset.id);
    const derivedNumbers = logicalAssets
      .filter((logical) => logical.role === "annotation" && annotationSourceId(logical) === asset.id)
      .map((logical) => attachmentNumbers.get(logical.id))
      .filter((value): value is number => value !== undefined);
    const numbers = [...new Set([...(directNumber ? [directNumber] : []), ...derivedNumbers])];
    const relation = asset.role === "annotation"
      ? `附件${directNumber ?? "?"}的标注图`
      : !directNumber && derivedNumbers.length
        ? `${derivedNumbers.map((number) => `附件${number}`).join("、")}的干净原图（辅助底图，不另计附件）`
        : numbers.length ? numbers.map((number) => `附件${number}`).join("、") : "后台辅助图片";
    return `模型图片${index + 1}：${relation}；${asset.name}；${assetRoleLabel(asset.role)}`;
  }).join("\n") || "本轮没有图片输入";
}

export function assetManifest(assets: Asset[]) {
  const logicalAssets = logicalFreeChatAttachments(assets);
  return logicalAssets.length ? logicalAssets.map((asset, index) => `附件${index + 1}：${asset.name}；${asset.type.startsWith("image/") ? assetRoleLabel(asset.role) : "用户资料"}${asset.role === "annotation" && annotationSourceId(asset) ? "；这是已标注的用户图片，干净原图仅作为同一附件的生成底图，不另行编号" : ""}${asset.tags?.length ? `；参考维度=[${asset.tags.join("，")}]` : ""}${asset.role === "style" && asset.tags?.includes("参考绘画风格") ? `；${DRAWING_STYLE_REFERENCE_CONSTRAINT}` : ""}`).join("\n") : "本轮没有附件";
}

export function selectFreeChatAssets(allAssets: Asset[], selectedIds: string[]) {
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
  const expanded: Asset[] = [];
  const includedIds = new Set<string>();
  const append = (asset?: Asset) => {
    if (!asset || includedIds.has(asset.id)) return;
    expanded.push(asset);
    includedIds.add(asset.id);
  };
  for (const id of [...new Set(selectedIds)]) {
    const asset = assetsById.get(id);
    if (!asset) continue;
    if (asset.role === "annotation") {
      const sourceId = annotationSourceId(asset);
      const source = sourceId ? assetsById.get(sourceId) : undefined;
      if (source?.type.startsWith("image/") && source.role !== "annotation" && source.role !== "mask") append(source);
    }
    append(asset);
  }
  return expanded;
}

export function selectFreeChatMessageAssets(jobAssets: Asset[], selectedIds: string[]) {
  const assetsById = new Map(jobAssets.map((asset) => [asset.id, asset]));
  return [...new Set(selectedIds)].flatMap((id) => {
    const asset = assetsById.get(id);
    return asset ? [asset] : [];
  });
}

export async function planFreeChat(input: { content: string; assets: Asset[]; history: string; context: ProviderContext; resolution?: FreeChatPlan["resolution"]; aspectRatio?: FreeChatPlan["aspectRatio"]; boardItems?: number; attachmentManifest?: string; providerImageManifest?: string }) {
  input = { ...input, content: stripGeneratedPromptBoilerplate(input.content), history: stripGeneratedPromptBoilerplate(input.history) };
  let output;
  try {
    output = await generateText({
      ...input.context,
      systemPrompt: FREE_CHAT_PLANNER_SYSTEM,
      userPrompt: `自由对话历史：\n${input.history || "这是第一轮"}\n\n本轮附件：\n${input.attachmentManifest || assetManifest(input.assets)}\n\n模型实际收到的图片与附件对应关系（只用于识别，不得改写附件编号）：\n${input.providerImageManifest || freeChatProviderImageManifest(input.assets)}\n\n本轮用户指令：\n${input.content}`,
      settings: { task: "free-chat-routing" },
    });
  } catch { return { plan: fallbackPlan(input.content, input.assets, input.resolution, input.aspectRatio, input.boardItems), textModel: "rule-based" }; }
  const parsed = jsonObject(output.text) as Record<string, unknown>;
  const allowedActions = new Set(["answer", "generate", "edit", "local-edit", "multi-view", "cmf", "scene", "detail"]);
  const fallback = fallbackPlan(input.content, input.assets, input.resolution, input.aspectRatio, input.boardItems);
  const explicitlyAnswerOnly = /分析|解释|建议|评价|为什么|怎么样/.test(input.content) && !/生成|出图|生图|改图|改成|换成|添加|贴上/.test(input.content);
  const hasProductImage = input.assets.some((asset) => asset.type.startsWith("image/") && (asset.role === "structure" || asset.role === "result"));
  const surfaceOnly = isSurfaceEditingTask({ content: input.content, hasProductImage }) && fallback.action !== "answer";
  const action = explicitlyAnswerOnly ? "answer" : surfaceOnly ? "cmf" : fallback.action === "multi-view" ? "multi-view" : input.assets.some((asset) => asset.role === "annotation")
    ? "local-edit"
    : parsed.action === "cmf" && !hasProductImage ? fallback.action : allowedActions.has(String(parsed.action)) ? String(parsed.action) as FreeChatPlan["action"] : fallback.action;
  const requestedCount = explicitCount(input.content);
  const separateViewCount = separatelyRequestedViewCount(input.content);
  const separateCmfCount = separatelyRequestedCmfCount(input.content);
  const separateDesignCount = separatelyRequestedDesignVariantCount(input.content);
  const count = Math.max(1, Math.min(100, Math.trunc(requestedCount ?? separateViewCount ?? separateCmfCount ?? separateDesignCount ?? 1)));
  const multiViewBoard = action === "multi-view" && resolveMultiViewBoard(input.content, count);
  const views = multiViewBoard ? [multiViewBoardLabel(input.content)] : (count === 6 || count === 8) && requestsSeparateViews(input.content) ? standardMultiViewViews(input.content, count) : cleanList(parsed.views, count);
  const suppliedDirections = cleanList(parsed.variantDirections, count);
  const unsupportedBoard = unsupportedBoardItemCount(action, input.content);
  const plan: FreeChatPlan = {
    action,
    count,
    resolution: resolveFreeChatResolution(input.content, input.resolution, multiViewBoard),
    aspectRatio: input.aspectRatio && input.aspectRatio !== "auto" ? input.aspectRatio : surfaceOnly || fallback.aspectRatio !== "auto" ? fallback.aspectRatio : ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"].includes(String(parsed.aspectRatio)) ? String(parsed.aspectRatio) as FreeChatPlan["aspectRatio"] : "auto",
    instructions: surfaceOnly ? input.content : String(parsed.instructions || input.content).trim(),
    preserve: [...cleanList(parsed.preserve), ...(surfaceOnly ? [SURFACE_ONLY_CONSTRAINT] : [])], change: surfaceOnly ? [input.content] : cleanList(parsed.change), views: surfaceOnly ? [] : views,
    needsClarification: unsupportedBoard !== undefined || parsed.needsClarification === true,
    response: unsupportedBoard !== undefined ? `每图方案数目前支持1、4或9个。你要求的是${unsupportedBoard}个，请选择一个支持的数量。` : String(parsed.response || "").trim(),
    variantDirections: Array.from({ length: count }, (_, index) => surfaceOnly ? fallback.variantDirections[index] : action === "multi-view" ? views[index] || fallback.views[index] || `环绕视角 ${Math.round(index * 360 / count)}°` : suppliedDirections[index] || `方案 ${index + 1}：独立设计路线`),
    boardItems: naturalBoardItemCount(action, input.content, input.boardItems, parsed.boardItems),
  };
  return { plan, textModel: output.model };
}

export async function enhanceFreeChatPrompt(input: { userId: string; projectId: string; content: string; assets: Asset[] }) {
  input = { ...input, content: stripGeneratedPromptBoilerplate(input.content) };
  const ordered = sortAssetsByRole(input.assets);
  const prepared = await prepareAssetContext(ordered);
  const output = await generateText({
    agentId: "free-chat",
    systemPrompt: FREE_CHAT_ENHANCER_SYSTEM,
    userPrompt: `自由对话历史：\n${freeHistory(input.userId, input.projectId) || "这是第一轮"}\n\n当前附件（以下编号是唯一有效编号）：\n${assetManifest(input.assets)}\n\n模型实际收到的图片与附件对应关系（只用于识别，不得写入整理结果）：\n${freeChatProviderImageManifest(ordered, input.assets)}\n${prepared.documentContext ? `\n资料摘录：\n${prepared.documentContext.slice(0, 6000)}` : ""}\n\n当前草稿：\n${input.content || "请根据附件整理一条可执行的工业设计要求"}`,
    assets: prepared.providerAssets,
    settings: { task: "free-chat-prompt-enhancement" },
  });
  const prompt = stripGeneratedPromptBoilerplate(String((jsonObject(output.text) as Record<string, unknown>).prompt || ""));
  if (!prompt) throw new Error("AI 没有返回可用的整理结果，请重试");
  return { prompt, provider: output.provider, model: output.model };
}

export async function runFreeChatJob(input: { userId: string; projectId: string; content: string; assets: Asset[]; selectedAssetIds: string[]; idempotencyKey: string; jobId?: string; resolution?: FreeChatPlan["resolution"]; aspectRatio?: FreeChatPlan["aspectRatio"]; boardItems?: number; showDimensions?: boolean }) {
  input = { ...input, content: stripGeneratedPromptBoilerplate(input.content) };
  const logicalOrderAssets = input.assets;
  const attachmentManifest = assetManifest(logicalOrderAssets);
  const providerAssets = sortAssetsByRole(logicalOrderAssets);
  const providerImageManifest = freeChatProviderImageManifest(providerAssets, logicalOrderAssets);
  input = { ...input, assets: providerAssets, selectedAssetIds: normalizeFreeChatSelectedAssetIds(input.selectedAssetIds) };
  const { job, created } = store.createJob({ userId: input.userId, projectId: input.projectId, agentId: "free-chat", prompt: input.content, assets: input.assets, selectedAssetIds: input.selectedAssetIds, idempotencyKey: input.idempotencyKey, jobId: input.jobId });
  if (!created && (!input.jobId || job.id !== input.jobId)) return { job, created };
  const history = freeHistory(input.userId, input.projectId);
  const now = new Date().toISOString();
  store.addMessage(input.userId, { id: crypto.randomUUID(), jobId: job.id, projectId: input.projectId, role: "user", content: input.content, agentId: "free-chat", assets: selectFreeChatMessageAssets(input.assets, input.selectedAssetIds), createdAt: now });
  store.updateJob(job.id, { status: "running", progress: 7, stage: "analyzing", stageLabel: "正在理解自然语言和附件" });
  const cancelSignal = beginJob(job.id);
  try {
    const prepared = await prepareAssetContext(input.assets);
    const baseContext: ProviderContext = { agentId: "free-chat", systemPrompt: getAgent("free-chat").systemPrompt, userPrompt: input.content, assets: prepared.providerAssets, signal: cancelSignal };
    const { plan, textModel } = await planFreeChat({ content: input.content, assets: input.assets, history, context: baseContext, resolution: input.resolution, aspectRatio: input.aspectRatio, boardItems: input.boardItems, attachmentManifest, providerImageManifest });
    if (plan.needsClarification || plan.action === "answer") {
      const content = plan.response || "请补充一下希望修改的具体位置或最终交付形式。";
      const message: Message = { id: crypto.randomUUID(), jobId: job.id, projectId: input.projectId, role: "assistant", content, agentId: "free-chat", createdAt: new Date().toISOString() };
      store.addMessage(input.userId, message);
      store.updateJob(job.id, { status: "succeeded", progress: 100, stage: "completed", stageLabel: "已完成", completedOutputs: 0, totalOutputs: 0 });
      return { job: store.getJob(input.userId, job.id), message, created };
    }
    const timeoutMs = Math.min(90 * 60_000, Math.max(10 * 60_000, 4 * 60_000 + Math.ceil(plan.count / 4) * 4 * 60_000));
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = AbortSignal.any([cancelSignal, timeoutSignal]);
    let completed = 0;
    const designPlan: DesignPlan = {
      productCategory: "由本轮附件和指令确定", coreFunctions: [], mandatoryConstraints: plan.preserve,
      mutableFeatures: plan.change, styleFingerprint: [], negativeStyleConstraints: [], analysisSummary: plan.instructions,
      variantDirections: plan.variantDirections,
    };
    const prompt = [
      "你正在执行独立的 AI 自由对话任务。唯一依据是本自由对话历史、本轮附件和本轮指令；不得引用参数设计模块、项目名称、重构滑杆或预设模板。",
      `本轮动作：${plan.action}`,
      `本轮附件与参考维度：\n${attachmentManifest}`,
      `模型实际收到的图片与用户附件对应关系：\n${providerImageManifest}`,
      `用户原始指令：${input.content}`,
      `整理后的执行要求：${plan.instructions}`,
      plan.preserve.length ? `必须保持：${plan.preserve.join("；")}` : "",
      plan.change.length ? `只允许或重点改变：${plan.change.join("；")}` : "",
      plan.views.length ? `指定视角：${plan.views.join("；")}` : "",
      prepared.documentContext ? `用户资料摘录（只作事实参考）：\n${prepared.documentContext.slice(0, 8000)}` : "",
      history ? `自由对话上下文：\n${history}` : "",
      plan.action === "multi-view" && plan.count === 1 && plan.views.some((view) => /整版/.test(view))
        ? `本轮只生成${multiViewBoardLabel(input.content)}，${requestedStandardViewCount(input.content)}个角度在同一张图片内。`
        : plan.boardItems > 1 && plan.action === "cmf"
          ? `本批共 ${plan.count} 张图片，每张都是独立的配色方案板。${boardPrompt(plan.boardItems, "cmf")}所有网格必须使用完全一致的观察角度、透视、姿态、轮廓、比例、结构与部件位置，只改变颜色、材质、纹理、光泽和工艺分区。方案板数量不改变图片输出张数。`
          : plan.boardItems > 1 && plan.action === "local-edit"
            ? `本批共 ${plan.count} 张图片，每张都是独立的局部改款方案板。${boardPrompt(plan.boardItems, "local")}每格都以同一张干净原图为基准，只改变标注或文字指定的局部，未指定区域、构图、视角、背景和产品身份必须保持一致，最终不得保留任何标记。方案板数量不改变图片输出张数。`
            : plan.boardItems > 1 && plan.action === "scene"
              ? `本批共 ${plan.count} 张图片，每张都是独立的场景方案板。${boardPrompt(plan.boardItems, "scene")}产品本体在全部网格中必须完全一致，只允许场景、环境、光线和交互方式形成清晰差异。方案板数量不改变图片输出张数。`
              : plan.boardItems > 1
                ? `本批共 ${plan.count} 张图片，每张都是独立的外观方案板。${boardPrompt(plan.boardItems, "variants")}同一张图内各方案保持相同观察角度和产品类别，但轮廓比例、主次体块、分件和特征面必须明显不同；不得用换色、换材质或换镜头冒充新方案。方案板数量不改变图片输出张数。`
                : plan.action === "cmf"
        ? `${SURFACE_ONLY_CONSTRAINT} 本轮每张结果都保留原图完整画幅与已有视图板，不能用“只一个产品”模板删除原图内的多个视图。`
        : plan.action === "local-edit"
        ? `${input.assets.some((asset) => asset.role === "annotation") ? "本轮提供干净产品原图与对应标注图，标记只用于定位，不是蒙版或产品结构。" : "本轮未提供标注图，必须根据用户文字定位修改部位，不得假装存在标记。"}干净原图是产品身份、未修改区域、构图、视角、比例、CMF 与背景的严格基准；只重新设计文字或标注明确指向的局部。直接生成完整产品成品图，使修改部位与相邻表面自然连续；不输出裁切、贴片、拼接或任何标记。`
        : `本批共 ${plan.count} 张。每张只显示一个完整结果；各张严格执行其独立路线。`,
    ].filter(Boolean).join("\n\n");
    const imageContext: ProviderContext = {
      ...baseContext, signal, userPrompt: prompt, designPlan,
      settings: { outputCount: plan.count, boardItems: plan.boardItems, resolution: plan.resolution, aspectRatio: plan.aspectRatio, generationMode: "free-chat", userRequirements: input.content, surfaceOnly: plan.action === "cmf", freeChatAction: plan.action, freeChatViews: plan.views.join("|"), freeChatViewCount: requestedStandardViewCount(input.content, plan.count), freeChatMultiViewBoard: plan.action === "multi-view" && plan.count === 1 && plan.views.some((view) => /整版/.test(view)), ...(input.showDimensions !== undefined ? { showDimensions: input.showDimensions } : {}), freeChatBoardItems: plan.boardItems, freeChatBoardKind: plan.action === "cmf" ? "cmf" : plan.boardItems > 1 ? "variants" : "single" },
      onProgress: (event) => {
        completed = event.completed ?? completed;
        store.updateJob(job.id, { progress: Math.min(88, 24 + Math.round(62 * completed / Math.max(1, plan.count))), stage: event.stage, stageLabel: event.label, completedOutputs: completed, totalOutputs: plan.count });
      },
    };
    store.updateJob(job.id, { progress: 22, stage: "planning", stageLabel: `已理解任务，准备生成 ${plan.count} 张${plan.boardItems > 1 ? `（每张 ${plan.boardItems} 个方案）` : ""}`, totalOutputs: plan.count });
    const image = await generateImages(imageContext, plan.count);
    if (!image.imageUrls.length) throw new Error("图片模型没有返回可用结果");
    store.updateJob(job.id, { progress: 91, stage: "saving", stageLabel: "正在逐张保存结果" });
    const persisted = await persistGeneratedImages({
      userId: input.userId, projectId: input.projectId, jobId: job.id, imageUrls: image.imageUrls, resolution: plan.resolution,
      ...(["cmf", "edit", "generate"].includes(plan.action) && input.assets.find((asset) => asset.role === "structure" || asset.role === "result")
        ? { noveltyReference: input.assets.find((asset) => asset.role === "structure" || asset.role === "result")! } : {}),
      ...(plan.action === "multi-view" && image.variants?.length ? { labels: image.variants.map((variant) => variant.designRoute) } : {}),
    });
    const completedAt = new Date().toISOString();
    const billing = estimateGenerationCost({ textModel, imageModel: image.model || activeImageModel(), count: image.imageUrls.length, includeText: true, providerType: activeProviderSettings().type });
    const notes = [];
    if (image.imageUrls.length < plan.count) notes.push(`本次完成 ${image.imageUrls.length}/${plan.count} 张，另 ${plan.count - image.imageUrls.length} 张未成功${image.failureSummary ? `（${image.failureSummary}）` : ""}；如需补齐请另发起生成，可能产生新费用`);
    if (persisted.errors.length) notes.push(`${persisted.errors.length} 张${process.env.WEB_MODE === "true" ? "服务器" : "本地"}保存失败，供应商原始结果仍可查看`);
    if (persisted.unchangedCount) notes.push(`${persisted.unchangedCount} 张与上传原图高度相似，已标记供检查；不会自动再次扣费生图`);
    const result: GenerationResult = {
      requestSnapshot: { endpoint: "/api/free-chat", content: input.content, assetIds: input.selectedAssetIds, resolution: input.resolution, aspectRatio: input.aspectRatio, boardItems: normalizeNaturalBoardItemCount(plan.boardItems), showDimensions: input.showDimensions },
      jobId: job.id, status: "succeeded", imageUrls: persisted.imageUrls, imageAssets: persisted.assets,
      provider: image.provider, model: image.model, prompt: image.revisedPrompt || prompt, note: notes.length ? notes.join("；") : undefined,
      direction: `自由对话 · ${plan.action}`, requestedCount: plan.count, deliveredCount: image.imageUrls.length, savedCount: persisted.savedCount,
      startedAt: job.createdAt, completedAt, durationMs: Date.parse(completedAt) - Date.parse(job.createdAt),
      billingEstimate: { textModel, imageModel: image.model, textCost: billing.text, imageUnitCost: billing.imageUnit, baseImageUnitCost: billing.baseImageUnit, textAnalysisCalls: 1, imageCost: billing.image, totalCost: billing.total, currency: "CNY" },
      settingsSnapshot: { reconstructionRatio: 0, direction: "自由对话", resolution: plan.resolution, aspectRatio: plan.aspectRatio, outputCount: plan.count, boardItems: normalizeNaturalBoardItemCount(plan.boardItems), showDimensions: input.showDimensions, generationMode: input.assets.some((asset) => asset.type.startsWith("image/")) ? "source" : "text", sourceAssetIds: input.assets.filter((asset) => asset.type.startsWith("image/")).map((asset) => asset.id), referenceAssetIds: [] },
      designAnalysis: plan.instructions,
      variants: image.variants?.map((variant, index) => ({ index, assetId: persisted.assets[index]?.id, designRoute: variant.designRoute, prompt: variant.prompt, seed: variant.seed })),
    };
    const message: Message = { id: crypto.randomUUID(), jobId: job.id, projectId: input.projectId, role: "assistant", content: `已按自然语言要求生成 ${image.imageUrls.length} 张结果${plan.boardItems > 1 ? `，每张包含 ${plan.boardItems} 个方案` : ""}，其中 ${persisted.savedCount} 张已保存到${projectStorageLocation()}。${persisted.errors.length ? "未保存的结果依赖供应商临时链接，请及时下载并检查保存失败提示。" : ""}`, agentId: "free-chat", generation: result, createdAt: completedAt };
    store.addMessage(input.userId, message);
    store.updateJob(job.id, { status: "succeeded", progress: 100, stage: "completed", stageLabel: "已完成", completedOutputs: image.imageUrls.length, totalOutputs: plan.count, result });
    return { job: store.getJob(input.userId, job.id), message, created };
  } catch (error) {
    const current = store.getJob(input.userId, job.id);
    if (cancelSignal.aborted || current.status === "cancelled") {
      store.updateJob(job.id, { status: "cancelled", progress: 100, error: "已取消生成" });
      return { job: store.getJob(input.userId, job.id), created };
    }
    const message = error instanceof Error ? error.message : "自由对话任务失败";
    store.updateJob(job.id, { status: "failed", progress: 100, stageLabel: message, error: message });
    throw error;
  } finally { endJob(job.id); }
}
