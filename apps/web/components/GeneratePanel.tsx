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
  ASPECT_RATIOS,
  DETAIL_STYLES,
  DETAIL_VISUAL_STYLES,
  COPY_DENSITIES,
  REFERENCE_ROLE_LABELS,
  LOCAL_EDIT_INTENT_LABELS,
  PRODUCT_KIT_PRESETS,
} from "@/constants";
import { fileToDataUrl, getProviderConfig, getDeviceId, addHistoryRecord, compressImageToThumbnail, loadCostConfig, estimateCost, getLicenseCode } from "@/utils";
import { isAutoSaveEnabled, saveResultsToDirectory } from "@/utils/file-save";
import LocalEditMask from "@/components/LocalEditMask";
import { compositeLocalEdit } from "@/utils/local-edit-composite";
import { useToast } from "@/components/Toast";

export default function GeneratePanel({
  generation,
  setGeneration,
  onComplete,
  onBatchComplete,
  pendingConfig,
  onConfigApplied,
  pendingProductImage,
  onProductImageApplied,
}: {
  generation: GenerationState;
  setGeneration: React.Dispatch<React.SetStateAction<GenerationState>>;
  onComplete: (cards: ResultCard[]) => void;
  onBatchComplete: (groups: BatchResultGroup[]) => void;
  pendingConfig: PendingGenerateConfig;
  onConfigApplied: () => void;
  pendingProductImage?: string | null;
  onProductImageApplied?: () => void;
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
  const [detailVisualStyle, setDetailVisualStyle] = useState("auto");
  const [copyDensity, setCopyDensity] = useState("balanced");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [kitPreset, setKitPreset] = useState("auto");
  const [imageSize, setImageSize] = useState<"standard" | "2K" | "4K">("standard");
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

  // 处理"以此为原图"功能：从历史/结果页跳转过来时自动加载图片
  useEffect(() => {
    if (pendingProductImage && onProductImageApplied) {
      // 下载图片并转成 base64
      (async () => {
        try {
          // 如果是代理URL，直接fetch
          const response = await fetch(pendingProductImage);
          const blob = await response.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            setProductImages((prev) => [...prev, { dataUrl, name: "从历史复用的图片.png" }]);
            showToast("已加载为原图", "success");
          };
          reader.readAsDataURL(blob);
        } catch (e) {
          showToast("加载图片失败", "error");
        }
        onProductImageApplied();
      })();
    }
  }, [pendingProductImage, onProductImageApplied]);

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
        // imageSize: imageSize !== 'standard' ? imageSize : undefined, // 临时禁用
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

    // 保存产品名称快照，避免生成过程中状态变化导致自动保存时名称丢失
    const productNameSnapshot = productName.trim();

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
          productName: productNameSnapshot || "未命名产品",
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

      // 自动保存到本地目录
      if (isAutoSaveEnabled()) {
        const allCards = allResults.flatMap((r) => r.cards);
        saveResultsToDirectory(allCards, productNameSnapshot || "未命名产品", "批量生成")
          .then(({ saved, total, error }) => {
            if (saved > 0) {
              showToast(`已保存 ${saved}/${total} 张图片到本地目录`, "success");
            } else {
              showToast(`自动保存失败：${error || "未知错误"}。请在设置页重新选择保存目录`, "error");
            }
          })
          .catch((err) => {
            console.error("自动保存失败:", err);
            showToast(`自动保存失败：${err.message || "未知错误"}`, "error");
          });
      }

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

    // 保存产品名称快照，避免生成过程中状态变化导致自动保存时名称丢失
    const productNameSnapshot = productName.trim();

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
          // imageSize: imageSize !== 'standard' ? imageSize : undefined, // 临时禁用
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
          commerceKitPreset: applicationMode === "product-kit" && kitPreset !== "auto" ? kitPreset : undefined,
          commercePlatform: applicationMode !== "appearance-redesign" ? commercePlatform : undefined,
          commerceLocale: applicationMode !== "appearance-redesign" ? commerceLocale : undefined,
          commerceResolution: applicationMode !== "appearance-redesign" ? commerceResolution : undefined,
          aspectRatio: applicationMode !== "appearance-redesign" ? aspectRatio : undefined,
          commerceDetailStyle: applicationMode === "detail-page" ? detailStyle : undefined,
          commerceDetailVisualStyle: applicationMode === "detail-page" && detailVisualStyle !== "auto" ? detailVisualStyle : undefined,
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
                productName: productNameSnapshot || "未命名产品",
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

              // 自动保存到本地目录
              if (isAutoSaveEnabled()) {
                saveResultsToDirectory(resultCards, productNameSnapshot || "未命名产品", templateLabel)
                  .then(({ saved, total, error }) => {
                    if (saved > 0) {
                      showToast(`已保存 ${saved}/${total} 张图片到本地目录`, "success");
                    } else {
                      showToast(`自动保存失败：${error || "未知错误"}。请在设置页重新选择保存目录`, "error");
                    }
                  })
                  .catch((err) => {
                    console.error("自动保存失败:", err);
                    showToast(`自动保存失败：${err.message || "未知错误"}`, "error");
                  });
              }

              // 局部改款像素恢复：蒙版外用原图覆盖
              let finalCards = resultCards;
              if (localEditEnabled && editRegionMask && productImages.length > 0) {
                try {
                  showToast("正在做局部像素恢复...", "info");
                  const originalImage = productImages[0].dataUrl;
                  const maskImage = editRegionMask;
                  
                  // 对每张结果做像素恢复
                  finalCards = await Promise.all(
                    resultCards.map(async (card) => {
                      if (!card.imageUrl) return card;
                      try {
                        const composite = await compositeLocalEdit(
                          originalImage,
                          card.imageUrl,
                          maskImage,
                          4
                        );
                        return { ...card, imageUrl: composite };
                      } catch (e) {
                        console.error("像素恢复失败:", e);
                        return card; // 失败就用原来的
                      }
                    })
                  );
                  showToast("局部像素恢复完成", "success");
                } catch (e) {
                  console.error("局部像素恢复处理失败:", e);
                  showToast("局部像素恢复失败，使用原图结果", "info");
                }
              }
              
              setGeneration((prev) => ({
                ...prev,
                isGenerating: false,
                phase: "done",
                message: "生成完成",
                percent: 100,
                completed: finalCards.length,
                cards: [...finalCards],
                context: genContext,
              }));
              onComplete(finalCards);
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120秒超时

    try {
      showToast("AI 正在分析图片，约需 30-60 秒...", "info");

      // 先压缩图片，避免请求体过大导致超时
      const compressedImages = await Promise.all(
        productImages.slice(0, 3).map(async (img) => {
          try {
            const compressed = await compressImageToThumbnail(img.dataUrl, 1024, 0.8);
            return { dataUrl: compressed };
          } catch {
            return { dataUrl: img.dataUrl };
          }
        })
      );

      const response = await fetch("/api/ai-write-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productImages: compressedImages,
          productName,
          apiKey: providerConfig.apiKey,
          provider: providerConfig.provider,
          brainModel: providerConfig.brainModel,
          baseUrl: providerConfig.baseUrl,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.notes) {
        setNotes(data.notes);
        showToast("AI 已生成设计需求", "success");
      } else {
        throw new Error("AI 返回内容为空");
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        showToast("AI 编写超时（超过120秒），请重试或检查网络", "error");
      } else {
        showToast(`AI 编写失败：${err.message}`, "error");
      }
    } finally {
      setIsAiWriting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 应用模式 Tab */}
      <div className="glass-card flex gap-1 rounded-2xl p-1.5">
        {APPLICATION_MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => setApplicationMode(mode.value)}
            className={`flex-1 rounded-xl px-3 py-2.5 text-center transition-all duration-200 ${
              applicationMode === mode.value
                ? "bg-white/15 text-white font-semibold"
                : "text-white/50 hover:text-white/80 hover:bg-white/5"
            }`}
          >
            <div className="text-xs">{mode.label}</div>
          </button>
        ))}
      </div>

      {/* 产品图片上传 */}
      <section className="glass-card rounded-2xl p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">产品图片</h2>
        <div className="grid grid-cols-3 gap-2">
          {productImages.map((img, index) => (
            <div key={index} className="relative aspect-square overflow-hidden rounded-lg border border-white/10">
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
              className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-white/20 text-white/40 hover:border-indigo-400/50 hover:text-indigo-300 transition-all"
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
        <p className="mt-2 text-[10px] text-white/40">最多 5 张，建议包含正面、侧面、细节</p>
      </section>

      {/* 局部改款 - 仅外观重构模式 */}
      {applicationMode === "appearance-redesign" && (
        <section className="glass-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">局部改款（可选）</h2>
              {productImages.length === 0 && (
                <p className="mt-0.5 text-[10px] text-white/40">请先上传产品图片后再使用</p>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-white/50">{localEditEnabled ? "已开启" : "关闭"}</span>
              <button
                onClick={() => {
                  setLocalEditEnabled(!localEditEnabled);
                  if (localEditEnabled) {
                    setEditRegionMask(null);
                    setEditRegionGuide(null);
                  }
                }}
                disabled={productImages.length === 0}
                className={`relative h-5 w-9 rounded-full transition-colors ${localEditEnabled ? "bg-indigo-500/80" : "bg-white/20"} disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${localEditEnabled ? "left-[calc(100%-18px)]" : "left-[2px]"}`}
                />
              </button>
            </label>
          </div>

          {localEditEnabled && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/70">修改类型</label>
                <div className="flex gap-2">
                  {(Object.keys(LOCAL_EDIT_INTENT_LABELS) as LocalEditIntent[]).map((intent) => (
                    <button
                      key={intent}
                      onClick={() => setEditRegionIntent(intent)}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                        editRegionIntent === intent
                          ? "bg-indigo-500/80 text-white"
                          : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
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
                <label className="mb-1.5 block text-xs font-medium text-white/70">
                  修改说明（可选）
                </label>
                <input
                  type="text"
                  value={editRegionInstruction}
                  onChange={(e) => setEditRegionInstruction(e.target.value)}
                  placeholder="例如：把这个按钮换成旋钮；把这个区域改成金属质感"
                  className="input-field w-full rounded-lg px-3 py-2 text-sm"
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

      {/* 设计参考图 - 所有模式都显示 */}
      <section className="glass-card rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">设计参考图（可选）</h2>
          <span className="text-[10px] text-white/40">最多 8 张，可指定参考类型</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {referenceImages.map((img, index) => (
            <div key={index} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10">
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
              className="flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/20 text-white/40 transition-all hover:border-indigo-400/50 hover:text-indigo-300"
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
        <p className="mt-2 text-[10px] text-white/40">
          造型=提取外形特征 · 配色=强制使用参考图颜色 · 材质=表面质感 · 风格=整体调性
        </p>
      </section>

      {/* 基础设置 */}
      <section className="glass-card rounded-2xl p-4 space-y-4">
        <h2 className="text-sm font-semibold text-white">基础设置</h2>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/70">产品名称（可选）</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="例如：桌面风扇"
            className="input-field w-full rounded-lg px-3 py-2.5 text-sm"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium text-white/70">
              特殊需求 / 设计备注（可选）
            </label>
            <button
              onClick={handleAiWriteNotes}
              disabled={isAiWriting}
              className="flex items-center gap-1 rounded-md bg-indigo-500/20 px-2 py-1 text-[10px] font-medium text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isAiWriting ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-300/50 border-t-indigo-400" />
                  AI 分析中...
                </>
              ) : (
                <>✦ AI 整理需求</>
              )}
            </button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="例如：必须保留圆形出风口；希望更年轻化；目标用户是女性；成本控制在50元以内..."
            rows={3}
            className="input-field w-full resize-none rounded-lg px-3 py-2.5 text-sm"
          />
          <p className="mt-1 text-[10px] text-white/40">AI 会优先遵循这些明确要求，最多 800 字</p>
        </div>

        {applicationMode === "appearance-redesign" && (
          <div>
            <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-white/70">
              <span>重构比例</span>
              <span className="text-indigo-400 font-semibold">{variation}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={variation}
              onChange={(e) => setVariation(Number(e.target.value))}
              className="w-full"
            />
            <div className="mt-1 flex justify-between text-[10px] text-white/40">
              <span>保守改款</span>
              <span>造型突破</span>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/70">生成数量</label>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 6, 7, 10, 20, 50, 100].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  count === n ? "bg-indigo-500/80 text-white" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* 分辨率选择 */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/70">输出分辨率</label>
          <div className="flex gap-2">
            {COMMERCE_RESOLUTIONS.map((res) => (
              <button
                key={res.value}
                onClick={() => setImageSize(res.value as "standard" | "2K" | "4K")}
                className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                  imageSize === res.value ? "bg-indigo-500/80 text-white" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                {res.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-white/40">分辨率越高，生成时间越长，费用越高</p>
        </div>
      </section>

      {/* 电商配置 - 仅商品套图/详情页模式 */}
      {applicationMode !== "appearance-redesign" && (
        <section className="glass-card rounded-2xl p-4 space-y-4">
          <h2 className="text-sm font-semibold text-white">
            {applicationMode === "product-kit" ? "商品套图设置" : "详情页设置"}
          </h2>

          {/* 出图类型 - 仅商品套图模式 */}
          {applicationMode === "product-kit" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/70">出图类型</label>
              <div className="grid grid-cols-2 gap-2">
                {PRODUCT_KIT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => {
                      setKitPreset(preset.value);
                      // 选择六视图时自动调整生成数量为7（6视图+纯正交正面主图）
                      if (preset.value === "six-view") {
                        setCount(7);
                      }
                    }}
                    className={`rounded-lg border px-3 py-2 text-left transition-all ${
                      kitPreset === preset.value
                        ? "border-indigo-400/50 bg-indigo-500/20"
                        : "border-white/10 hover:border-white/20 bg-white/[0.03]"
                    }`}
                  >
                    <div className={`text-xs font-medium ${kitPreset === preset.value ? "text-white" : "text-white/70"}`}>
                      {preset.label}
                    </div>
                    <div className="mt-0.5 text-[10px] text-white/40 line-clamp-1">{preset.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/70">电商平台</label>
              <select
                value={commercePlatform}
                onChange={(e) => setCommercePlatform(e.target.value)}
                className="input-field w-full rounded-lg px-3 py-2.5 text-sm"
              >
                {COMMERCE_PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/70">语言</label>
              <select
                value={commerceLocale}
                onChange={(e) => setCommerceLocale(e.target.value)}
                className="input-field w-full rounded-lg px-3 py-2.5 text-sm"
              >
                {COMMERCE_LOCALES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/70">分辨率</label>
              <select
                value={commerceResolution}
                onChange={(e) => setCommerceResolution(e.target.value)}
                className="input-field w-full rounded-lg px-3 py-2.5 text-sm"
              >
                {COMMERCE_RESOLUTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-3">
              <label className="mb-1 block text-xs font-medium text-white/70">图片比例</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="input-field w-full rounded-lg px-3 py-2.5 text-sm"
              >
                {ASPECT_RATIOS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}（{r.desc}）</option>
                ))}
              </select>
            </div>
          </div>

          {applicationMode === "detail-page" && (
            <>
              <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/70">详情页风格</label>
                  <select
                    value={detailStyle}
                    onChange={(e) => setDetailStyle(e.target.value)}
                    className="input-field w-full rounded-lg px-3 py-2.5 text-sm"
                  >
                    {DETAIL_STYLES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/70">文案密度</label>
                  <select
                    value={copyDensity}
                    onChange={(e) => setCopyDensity(e.target.value)}
                    className="input-field w-full rounded-lg px-3 py-2.5 text-sm"
                  >
                    {COPY_DENSITIES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 视觉风格选择 */}
              <div className="mt-4 border-t border-white/10 pt-4">
                <label className="mb-2 block text-xs font-medium text-white/70">视觉风格</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {DETAIL_VISUAL_STYLES.map((style) => (
                    <button
                      key={style.value}
                      onClick={() => setDetailVisualStyle(style.value)}
                      className={`rounded-lg border px-3 py-2 text-left transition-all ${
                        detailVisualStyle === style.value
                          ? "border-indigo-400/50 bg-indigo-500/20"
                          : "border-white/10 hover:border-white/20 bg-white/[0.03]"
                      }`}
                    >
                      <div className={`text-xs font-medium ${detailVisualStyle === style.value ? "text-white" : "text-white/70"}`}>
                        {style.label}
                      </div>
                      <div className="mt-0.5 text-[10px] text-white/40 line-clamp-1">{style.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <p className="text-[10px] text-white/40">
            {applicationMode === "product-kit"
              ? "商品套图模式：保持产品外观不变，生成不同场景和角度的电商图"
              : "详情页模式：生成完整的电商详情页长图，包含首屏、卖点、功能、场景等模块"}
          </p>
        </section>
      )}

      {/* 设计方向 - 仅外观重构模式 */}
      {applicationMode === "appearance-redesign" && (
      <section className="glass-card rounded-2xl p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">设计方向</h2>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplateId(t.id)}
              className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-all ${
                templateId === t.id
                  ? "border-indigo-400/50 bg-indigo-500/20 text-white font-medium"
                  : "border-white/10 text-white/60 hover:border-white/20 hover:bg-white/5 hover:text-white/80"
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
      <section className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">分组批量生成</h2>
          <button
            onClick={() => setBatchMode(!batchMode)}
            className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${batchMode ? "bg-indigo-500/80" : "bg-white/20"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${batchMode ? "left-[22px]" : "left-0.5"}`}
            />
          </button>
        </div>
        {batchMode && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-white/50">一次生成多组不同参数的方案，自动顺序执行</p>
            {batchGroups.map((group, idx) => (
              <div
                key={group.id}
                className={`rounded-xl border p-3 transition-all ${group.enabled ? "border-indigo-400/30 bg-indigo-500/10" : "border-white/10 bg-white/[0.02] opacity-60"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setBatchGroups((prev) => prev.map((g, i) => i === idx ? { ...g, enabled: !g.enabled } : g))}
                      className={`h-4 w-4 rounded border-2 flex items-center justify-center ${group.enabled ? "border-indigo-400 bg-indigo-500/80" : "border-white/30"}`}
                    >
                      {group.enabled && <span className="text-[10px] text-white">✓</span>}
                    </button>
                    <input
                      type="text"
                      value={group.name}
                      onChange={(e) => setBatchGroups((prev) => prev.map((g, i) => i === idx ? { ...g, name: e.target.value } : g))}
                      className="input-field w-24 rounded px-2 py-1 text-xs font-medium"
                    />
                  </div>
                  <button
                    onClick={() => setBatchGroups((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-xs text-white/40 hover:text-red-500"
                  >
                    删除
                  </button>
                </div>
                {group.enabled && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] text-white/50">设计方向</label>
                      <select
                        value={group.templateId}
                        onChange={(e) => setBatchGroups((prev) => prev.map((g, i) => i === idx ? { ...g, templateId: e.target.value } : g))}
                        className="input-field w-full rounded-lg px-2 py-1.5 text-xs"
                      >
                        {TEMPLATES.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-white/50">生成数量</label>
                      <select
                        value={group.count}
                        onChange={(e) => setBatchGroups((prev) => prev.map((g, i) => i === idx ? { ...g, count: parseInt(e.target.value) } : g))}
                        className="input-field w-full rounded-lg px-2 py-1.5 text-xs"
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>{n}张</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-[10px] text-white/50">重构比例</label>
                        <span className="text-[10px] font-medium text-indigo-400">{group.variationLevel}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={group.variationLevel}
                        onChange={(e) => setBatchGroups((prev) => prev.map((g, i) => i === idx ? { ...g, variationLevel: parseInt(e.target.value) } : g))}
                        className="w-full"
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
              className="w-full rounded-lg border border-dashed border-white/20 py-2 text-xs text-white/50 hover:border-indigo-400/50 hover:text-indigo-300 transition-all"
            >
              + 添加分组
            </button>
          </div>
        )}
      </section>
      )}

      {/* 生成进度 */}
      {generation.isGenerating && (
        <section className="glass-card rounded-2xl p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">生成进度</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/70">{generation.message}</span>
              <span className="text-indigo-400 font-medium">
                {generation.percent}% · {generation.completed}/{generation.total}张
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-300"
                style={{ width: `${Math.min(generation.percent, 100)}%` }}
              />
            </div>
            {generation.cards.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {generation.cards.map((card) => (
                  <div key={card.id} className="aspect-square overflow-hidden rounded-lg bg-white/10">
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={card.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-white/40">生成中...</div>
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
          className="w-full rounded-xl bg-red-500/80 backdrop-blur py-3.5 text-sm font-semibold text-white border border-red-400/30 transition-all active:scale-[0.98] hover:bg-red-500/90"
        >
          取消生成
        </button>
      ) : (
        <button
          onClick={batchMode ? handleBatchGenerate : handleGenerate}
          className="btn-primary w-full rounded-xl py-3.5 text-sm font-semibold"
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
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">
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
