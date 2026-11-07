import type { DesignPlan } from "@/lib/providers/types";

const FIELDS = ["productCategory", "coreFunctions", "mandatoryConstraints", "mutableFeatures", "styleFingerprint", "negativeStyleConstraints", "analysisSummary", "variantDirections", "appearanceObservations", "controlVersion", "prompt"] as const;
const LIST_FIELDS = ["coreFunctions", "mandatoryConstraints", "mutableFeatures", "styleFingerprint", "negativeStyleConstraints", "variantDirections", "appearanceObservations"] as const;
const FIELD_SET = new Set<string>(FIELDS);
const FREE_CHAT_FIELD_SET = new Set<string>([...FIELDS, "memory", "action", "reply", "workflowKind"]);
const PLACEHOLDER_CATEGORY = /^(?:待(?:模型)?(?:依据图片)?确认|待模型依据图片确认|未知|不明|当前产品|本轮目标产品|依据项目名称确定产品类别|unknown|undefined|null)$/i;
const MAX_RESPONSE_CHARS = 256_000;

function invalid(message = "设计分析格式不完整，请检查所选图片和设计要求后重试") {
  return new Error(`${message}；本次尚未开始图片生成。`);
}

function candidate(text: string) {
  const trimmed = text.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/^([\s\S]*?)```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```([\s\S]*)$/i);
  if (fenced) {
    const outside = `${fenced[1]}${fenced[3]}`.trim();
    if (outside.length <= 200 && !/[{}\[\]`]/.test(outside)) return fenced[2].trim();
  }
  const first = trimmed.indexOf("{"), last = trimmed.lastIndexOf("}");
  if (first < 0 || last <= first) return trimmed;
  const outside = `${trimmed.slice(0, first)}${trimmed.slice(last + 1)}`.trim();
  return outside.length <= 200 && !/[{}\[\]`]/.test(outside) ? trimmed.slice(first, last + 1) : trimmed;
}

/** Repair only illegal physical whitespace inside JSON strings. Legal escapes
 * and all visible content are preserved; no evaluation or global deletion. */
function escapePhysicalStringWhitespace(value: string) {
  let result = "", quoted = false, escaped = false;
  for (const character of value) {
    if (!quoted) {
      result += character;
      if (character === '"') quoted = true;
      continue;
    }
    if (escaped) { result += character; escaped = false; continue; }
    if (character === "\\") { result += character; escaped = true; continue; }
    if (character === '"') { result += character; quoted = false; continue; }
    result += character === "\n" ? "\\n" : character === "\r" ? "\\r" : character === "\t" ? "\\t" : character;
  }
  return result;
}

function objectFromText(text: string, fields = FIELD_SET): Record<string, unknown> {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_RESPONSE_CHARS) throw invalid();
  const body = candidate(text);
  let value: unknown;
  try { value = JSON.parse(body); }
  catch {
    try { value = JSON.parse(escapePhysicalStringWhitespace(body)); }
    catch { throw invalid("无法可靠读取本轮设计分析，请检查所选图片和设计要求后重试"); }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const normalized: Record<string, unknown> = Object.create(null);
  for (const [key, field] of Object.entries(value)) {
    // Some text transports insert newlines between fragments, including field
    // names. Repair only an exact known field, never arbitrary user properties.
    const canonical = fields.has(key) ? key : key.replace(/[\r\n]/g, "");
    if (!fields.has(canonical)) continue;
    if (Object.hasOwn(normalized, canonical)) throw invalid("设计分析字段重复，请重新生成需求分析");
    normalized[canonical] = field;
  }
  return normalized;
}

/** Free chat uses the same bounded, local format repair as parameter design.
 * Its caller still validates the task action and any paid image plan. */
export function parseStructuredFreeChatResponse(text: string): Record<string, unknown> {
  return objectFromText(text, FREE_CHAT_FIELD_SET);
}

function clean(value: string) { return value.replace(/\r\n?/g, "\n").trim(); }

function textField(value: unknown, maximum: number) {
  return typeof value === "string" && value.length <= maximum ? clean(value) : "";
}

function routeIdentity(value: string) {
  return value.replace(/^(?:(?:方案|路线|方向)\s*[一二三四五六七八九十百零\d]+|第\s*[一二三四五六七八九十百零\d]+\s*[张条项])\s*[：:|｜、.．-]?\s*/, "")
    .replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
}

/** Validate both fresh analysis and a previously prepared plan before reuse.
 * Generic/empty identity and silently repeated or partial routes are unusable. */
export function assertUsableDesignPlan(value: unknown, count: number): DesignPlan {
  if (!Number.isInteger(count) || count < 1 || count > 100 || !value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const record = value as Record<string, unknown>;
  const productCategory = textField(record.productCategory, 200);
  if (!productCategory || PLACEHOLDER_CATEGORY.test(productCategory) || productCategory.startsWith("待模型")) throw invalid("尚未确认图片中的具体产品，请检查原图后重试");
  const lists = {} as Pick<DesignPlan, (typeof LIST_FIELDS)[number]>;
  for (const key of LIST_FIELDS) {
    const supplied = record[key];
    const required = ["coreFunctions", "mandatoryConstraints", "variantDirections"].includes(key);
    if ((supplied === undefined || supplied === null) && !required) { lists[key] = []; continue; }
    if (typeof supplied === "string" && clean(supplied) && supplied.length <= 4000 && (key !== "variantDirections" || count === 1)) {
      // A complete scalar requirement is safely one item. Do not split prose
      // into extra constraints or invent additional paid image routes.
      lists[key] = [clean(supplied)];
      continue;
    }
    if (!Array.isArray(supplied) || supplied.some((item) => typeof item !== "string" || !clean(item) || item.length > 4000)) throw invalid();
    lists[key] = supplied.map((item) => clean(item as string));
  }
  if (!lists.coreFunctions.length || !lists.mandatoryConstraints.length) throw invalid("产品功能与保留结构尚未确认，请重新分析所选原图");
  if (lists.variantDirections.length !== count) throw invalid(`设计路线数量与本轮${count}张输出不一致，请重新规划`);
  const routes = lists.variantDirections.map(routeIdentity);
  if (routes.some((route) => !route) || new Set(routes).size !== count) throw invalid("设计路线存在重复或缺少具体内容，请重新规划");
  const analysisSummary = record.analysisSummary === undefined ? "" : textField(record.analysisSummary, 12000);
  if (record.analysisSummary !== undefined && typeof record.analysisSummary !== "string") throw invalid();
  return { productCategory, ...lists, analysisSummary, ...(record.controlVersion === 186 ? { controlVersion: 186 } : {}) };
}

export function isUsableDesignPlan(value: unknown, count: number): boolean {
  try { assertUsableDesignPlan(value, count); return true; } catch { return false; }
}

/** Shared browser/server response boundary. Never exposes the raw response in
 * an error or accepts raw JSON as the user-facing editable prompt. */
export function parseStructuredDesignResponse(text: string, count: number): { plan: DesignPlan; prompt?: string } {
  const parsed = objectFromText(text);
  const plan = assertUsableDesignPlan(parsed, count);
  const prompt = parsed.prompt === undefined ? undefined : textField(parsed.prompt, 30000);
  if (parsed.prompt !== undefined && (!prompt || /^[\[{]/.test(prompt))) throw invalid("AI整理没有返回可编辑的设计要求，请重试");
  return { plan, ...(prompt ? { prompt } : {}) };
}

/** A continuation reuses confirmed facts and supplies only new routes. It may
 * neither replace the product definition nor silently repeat earlier routes. */
export function parseAdditionalDesignRoutes(text: string, base: DesignPlan, count: number): string[] {
  const parsed = objectFromText(text);
  const extra = assertUsableDesignPlan({ ...base, variantDirections: parsed.variantDirections }, count).variantDirections;
  assertUsableDesignPlan({ ...base, variantDirections: [...base.variantDirections, ...extra] }, base.variantDirections.length + count);
  return extra;
}
