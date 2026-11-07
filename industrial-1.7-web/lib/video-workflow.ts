import type { Asset } from "@/types/domain";
import type { VideoPurpose } from "@/lib/video-types";

export const VIDEO_WORKFLOW_DIRECTIONS = ["360°产品展示", "使用场景展示"] as const;

export function videoWorkflowPurpose(direction: string): VideoPurpose {
  return direction === "使用场景展示" ? "scene" : "showcase";
}

/** Resolves only the explicitly selected product original, never a reference or old result fallback. */
export function parameterVideoTarget(input: { projectId: string; desktopAvailable: boolean; uploading: boolean; maintenanceBusy: boolean; asset?: Asset; direction: string }) {
  if (!input.desktopAvailable) return { error: "视频生成目前仅在 Windows 和 Mac 桌面版开放，请在桌面软件中使用。" } as const;
  if (input.uploading) return { error: "请等待产品图片上传完成后再生成视频。" } as const;
  if (input.maintenanceBusy) return { error: "正在维护项目数据，请稍后再生成视频。" } as const;
  const asset = input.asset;
  if (!input.projectId || !asset || asset.projectId !== input.projectId || !asset.type.startsWith("image/") || !["structure", "result"].includes(asset.role)) {
    return { error: "请先在“产品原图”中上传或选择一张产品图片。" } as const;
  }
  if (asset.localSaveError) return { error: "产品原图尚未保存成功，请重新上传图片后再生成视频。" } as const;
  return { asset, purpose: videoWorkflowPurpose(input.direction) } as const;
}
