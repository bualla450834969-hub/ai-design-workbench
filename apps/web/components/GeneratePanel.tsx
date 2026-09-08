"use client";

import { useState, useRef, useEffect } from "react";
import type {
  GenerationState,
  ResultCard,
  BatchGroup,
  BatchResultGroup,
  PendingGenerateConfig,
  ReferenceImageRole,
  LocalEditIntent,
} from "@/types";
import {
  TEMPLATES,
  DEFAULT_BATCH_GROUPS,
  APPLICATION_MODES,
  COMMERCE_PLATFORMS,
  COMMERCE_LOCALES,
  COMMERCE_RESOLUTIONS,
  DETAIL_STYLES,
  COPY_DENSITIES,
  REFERENCE_ROLE_LABELS,
  LOCAL_EDIT_INTENT_LABELS,
  PRODUCT_KIT_PRESETS,
} from "@/constants";
import { fileToDataUrl, getProviderConfig, getDeviceId, addHistoryRecord, compressImageToThumbnail, loadCostConfig, estimateCost, getLicenseCode } from "@/utils";
import LocalEditMask from "@/components/LocalEditMask";
import { useToast } from "@/components/Toast";

export default function GeneratePanel({
  generation,
  setGeneration,
  onComplete,
  onBatchComplete,
  pendingConfig,
  onConfigApplied,
}: {
  generation: GenerationState;
  setGeneration: React.Dispatch<React.SetStateAction<GenerationState>>;
  onComplete: (cards: ResultCard[]) => void;
  onBatchComplete: (groups: BatchResultGroup[]) => void;
  pendingConfig: PendingGenerateConfig;
  onConfigApplied: () => void;
}) {
  const [productName, setProductName] = useState("");
  const [variation, setVariation] = useState(65);
  const [count, setCount] = useState(2);
  const [templateId, setTemplateId] = useState("smart-auto");
  const [costConfig] = useState(() => loadCostConfig());
  const [productImages, setProductImages] = useState<{ dataUrl: string; name: string }[]>([]);
  const [referenceImages, setReferenceImages] = useState<{ dataUrl: string; name: string; role: ReferenceImageRole }[]>([]);
  const [notes, setNotes] = useState("");
  const [localEditEnabled, setLocalEditEnabled] = useState(false);
  const [editRegionMask, setEditRegionMask] = useState<string | null>(null);
  const [editRegionGuide, setEditRegionGuide] = useState<string | null>(null);
  const [editRegionIntent, setEditRegionIntent] = useState<LocalEditIntent>("form");
  const [editRegionInstruction, setEditRegionInstruction] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [batchGroups, setBatchGroups] = useState<BatchGroup[]>(DEFAULT_BATCH_GROUPS);
  const [batchCurrent, setBatchCurrent] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [applicationMode, setApplicationMode] = useState("appearance-redesign");
  const [commercePlatform, setCommercePlatform] = useState("tmall");
  const [commerceLocale, setCommerceLocale] = useState("zh-CN");
  const [commerceResolution, setCommerceResolution] = useState("standard");
  const [detailStyle, setDetailStyle] = useState("platform-native");
  const [copyDensity, setCopyDensity] = useState("balanced");
  const [kitPreset, setKitPreset] = useState("auto");
  const [isAiWriting, setIsAiWriting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (pendingConfig) {
      setProductName(pendingConfig.productName);
      setTemplateId(pendingConfig.templateId);
      setVariation(pendingConfig.variationLevel);
      setCount(pendingConfig.count);
      setNotes(pendingConfig.notes);
      onConfigApplied();
    }
  }, [pendingConfig, onConfigApplied]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages: { dataUrl: string; name: string }[] = [];
    for (const file of Array.from(files).slice(0, 5 - productImages.length)) {
      const dataUrl = await fileToDataUrl(file);
      newImages.push({ dataUrl, name: file.name });
    }
    setProductImages((prev) => [...prev, ...newImages]);
  };

  const removeImage = (index: number) => {
    setProductImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newRefs: { dataUrl: string; name: string; role: ReferenceImageRole }[] = [];
    for (const file of Array.from(files).slice(0, 8 - referenceImages.length)) {
      const dataUrl = await fileToDataUrl(file);
      newRefs.push({ dataUrl, name: file.name, role: "auto" });
    }
    setReferenceImages((prev) => [...prev, ...newRefs]);
  };

  const removeRef = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  };

  const changeRefRole = (index: number, role: ReferenceImageRole) => {
    setReferenceImages((prev) => prev.map((ref, i) => (i === index ? { ...ref, role } : ref)));
  };

  const runSingleGeneration = async (params: {
    templateId: string;
    variationLevel: number;
    count: number;
    notes: string;
    groupName?: string;
    onProgress?: (phase: string, message: string, percent: number, completed: number, total: number) => void;
    signal?: AbortSignal;
  }): Promise<ResultCard[]> => {
    const providerConfig = getProviderConfig();
    if (!providerConfig) throw new Error("请先在设置页配置 AI 供应商 API Key");

    const deviceId = getDeviceId();
    const licenseCode = getLicenseCode();
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": deviceId,
      },
      signal: params.signal,
      body: JSON.stringify({
        licenseCode,
        deviceId,
        apiKey: providerConfig.apiKey,
        aiProvider: providerConfig.provider,
        brainModel: providerConfig.brainModel,
        imageModel: providerConfig.imageModel,
        customProviderBaseUrl: providerConfig.baseUrl,
        productName: productName || undefined,
        templateId: params.templateId,
        variationLevel: params.variationLevel,
        count: params.count,
        notes: params.notes.trim() || undefined,
        productImages: productImages.map((img) => ({ dataUrl: img.dataUrl, name: img.name })),
        referenceImages: referenceImages.length > 0 ? referenceImages.map((img) => ({
          dataUrl: img.dataUrl,
          name: img.name,
          role: img.role,
        })) : undefined,
        ...(localEditEnabled && editRegionMask ? {
          editRegionImage: { dataUrl: editRegionGuide || editRegionMask },
          editRegionMask: { dataUrl: editRegionMask },
          editRegionIntent,
          editRegionInstruction: editRegionInstruction.trim() || undefined,
        } : {}),
        applicationMode: applicationMode !== "appearance-redesign" ? applicationMode : undefined,
        commercePlatform: applicationMode !== "appearance-redesign" ? commercePlatform : undefined,
        commerceLocale: applicationMode !== "appearance-redesign" ? commerceLocale : undefined,
        commerceResolution: applicationMode !== "appearance-redesign" ? commerceResolution : undefined,
        commerceDetailStyle: applicationMode === "detail-page" ? detailStyle : undefined,
        commerceCopyDensity: applicationMode === "detail-page" ? copyDensity : undefined,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `请求失败 (${response.status})`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("无法读取响应流");

    const decoder = new TextDecoder();
    let buffer = "";
    const resultCards: ResultCard[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "start") {
            params.onProgress?.("starting", `开始生成 ${event.total} 个方案...`, 0, 0, event.total);
          } else if (event.type === "stage") {
            params.onProgress?.(event.phase, event.message, event.progress || 0, resultCards.length, event.total || params.count);
          } else if (event.type === "card") {
            const card = event.card;
            const imageUrl = card.image?.base64
              ? `data:${card.image.mimeType || "image/png"};base64,${card.image.base64}`
              : card.image?.url;
            resultCards.push({
              id: `card-${Date.now()}-${event.index}`,
              title: card.title || `方案 ${event.index + 1}`,
              description: card.description || card.designSummary || "",
              imageUrl,
              variationLabel: card.variationLabel,
              sellingPoints: card.sellingPoints,
              materialProcess: card.materialProcess,
              difference: card.difference,
              qualityWarning: card.qualityWarning,
              designDirectionLabel: card.designDirectionLabel || event.templateLabel,
            });
            params.onProgress?.("generating", event.message || "生成中...", event.progress || 0, resultCards.length, event.total || params.count);
          } else if (event.type === "done") {
            return resultCards;
          } else if (event.type === "error") {
            throw new Error(event.message || event.error || "生成失败");
          }
        } catch (e) {
          // 解析失败的行跳过
        }
      }
    }
    return resultCards;
  };

  const handleBatchGenerate = async () => {
    if (productImages.length === 0) {
      showToast("请先上传产品图片", "error");
      return;
    }

    // 验证授权码
    const licenseCode = getLicenseCode();
    if (!licenseCode) {
      showToast("请先在设置页填写授权码", "error");
      return;
    }

    const providerConfig = getProviderConfig();
    if (!providerConfig) {
      showToast("请先在设置页配置 AI 供应商 API Key", "error");
      return;
    }

    const enabledGroups = batchGroups.filter((g) => g.enabled);
    if (enabledGroups.length === 0) {
      showToast("请至少启用一个分组", "error");
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setBatchTotal(enabledGroups.length);
    setBatchCurrent(0);
    setGeneration({
      isGenerating: true,
      phase: "batch",
      message: `准备批量生成 ${enabledGroups.length} 组...`,
      percent: 0,
      completed: 0,
      total: enabledGroups.reduce((sum, g) => sum + g.count, 0),
      cards: [],
    });

    const allResults: BatchResultGroup[] = [];
    let totalCompleted = 0;

    try {
      for (let i = 0; i < enabledGroups.length; i++) {
        const group = enabledGroups[i];
        setBatchCurrent(i + 1);
        setGeneration((prev) => ({
          ...prev,
          message: `第 ${i + 1}/${enabledGroups.length} 组：${group.name}`,
          phase: "batch",
        }));

        const cards = await runSingleGeneration({
          templateId: group.templateId,
          variationLevel: group.variationLevel,
          count: group.count,
          notes: group.notes || notes,
          groupName: group.name,
          signal: controller.signal,
          onProgress: (phase, message, percent, completed, total) => {
            setGeneration((prev) => ({
              ...prev,
              phase,
              message: `[${i + 1}/${enabledGroups.length}] ${group.name} - ${message}`,
              percent,
              completed: totalCompleted + completed,
              total: enabledGroups.reduce((sum, g) => sum + g.count, 0),
            }));
          },
        });

        totalCompleted += cards.length;
        allResults.push({ groupId: group.id, groupName: group.name, cards });

        const templateLabel = TEMPLATES.find((t) => t.id === group.templateId)?.label || group.templateId;
        const thumbnails = await Promise.all(
          productImages.slice(0, 3).map((img) => compressImageToThumbnail(img.dataUrl))
        );
        addHistoryRecord({
          productName: productName || "未命名产品",
          templateId: group.templateId,
          templateLabel,
          variationLevel: group.variationLevel,
          count: group.count,
          notes: group.notes || notes,
          cards,
          applicationMode,
          productImageThumbnails: thumbnails,
          referenceImageCount: referenceImages.length,
          referenceImageRoles: referenceImages.map((r) => r.role),
          hasLocalEdit: localEditEnabled && !!editRegionMask,
          editRegionIntent: localEditEnabled ? editRegionIntent : undefined,
          editRegionInstruction: localEditEnabled && editRegionInstruction ? editRegionInstruction : undefined,
        });
      }

      setGeneration((prev) => ({
        ...prev,
        isGenerating: false,
        phase: "done",
        message: "批量生成完成",
        percent: 100,
        completed: totalCompleted,
      }));
      onBatchComplete(allResults);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setGeneration((prev) => ({ ...prev, isGenerating: false, phase: "", message: "已取消" }));
      } else {
        const message = err instanceof Error ? err.message : "生成失败";
        setGeneration((prev) => ({ ...prev, isGenerating: false, phase: "", message }));
        showToast(`批量生成失败：${message}`, "error");
      }
    }
  };

  const handleGenerate = async () => {
    if (productImages.length === 0) {
      showToast("请先上传产品图片", "error");
      return;
    }

    // 验证授权码
    const licenseCode = getLicenseCode();
    if (!licenseCode) {
      showToast("请先在设置页填写授权码", "error");
      return;
    }

    const providerConfig = getProviderConfig();
    if (!providerConfig) {
      showToast("请先在设置页配置 AI 供应商 API Key", "error");
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setGeneration({
      isGenerating: true,
      phase: "starting",
      message: "正在初始化...",
      percent: 0,
      completed: 0,
      total: count,
      cards: [],
    });

    try {
      const deviceId = getDeviceId();
      const licenseCode = getLicenseCode();
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        signal: controller.signal,
        body: JSON.stringify({
          licenseCode,
          deviceId,
          apiKey: providerConfig.apiKey,
          aiProvider: providerConfig.provider,
          brainModel: providerConfig.brainModel,
          imageModel: providerConfig.imageModel,
          customProviderBaseUrl: providerConfig.baseUrl,
          productName: productName || undefined,
          templateId,
          variationLevel: variation,
          count,
          notes: (notes.trim() || (applicationMode === "product-kit" && kitPreset !== "auto"
            ? PRODUCT_KIT_PRESETS.find((p) => p.value === kitPreset)?.notes || ""
            : "")).trim() || undefined,
          productImages: productImages.map((img) => ({
            dataUrl: img.dataUrl,
            name: img.name,
          })),
          referenceImages: referenceImages.length > 0 ? referenceImages.map((img) => ({
            dataUrl: img.dataUrl,
            name: img.name,
            role: img.role,
          })) : undefined,
          ...(localEditEnabled && editRegionMask ? {
            editRegionImage: { dataUrl: editRegionGuide || editRegionMask },
            editRegionMask: { dataUrl: editRegionMask },
            editRegionIntent,
            editRegionInstruction: editRegionInstruction.trim() || undefined,
          } : {}),
          applicationMode: applicationMode !== "appearance-redesign" ? applicationMode : undefined,
          commercePlatform: applicationMode !== "appearance-redesign" ? commercePlatform : undefined,
          commerceLocale: applicationMode !== "appearance-redesign" ? commerceLocale : undefined,
          commerceResolution: applicationMode !== "appearance-redesign" ? commerceResolution : undefined,
          commerceDetailStyle: applicationMode === "detail-page" ? detailStyle : undefined,
          commerceCopyDensity: applicationMode === "detail-page" ? copyDensity : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `请求失败 (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let buffer = "";
      const resultCards: ResultCard[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "start") {
              setGeneration((prev) => ({
                ...prev,
                total: event.total,
                message: `开始生成 ${event.total} 个方案...`,
              }));
            } else if (event.type === "stage") {
              setGeneration((prev) => ({
                ...prev,
                phase: event.phase,
                message: event.message,
                percent: event.progress || 0,
              }));
            } else if (event.type === "card") {
              const card = event.card;
              const imageUrl = card.image?.base64
                ? `data:${card.image.mimeType || "image/png"};base64,${card.image.base64}`
                : card.image?.url;
              resultCards.push({
                id: `card-${event.index}`,
                title: card.title || `方案 ${event.index + 1}`,
                description: card.description || card.designSummary || "",
                imageUrl,
                variationLabel: card.variationLabel,
                sellingPoints: card.sellingPoints,
                materialProcess: card.materialProcess,
                difference: card.difference,
                qualityWarning: card.qualityWarning,
                designDirectionLabel: card.designDirectionLabel || event.templateLabel,
              });
              setGeneration((prev) => ({
                ...prev,
                cards: [...resultCards],
                completed: event.index + 1,
              }));
            } else if (event.type === "done") {
              const templateLabel = TEMPLATES.find((t) => t.id === templateId)?.label || templateId;
              // 压缩产品图为缩略图保存
              const thumbnails = await Promise.all(
                productImages.slice(0, 3).map((img) => compressImageToThumbnail(img.dataUrl))
              );
              const genContext = {
                productName: productName || "未命名产品",
                templateLabel,
                variationLevel: variation,
                notes,
                applicationMode,
                productImageThumbnails: thumbnails,
                referenceImageCount: referenceImages.length,
                hasLocalEdit: localEditEnabled && !!editRegionMask,
                editRegionIntent: localEditEnabled ? editRegionIntent : undefined,
                editRegionInstruction: localEditEnabled && editRegionInstruction ? editRegionInstruction : undefined,
                commercePlatform: applicationMode !== "appearance-redesign" ? commercePlatform : undefined,
                commerceLocale: applicationMode !== "appearance-redesign" ? commerceLocale : undefined,
                kitPreset: applicationMode === "product-kit" ? kitPreset : undefined,
              };
              addHistoryRecord({
                templateId,
                count,
                cards: [...resultCards],
                referenceImageRoles: referenceImages.map((r) => r.role),
                ...genContext,
              });
              setGeneration((prev) => ({
                ...prev,
                isGenerating: false,
                phase: "done",
                message: "生成完成",
                percent: 100,
                completed: resultCards.length,
                cards: [...resultCards],
                context: genContext,
              }));
              onComplete(resultCards);
              return;
            } else if (event.type === "error") {
              throw new Error(event.message || event.error || "生成失败");
            }
          } catch (e) {
            // 解析失败的行跳过
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setGeneration((prev) => ({
          ...prev,
          isGenerating: false,
          message: "已取消生成",
        }));
        return;
      }
      const message = err instanceof Error ? err.message : "生成失败";
      setGeneration((prev) => ({
        ...prev,
        isGenerating: false,
        error: message,
      }));
      showToast(`生成失败：${message}`, "error");
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleAiWriteNotes = async () => {
    if (productImages.length === 0) {
      showToast("请先上传产品图片", "error");
      return;
    }
    const providerConfig = getProviderConfig();
    if (!providerConfig) {
      showToast("请先在设置页配置 AI 供应商 API Key", "error");
      return;
    }

    setIsAiWriting(true);
    try {
      const response = await fetch("/api/ai-write-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productImages: productImages.map((img) => ({ dataUrl: img.dataUrl })),
          productName,
          apiKey: providerConfig.apiKey,
          provider: providerConfig.provider,
          brainModel: providerConfig.brainModel,
          baseUrl: providerConfig.baseUrl,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "生成失败");
      }

      const data = await response.json();
      if (data.notes) {
        setNotes(data.notes);
        showToast("AI 已生成设计需求", "success");
      }
    } catch (err: any) {
      showToast(`AI 编写失败：${err.message}`, "error");
    } finally {
      setIsAiWriting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 应用模式 Tab */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {APPLICATION_MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => setApplicationMode(mode.value)}
            className={`flex-1 rounded-lg px-3 py-2.5 text-center transition-all ${
              applicationMode === mode.value
                ? "bg-white text-brand-700 shadow-sm font-semibold"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <div className="text-xs">{mode.label}</div>
          </button>
        ))}
      </div>

      {/* 产品图片上传 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">产品图片</h2>
        <div className="grid grid-cols-3 gap-2">
          {productImages.map((img, index) => (
            <div key={index} className="relative aspect-square overflow-hidden rounded-lg border border-gray-200">
              <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
              <button
                onClick={() => removeImage(index)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-xs text-white hover:bg-black/70"
              >
                ×
              </button>
            </div>
          ))}
          {productImages.length < 5 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand-400 hover:text-brand-500"
            >
              <div className="text-center">
                <div className="text-2xl">+</div>
                <p className="text-[10px]">上传</p>
              </div>
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="hidden"
        />
        <p className="mt-2 text-[10px] text-gray-400">最多 5 张，建议包含正面、侧面、细节</p>
      </section>

      {/* 局部改款 - 仅外观重构模式 */}
      {productImages.length > 0 && applicationMode === "appearance-redesign" && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">局部改款（可选）</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-gray-500">{localEditEnabled ? "已开启" : "关闭"}</span>
              <button
                onClick={() => {
                  setLocalEditEnabled(!localEditEnabled);
                  if (localEditEnabled) {
                    setEditRegionMask(null);
                    setEditRegionGuide(null);
                  }
                }}
                className={`relative h-5 w-9 rounded-full transition-colors ${localEditEnabled ? "bg-brand-600" : "bg-gray-300"}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${localEditEnabled ? "translate-x-4" : "translate-x-0.5"}`}
                />
              </button>
            </label>
          </div>

          {localEditEnabled && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">修改类型</label>
                <div className="flex gap-2">
                  {(Object.keys(LOCAL_EDIT_INTENT_LABELS) as LocalEditIntent[]).map((intent) => (
                    <button
                      key={intent}
                      onClick={() => setEditRegionIntent(intent)}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                        editRegionIntent === intent
                          ? "bg-brand-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {LOCAL_EDIT_INTENT_LABELS[intent]}
                    </button>
                  ))}
                </div>
              </div>

              <LocalEditMask
                backgroundImage={productImages[0].dataUrl}
                onMaskChange={(mask, guide) => {
                  setEditRegionMask(mask);
                  setEditRegionGuide(guide);
                }}
              />

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">
                  修改说明（可选）
                </label>
                <input
                  type="text"
                  value={editRegionInstruction}
                  onChange={(e) => setEditRegionInstruction(e.target.value)}
                  placeholder="例如：把这个按钮换成旋钮；把这个区域改成金属质感"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {!editRegionMask && (
                <p className="text-[10px] text-amber-600">
                  请先在产品图上涂抹需要修改的区域
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* 设计参考图 - 仅外观重构模式 */}
      {applicationMode === "appearance-redesign" && (
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">设计参考图（可选）</h2>
          <span className="text-[10px] text-gray-400">最多 8 张，可指定参考类型</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {referenceImages.map((img, index) => (
            <div key={index} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200">
              <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
              <button
                onClick={() => removeRef(index)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                ×
              </button>
              <select
                value={img.role}
                onChange={(e) => changeRefRole(index, e.target.value as ReferenceImageRole)}
                className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[9px] text-white"
              >
                {(Object.keys(REFERENCE_ROLE_LABELS) as ReferenceImageRole[]).map((role) => (
                  <option key={role} value={role}>{REFERENCE_ROLE_LABELS[role]}</option>
                ))}
              </select>
            </div>
          ))}
          {referenceImages.length < 8 && (
            <button
              onClick={() => refInputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 transition-colors hover:border-brand-400 hover:text-brand-500"
            >
              <span className="text-xl">+</span>
              <span className="text-[10px]">参考图</span>
            </button>
          )}
        </div>
        <input
          ref={refInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleRefUpload}
          className="hidden"
        />
        <p className="mt-2 text-[10px] text-gray-400">
          造型=提取外形特征 · 配色=强制使用参考图颜色 · 材质=表面质感 · 风格=整体调性
        </p>
      </section>
      )}

      {/* 基础设置 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">基础设置</h2>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">产品名称（可选）</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="例如：桌面风扇"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-600">
              特殊需求 / 设计备注（可选）
            </label>
            <button
              onClick={handleAiWriteNotes}
              disabled={isAiWriting}
              className="flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-[10px] font-medium text-brand-600 hover:bg-brand-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAiWriting ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
                  AI 编写中...
                </>
              ) : (
                <>✦ AI 智能编写</>
              )}
            </button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="例如：必须保留圆形出风口；希望更年轻化；目标用户是女性；成本控制在50元以内..."
            rows={3}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <p className="mt-1 text-[10px] text-gray-400">AI 会优先遵循这些明确要求，最多 800 字</p>
        </div>

        {applicationMode === "appearance-redesign" && (
          <div>
            <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-gray-600">
              <span>重构比例</span>
              <span className="text-brand-600 font-semibold">{variation}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={variation}
              onChange={(e) => setVariation(Number(e.target.value))}
              className="w-full accent-brand-600"
            />
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>保守改款</span>
              <span>造型突破</span>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">生成数量</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  count === n ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 电商配置 - 仅商品套图/详情页模式 */}
      {applicationMode !== "appearance-redesign" && (
        <section className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">
            {applicationMode === "product-kit" ? "商品套图设置" : "详情页设置"}
          </h2>

          {/* 出图类型 - 仅商品套图模式 */}
          {applicationMode === "product-kit" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">出图类型</label>
              <div className="grid grid-cols-2 gap-2">
                {PRODUCT_KIT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setKitPreset(preset.value)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      kitPreset === preset.value
                        ? "border-brand-500 bg-brand-50"
                        : "border-gray-200 hover:border-brand-300"
                    }`}
                  >
                    <div className={`text-xs font-medium ${kitPreset === preset.value ? "text-brand-700" : "text-gray-700"}`}>
                      {preset.label}
                    </div>
                    <div className="mt-0.5 text-[10px] text-gray-400 line-clamp-1">{preset.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">电商平台</label>
              <select
                value={commercePlatform}
                onChange={(e) => setCommercePlatform(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {COMMERCE_PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">语言</label>
              <select
                value={commerceLocale}
                onChange={(e) => setCommerceLocale(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {COMMERCE_LOCALES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">分辨率</label>
              <select
                value={commerceResolution}
                onChange={(e) => setCommerceResolution(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {COMMERCE_RESOLUTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {applicationMode === "detail-page" && (
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">详情页风格</label>
                <select
                  value={detailStyle}
                  onChange={(e) => setDetailStyle(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {DETAIL_STYLES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">文案密度</label>
                <select
                  value={copyDensity}
                  onChange={(e) => setCopyDensity(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {COPY_DENSITIES.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-400">
            {applicationMode === "product-kit"
              ? "商品套图模式：保持产品外观不变，生成不同场景和角度的电商图"
              : "详情页模式：生成完整的电商详情页长图，包含首屏、卖点、功能、场景等模块"}
          </p>
        </section>
      )}

      {/* 设计方向 - 仅外观重构模式 */}
      {applicationMode === "appearance-redesign" && (
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">设计方向</h2>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplateId(t.id)}
              className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                templateId === t.id
                  ? "border-brand-500 bg-brand-50 text-brand-700 font-medium"
                  : "border-gray-200 text-gray-700 hover:border-brand-400 hover:bg-brand-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>
      )}

      {/* 分组批量生成 - 仅外观重构模式 */}
      {applicationMode === "appearance-redesign" && (
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">分组批量生成</h2>
          <button
            onClick={() => setBatchMode(!batchMode)}
            className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${batchMode ? "bg-brand-600" : "bg-gray-300"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${batchMode ? "left-[22px]" : "left-0.5"}`}
            />
          </button>
        </div>
        {batchMode && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-gray-500">一次生成多组不同参数的方案，自动顺序执行</p>
            {batchGroups.map((group, idx) => (
              <div
                key={group.id}
                className={`rounded-xl border p-3 transition-colors ${group.enabled ? "border-brand-200 bg-brand-50/50" : "border-gray-200 bg-gray-50 opacity-60"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setBatchGroups((prev) => prev.map((g, i) => i === idx ? { ...g, enabled: !g.enabled } : g))}
                      className={`h-4 w-4 rounded border-2 flex items-center justify-center ${group.enabled ? "border-brand-600 bg-brand-600" : "border-gray-300"}`}
                    >
                      {group.enabled && <span className="text-[10px] text-white">✓</span>}
                    </button>
                    <input
                      type="text"
                      value={group.name}
                      onChange={(e) => setBatchGroups((prev) => prev.map((g, i) => i === idx ? { ...g, name: e.target.value } : g))}
                      className="w-24 rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-900 focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => setBatchGroups((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    删除
                  </button>
                </div>
                {group.enabled && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] text-gray-500">设计方向</label>
                      <select
                        value={group.templateId}
                        onChange={(e) => setBatchGroups((prev) => prev.map((g, i) => i === idx ? { ...g, templateId: e.target.value } : g))}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none"
                      >
                        {TEMPLATES.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-gray-500">生成数量</label>
                      <select
                        value={group.count}
                        onChange={(e) => setBatchGroups((prev) => prev.map((g, i) => i === idx ? { ...g, count: parseInt(e.target.value) } : g))}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none"
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>{n}张</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-[10px] text-gray-500">重构比例</label>
                        <span className="text-[10px] font-medium text-brand-600">{group.variationLevel}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={group.variationLevel}
                        onChange={(e) => setBatchGroups((prev) => prev.map((g, i) => i === idx ? { ...g, variationLevel: parseInt(e.target.value) } : g))}
                        className="w-full accent-brand-600"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={() => setBatchGroups((prev) => [...prev, {
                id: `g${Date.now()}`,
                name: `新分组 ${prev.length + 1}`,
                enabled: true,
                templateId: "smart-auto",
                variationLevel: 65,
                count: 2,
                notes: "",
              }])}
              className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs text-gray-500 hover:border-brand-400 hover:text-brand-600"
            >
              + 添加分组
            </button>
          </div>
        )}
      </section>
      )}

      {/* 生成进度 */}
      {generation.isGenerating && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">生成进度</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{generation.message}</span>
              <span className="text-brand-600 font-medium">
                {generation.percent}% · {generation.completed}/{generation.total}张
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-all duration-300"
                style={{ width: `${Math.min(generation.percent, 100)}%` }}
              />
            </div>
            {generation.cards.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {generation.cards.map((card) => (
                  <div key={card.id} className="aspect-square overflow-hidden rounded-lg bg-gray-100">
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={card.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-gray-400">生成中...</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 错误提示 */}
      {generation.error && (
        <div className="rounded-xl bg-red-50 p-3 text-xs text-red-600">
          {generation.error}
        </div>
      )}

      {/* 生成按钮 */}
      {generation.isGenerating ? (
        <button
          onClick={handleCancel}
          className="w-full rounded-xl bg-red-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-red-500/25 transition-all active:scale-[0.98] hover:bg-red-600"
        >
          取消生成
        </button>
      ) : (
        <button
          onClick={batchMode ? handleBatchGenerate : handleGenerate}
          className="w-full rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center justify-center gap-2">
            <span>
              {applicationMode === "appearance-redesign"
                ? (batchMode ? `开始批量生成（${batchGroups.filter((g) => g.enabled).length}组）` : "开始生成")
                : applicationMode === "product-kit"
                ? "生成商品套图"
                : "生成详情页"}
            </span>
            {(() => {
              const hasCostConfig = costConfig.brainCostPerCall > 0 || costConfig.imageCostPerCall > 0;
              if (!hasCostConfig) return null;
              const estimatedCost = batchMode
                ? batchGroups.filter((g) => g.enabled).reduce((sum, g) => sum + estimateCost(g.count, costConfig), 0)
                : estimateCost(count, costConfig);
              return (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
                  预估 ¥{estimatedCost.toFixed(2)}
                </span>
              );
            })()}
          </div>
        </button>
      )}
    </div>
  );
}
