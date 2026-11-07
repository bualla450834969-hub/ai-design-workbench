import type { VideoPurpose } from "@/lib/video-types";

/** GeekAI 官方模型广场标价（元/秒），2026-11-07 用户提供的官方页面。
 * https://geeknow.ai/pricing
 * 展示模型广场参考价，不用个人历史账单覆盖；实际结算仍以供应商账单为准。
 * 只列已适配的图生视频型号，不把按 Token 的模型价格冒充每秒价格。
 */
export const GEEKAI_VIDEO_PRICE_PER_SECOND: Readonly<Record<string, number>> = {
  "kling-3.0-omni-1080p-ref-audio": 0.840,
  "kling-3.0-omni-1080p-ref-mute": 0.840,
  "kling-3.0-omni-720p-ref-audio": 0.840,
  "kling-3.0-omni-720p-ref-mute": 0.840,
  "vidu-q2-pro-reference-1080p": 0.329,
  "vidu-q2-pro-reference-1080p-offpeak": 0.329,
  "vidu-q2-pro-reference-720p": 0.329,
  "vidu-q2-pro-reference-720p-offpeak": 0.329,
  "vidu-q2-pro-reference-540p": 0.329,
  "vidu-q2-pro-reference-540p-offpeak": 0.329,
  "vidu-q2-reference-1080p": 0.329,
  "vidu-q2-reference-1080p-offpeak": 0.329,
  "vidu-q2-reference-720p": 0.329,
  "vidu-q2-reference-720p-offpeak": 0.329,
  "vidu-q2-reference-540p": 0.329,
  "vidu-q2-reference-540p-offpeak": 0.329,
  // Wan 2.6 的 GeekAI 模型卡未提供可核实的视频接口合同，暂不开放。
};

export const DEFAULT_VIDEO_MODEL = "vidu-q2-pro-reference-720p";
export const DEFAULT_INTRODUCTION_VIDEO_MODEL = "kling-3.0-omni-720p-ref-audio";

const OTHER_VIDEO_MODELS = [
  { id: "wan2.5-i2v-preview", providerType: "aihubmix", family: "wan-2-5", familyLabel: "Wan 2.5", version: "标准版", resolutions: [480, 720, 1080], durations: [5, 10] },
  { id: "wan2.6-i2v", providerType: "aihubmix", family: "wan-2-6", familyLabel: "Wan 2.6", version: "标准版", resolutions: [720, 1080], durations: [5, 10] },
  { id: "wan3.0-video", providerType: "aihubmix", family: "wan-3-0", familyLabel: "Wan 3.0", version: "标准版", resolutions: [480, 720, 1080], durations: [5, 10] },
  { id: "wan3.0-video-prime", providerType: "aihubmix", family: "wan-3-0", familyLabel: "Wan 3.0", version: "Prime版", resolutions: [480, 720, 1080], durations: [5, 10] },
  { id: "oxygen-1.0", providerType: "apiyi", family: "oxygen-1-0", familyLabel: "Oxygen 1.0", version: "标准版", resolutions: [768, 480], durations: [5, 10] },
  { id: "wan3.0-video", providerType: "apiyi", family: "wan-3-0", familyLabel: "Wan 3.0", version: "标准版", resolutions: [480, 720, 1080], durations: [5, 10] },
  { id: "minimax-h3", providerType: "apiyi", family: "minimax-h3", familyLabel: "MiniMax H3", version: "标准版", resolutions: [768], durations: [5, 10] },
  { id: "veo-3.1-fast-generate-preview", providerType: "apiyi", family: "veo-3-1", familyLabel: "Veo 3.1", version: "快速版", resolutions: [720, 1080], durations: [8] },
  { id: "veo-3.1-generate-preview", providerType: "apiyi", family: "veo-3-1", familyLabel: "Veo 3.1", version: "标准版", resolutions: [720, 1080], durations: [8] },
  { id: "kling-v2-6", providerType: "relayrouter", family: "kling-2-6", familyLabel: "Kling 2.6", version: "静音版", resolutions: [720, 1080], durations: [5, 10] },
  { id: "kling-v2-5-turbo", providerType: "relayrouter", family: "kling-2-5", familyLabel: "Kling 2.5 Turbo", version: "静音版", resolutions: [720, 1080], durations: [5, 10] },
  { id: "viduq3-turbo", providerType: "relayrouter", family: "vidu-q3", familyLabel: "Vidu Q3", version: "Turbo版", resolutions: [540, 720, 1080], durations: [5, 10] },
  { id: "viduq2", providerType: "relayrouter", family: "vidu-q2", familyLabel: "Vidu Q2", version: "参考生视频", resolutions: [540, 720, 1080], durations: [5, 10] },
  { id: "viduq3-pro", providerType: "relayrouter", family: "vidu-q3", familyLabel: "Vidu Q3", version: "Pro版", resolutions: [540, 720, 1080], durations: [5, 10] },
] as const;

const VIDEO_MODEL_FALLBACKS = [
  DEFAULT_VIDEO_MODEL,
  "oxygen-1.0",
  "wan2.6-i2v",
  "kling-v2-5-turbo",
  "vidu-q2-reference-720p",
  "vidu-q2-pro-reference-540p",
  "vidu-q2-reference-540p",
  "vidu-q2-pro-reference-1080p",
  "vidu-q2-reference-1080p",
];

export function videoModelPricePerSecond(model: string): number | null {
  const id = model.trim().toLowerCase();
  return Object.hasOwn(GEEKAI_VIDEO_PRICE_PER_SECOND, id) ? GEEKAI_VIDEO_PRICE_PER_SECOND[id] : null;
}

export function isImageToVideoModel(model: string, providerType = "geekai"): boolean {
  if (providerType !== "geekai") return OTHER_VIDEO_MODELS.some((item) => item.providerType === providerType && item.id === model);
  return providerType === "geekai" && videoModelPricePerSecond(model) !== null;
}

export function videoProviderModelIds(providerType: string): string[] {
  return providerType === "geekai" ? Object.keys(GEEKAI_VIDEO_PRICE_PER_SECOND)
    : OTHER_VIDEO_MODELS.filter((item) => item.providerType === providerType).map((item) => item.id);
}

/** Three low-cost image-to-video choices with a verified source-image contract. */
export function recommendedVideoModelIds(providerType: string): string[] {
  const ids: Record<string, string[]> = {
    geekai: ["vidu-q2-reference-540p-offpeak", "vidu-q2-pro-reference-540p-offpeak", "vidu-q2-reference-720p-offpeak"],
    apiyi: ["oxygen-1.0", "wan3.0-video", "minimax-h3"],
    aihubmix: ["wan2.5-i2v-preview", "wan3.0-video", "wan3.0-video-prime"],
    relayrouter: ["viduq2", "viduq3-turbo", "viduq3-pro"],
  };
  return ids[providerType] || [];
}

export function videoModelDisplayName(model: string): string {
  const extra = OTHER_VIDEO_MODELS.find((item) => item.id === model);
  if (extra) return `${extra.familyLabel} · ${extra.version}`;
  const variant = videoModelVariant(model);
  return variant ? `${variant.family === "vidu-q2-pro" ? "Vidu Q2 Pro" : variant.family === "vidu-q2" ? "Vidu Q2" : "Kling 3.0 Omni"} · ${variant.label}` : model;
}

export function videoTemporarySourceModels(providerType: string): string[] {
  return providerType === "apiyi" ? ["oxygen-1.0", "wan3.0-video", "minimax-h3"] : [];
}

export function videoModelDurations(model: string, providerType?: string): readonly number[] {
  return videoModelPricePerSecond(model) !== null ? [5, 10] : OTHER_VIDEO_MODELS.find((item) => item.id === model && (!providerType || item.providerType === providerType))?.durations || [];
}

export function videoModelResolutions(model: string, providerType?: string): readonly number[] {
  const extra = OTHER_VIDEO_MODELS.find((item) => item.id === model && (!providerType || item.providerType === providerType));
  if (extra) return extra.resolutions;
  const resolution = /(?:reference-|omni-)(540|720|1080)p/.exec(model)?.[1];
  return videoModelPricePerSecond(model) !== null && resolution ? [Number(resolution)] : [];
}

/** Only models with an explicit native-audio billing contract are enabled here. */
export function supportsVideoAudio(model: string): boolean {
  return isImageToVideoModel(model) && /^kling-3\.0-omni-(?:720p|1080p)-ref-audio$/i.test(model.trim());
}

export function videoModelsFromCatalog(catalog: string[]): string[] {
  return [...new Set(catalog.map((model) => model.trim().toLowerCase()).filter((model) => videoModelDurations(model).length > 0))]
    .sort((a, b) => Number(b === DEFAULT_VIDEO_MODEL) - Number(a === DEFAULT_VIDEO_MODEL) || a.localeCompare(b));
}

/** Selects a visible default only; submitting a paid job still requires user confirmation. */
export function defaultVideoModel(catalog: string[], purpose: VideoPurpose = "showcase"): string {
  const models = videoModelsFromCatalog(catalog).filter((model) => purpose !== "scene" || !supportsVideoAudio(model));
  return VIDEO_MODEL_FALLBACKS.find((model) => models.includes(model))
    || models.filter((model) => !model.endsWith("-offpeak"))
      .sort((a, b) => (GEEKAI_VIDEO_PRICE_PER_SECOND[a] ?? Infinity) - (GEEKAI_VIDEO_PRICE_PER_SECOND[b] ?? Infinity) || Number(supportsVideoAudio(a)) - Number(supportsVideoAudio(b)) || a.localeCompare(b))[0]
    || models.sort((a, b) => (GEEKAI_VIDEO_PRICE_PER_SECOND[a] ?? Infinity) - (GEEKAI_VIDEO_PRICE_PER_SECOND[b] ?? Infinity) || Number(supportsVideoAudio(a)) - Number(supportsVideoAudio(b)) || a.localeCompare(b))[0]
    || "";
}

export function selectedVideoModel(catalog: string[], current: string, purpose: VideoPurpose = "showcase"): string {
  return videoModelsFromCatalog(catalog).includes(current) && (purpose !== "scene" || !supportsVideoAudio(current))
    ? current : defaultVideoModel(catalog, purpose);
}

export type VideoModelFamily = "vidu-q2-pro" | "vidu-q2" | "vidu-q3" | "kling-3-omni" | "wan-2-5" | "wan-2-6" | "wan-3-0" | "veo-3-1" | "oxygen-1-0" | "kling-2-5" | "kling-2-6" | "minimax-h3";
export type VideoModelVariant = { id: string; resolution: number; version: string; label: string };
export type VideoModelGroup = { id: VideoModelFamily; label: string; variants: VideoModelVariant[] };

export function videoModelVariant(model: string, requestedResolution?: number): (VideoModelVariant & { family: VideoModelFamily }) | undefined {
  const extra = OTHER_VIDEO_MODELS.find((item) => item.id === model);
  if (extra) {
    const resolution = requestedResolution && (extra.resolutions as readonly number[]).includes(requestedResolution) ? requestedResolution : extra.resolutions[0];
    return { id: model, family: extra.family, resolution, version: extra.version, label: `${resolution}p · ${extra.version}` };
  }
  if (!isImageToVideoModel(model)) return undefined;
  const vidu = /^vidu-q2-(pro-)?reference-(540|720|1080)p(-offpeak)?$/.exec(model);
  if (vidu) {
    const version = vidu[3] ? "错峰版" : "标准版";
    return { id: model, family: vidu[1] ? "vidu-q2-pro" : "vidu-q2", resolution: Number(vidu[2]), version, label: `${vidu[2]}p · ${version}` };
  }
  const kling = /^kling-3\.0-omni-(720|1080)p-ref-(audio|mute)$/.exec(model);
  if (!kling) return undefined;
  const version = kling[2] === "audio" ? "有声版" : "静音版";
  return { id: model, family: "kling-3-omni", resolution: Number(kling[1]), version, label: `${kling[1]}p · ${version}` };
}

export function videoModelGroups(catalog: string[], resolutionFilter?: number): VideoModelGroup[] {
  const definitions: { id: VideoModelFamily; label: string }[] = [
    { id: "vidu-q2-pro", label: "Vidu Q2 Pro" }, { id: "vidu-q2", label: "Vidu Q2" }, { id: "kling-3-omni", label: "Kling 3.0 Omni" }, { id: "wan-2-5", label: "Wan 2.5" }, { id: "wan-2-6", label: "Wan 2.6" }, { id: "wan-3-0", label: "Wan 3.0" }, { id: "veo-3-1", label: "Veo 3.1" },
    { id: "oxygen-1-0", label: "Oxygen 1.0" }, { id: "kling-2-5", label: "Kling 2.5 Turbo" }, { id: "kling-2-6", label: "Kling 2.6" },
    { id: "vidu-q3", label: "Vidu Q3" }, { id: "minimax-h3", label: "MiniMax H3" },
  ];
  const variants = videoModelsFromCatalog(catalog).flatMap((model) => videoModelResolutions(model).filter((value) => resolutionFilter === undefined || value === resolutionFilter)
    .flatMap((value) => { const item = videoModelVariant(model, value); return item ? [item] : []; }));
  return definitions.map((family) => ({ ...family, variants: variants.filter((item) => item.family === family.id)
    .sort((a, b) => a.resolution - b.resolution || Number(a.version === "错峰版" || a.version === "有声版") - Number(b.version === "错峰版" || b.version === "有声版")) }))
    .filter((group) => group.variants.length > 0);
}

/** Preserve a comparable resolution when changing family, then prefer its ordinary version. */
export function videoModelInFamily(catalog: string[], family: string, current: string, purpose: VideoPurpose = "showcase", requestedResolution?: number): string {
  const group = videoModelGroups(catalog).find((item) => item.id === family);
  const candidates = group?.variants.filter((item) => purpose !== "scene" || !supportsVideoAudio(item.id)) || [];
  const resolution = requestedResolution || videoModelVariant(current)?.resolution;
  const sameResolution = candidates.filter((item) => item.resolution === resolution);
  return defaultVideoModel((sameResolution.length ? sameResolution : candidates).map((item) => item.id), purpose);
}

export function videoModelsAtResolution(catalog: string[], resolution: number, purpose: VideoPurpose = "showcase"): string[] {
  return videoModelsFromCatalog(catalog).filter((model) => videoModelResolutions(model).includes(resolution) && (purpose !== "scene" || !supportsVideoAudio(model)));
}

export function videoModelAtResolution(catalog: string[], resolution: number, current: string, purpose: VideoPurpose = "showcase"): string {
  const available = videoModelsAtResolution(catalog, resolution, purpose);
  const family = videoModelVariant(current)?.family;
  const comparable = available.filter((model) => videoModelVariant(model)?.family === family);
  return defaultVideoModel(comparable.length ? comparable : available, purpose);
}
