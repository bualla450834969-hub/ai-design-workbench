export type VideoMotion = "orbit-360" | "orbit-180" | "push-in" | "slide" | "subtle-turn";

// Introduction is retained only for reading pre-1.8.4 task records.
export type VideoPurpose = "showcase" | "scene" | "introduction";

export interface VideoSceneOptions {
  usageScene?: string;
  functionDescription?: string;
}

export const VIDEO_SCENE_LIMITS = { usageScene: 200, functionDescription: 300 } as const;

export interface VideoIntroductionOptions {
  productName?: string;
  sellingPoint?: string;
  usageScene?: string;
  narration?: string;
}

export const VIDEO_INTRODUCTION_LIMITS = { productName: 80, sellingPoint: 300, usageScene: 200, narration: 80 } as const;
export const VIDEO_INTRODUCTION_NARRATION_LIMITS = { 5: 18, 10: 40 } as const;

export const VIDEO_MOTION_LABELS: Record<VideoMotion, string> = {
  "orbit-360": "360°产品环绕",
  "orbit-180": "前侧到后侧环绕（180°）",
  "push-in": "缓慢推近",
  slide: "轻微侧移",
  "subtle-turn": "小角度环绕",
};
export type VideoJobStatus = "submitting" | "queued" | "running" | "saving" | "succeeded" | "failed" | "needs-review";

export interface VideoJob {
  id: string;
  projectId: string;
  sourceAssetId: string;
  sourceName: string;
  duration: number;
  resolution?: number;
  providerId?: string;
  providerType?: string;
  providerName?: string;
  motion: VideoMotion;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  // Older saved jobs have no purpose and are treated as product showcases.
  purpose?: VideoPurpose;
  introduction?: VideoIntroductionOptions;
  scene?: VideoSceneOptions;
  model: string;
  status: VideoJobStatus;
  createdAt: string;
  updatedAt: string;
  supplierTaskId?: string;
  sourceImageVerified?: boolean;
  audioTrackDetected?: boolean;
  warning?: string;
  error?: string;
  failureStage?: "query" | "download" | "save";
  canRetrySave?: boolean;
  retryCount?: number;
  url?: string;
}
