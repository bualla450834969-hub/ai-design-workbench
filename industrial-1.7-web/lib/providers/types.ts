import type { AgentId, Asset, GenerationStage } from "@/types/domain";

export interface DesignPlan {
  analysisSummary: string;
  productCategory: string;
  coreFunctions: string[];
  mandatoryConstraints: string[];
  mutableFeatures: string[];
  styleFingerprint: string[];
  negativeStyleConstraints: string[];
  variantDirections: string[];
}

export interface GenerationProgress {
  stage: GenerationStage;
  label: string;
  completed?: number;
  total?: number;
}

export interface ProviderContext {
  agentId: AgentId;
  systemPrompt: string;
  userPrompt: string;
  assets?: Asset[];
  settings?: Record<string, string | number | boolean>;
  signal?: AbortSignal;
  designPlan?: DesignPlan;
  onProgress?: (progress: GenerationProgress) => void;
}

export interface TextOutput {
  text: string;
  provider: string;
  model: string;
}

export interface ImageOutput {
  imageUrls: string[];
  provider: string;
  model: string;
  failureSummary?: string;
  revisedPrompt?: string;
  variants?: Array<{ prompt: string; designRoute: string; seed?: string | number }>;
}

export interface TextProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateText(context: ProviderContext): Promise<TextOutput>;
}

export interface ImageProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateImages(context: ProviderContext, count: number): Promise<ImageOutput>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
