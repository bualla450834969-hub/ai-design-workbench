export type AgentId =
  | "brief-director"
  | "concept-architect"
  | "appearance-variants"
  | "cmf-colorways"
  | "sketch-envelope"
  | "render-studio"
  | "local-retouch"
  | "multi-view"
  | "detail-view"
  | "free-chat";

export type AssetRole = "structure" | "style" | "scene" | "annotation" | "mask" | "brief" | "result";
export type AssetOrigin = "user" | "generated" | "annotation" | "result";
export type WorkflowKind = "shape" | "view" | "cmf" | "decal" | "scene";
export type GenerationMode = "source" | "reference" | "text" | "local";
export type Resolution = "1K" | "2K" | "4K";
export type AspectRatio = "auto" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
export type GenerationStage = "queued" | "planning" | "generating" | "saving" | "completed" | "failed" | "cancelled" | string;

export interface Asset {
  id: string;
  projectId: string;
  name: string;
  type: string;
  size: number;
  role: AssetRole;
  origin: AssetOrigin;
  url: string;
  createdAt: string;
  tags?: string[];
  sha256?: string;
  favorite?: boolean;
  note?: string;
  localSaveError?: string;
  nativeWidth?: number;
  nativeHeight?: number;
  exportWidth?: number;
  exportHeight?: number;
  upscaled?: boolean;
  annotationData?: string;
  projectFolder?: string;
  remoteSourceUrl?: string;
}

export interface ProjectWorkspaceState {
  selectedAssets?: string[];
  agentId?: AgentId;
  workflowKind?: WorkflowKind;
  specifiedAngle?: string;
  designDirections?: Record<string, string>;
  reconstructionRatio?: number;
  outputCount?: number;
  boardItems?: number;
  resolution?: Resolution;
  input?: string;
  generationMode?: GenerationMode;
  aspectRatio?: AspectRatio;
  workspaceMode?: "parameter" | "free-chat";
  freeChatInput?: string;
  freeChatSelectedAssets?: string[];
  freeResolution?: Resolution;
  freeAspectRatio?: AspectRatio;
  freeChatBoardItems?: number;
}

export interface ProjectCanvas {
  items: Array<{ assetId: string; x: number; y: number; width: number; height: number }>;
  viewport?: { x: number; y: number; zoom: number };
}

export interface Project {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  activeAgentId: AgentId;
  folderName?: string;
  cover?: string;
  userId?: string;
  workspaceState?: ProjectWorkspaceState;
  canvas?: ProjectCanvas;
  browserResultSequence?: number;
}

export interface UserSession {
  id: string;
  phone: string;
  name: string;
  role: "student" | "admin" | string;
  webLicenseBindingId?: string;
}

export interface GenerationVariant {
  index?: number;
  assetId?: string;
  prompt?: string;
  designRoute?: string;
  seed?: string | number;
}

export interface BillingEstimate {
  textModel?: string;
  imageModel?: string;
  textCost?: number;
  imageUnitCost?: number;
  baseImageUnitCost?: number;
  textAnalysisCalls?: number;
  imageCost?: number;
  totalCost?: number;
  currency?: string;
}

export interface GenerationResult {
  jobId: string;
  status?: string;
  direction?: string;
  durationMs?: number;
  billingEstimate?: BillingEstimate;
  designAnalysis?: unknown;
  provider?: string;
  model?: string;
  prompt?: string;
  imageUrls: string[];
  imageAssets?: Asset[];
  requestedCount?: number;
  deliveredCount?: number;
  savedCount?: number;
  note?: string;
  startedAt?: string;
  completedAt?: string;
  variants?: GenerationVariant[];
  requestSnapshot?: {
    endpoint?: string;
    content?: string;
    assetIds: string[];
    agentId?: AgentId;
    resolution?: Resolution;
    aspectRatio?: AspectRatio;
    boardItems?: number;
    settings?: Record<string, string | number | boolean>;
  };
  settingsSnapshot?: {
    agentId?: AgentId;
    workflowKind?: WorkflowKind;
    direction?: string;
    reconstructionRatio?: number;
    resolution?: Resolution;
    outputCount?: number;
    boardItems?: number;
    generationMode?: GenerationMode;
    aspectRatio?: AspectRatio;
    sourceAssetIds: string[];
    referenceAssetIds: string[];
  };
}

export interface Message {
  id: string;
  projectId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  jobId?: string;
  agentId?: AgentId;
  assets?: Asset[];
  generation?: GenerationResult;
}

export interface GenerationJob {
  id: string;
  userId: string;
  projectId: string;
  agentId: AgentId;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | string;
  progress: number;
  prompt: string;
  inputAssets: Asset[];
  createdAt: string;
  updatedAt: string;
  stage?: GenerationStage;
  stageLabel?: string;
  selectedAssetIds?: string[];
  idempotencyKey?: string;
  error?: string;
  recoveryAvailable?: boolean;
  estimatedRemainingSeconds?: number;
  totalOutputs?: number;
  completedOutputs?: number;
  result?: GenerationResult;
}

export interface RecycledProject {
  id: string;
  projectId: string;
  name: string;
  deletedAt: string;
  assetCount: number;
  resultCount: number;
  byteSize?: number;
  cleanupPending?: boolean;
}

export interface AgentSetting {
  key: string;
  label: string;
  type: "select" | "toggle" | string;
  defaultValue: string | boolean | number;
  options?: string[];
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  shortName: string;
  description: string;
  greeting: string;
  color: string;
  icon: string;
  inputHint: string;
  starterPrompts: string[];
  requiresImage: boolean;
  capabilities: string[];
  settings: AgentSetting[];
  version: string;
  systemPrompt: string;
}
