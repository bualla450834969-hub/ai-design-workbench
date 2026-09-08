import type {
  CommerceCopyDensity,
  CommerceDetailModule,
  CommerceDetailStyle,
  CommerceLocale,
  CommercePlatform
} from "../lib/commerce";

export type ReferenceImageInput = {
  dataUrl: string;
  name?: string;
  role?: ReferenceImageRole;
};

export type GeneratedImage = {
  base64?: string;
  url?: string;
  mimeType: string;
  /** Supplier task metadata used to reconcile a returned image with billing/logs. */
  providerTaskId?: string;
  providerTaskUrl?: string;
};

export type PlanReview = {
  overallScore: number;
  originalityScore: number;
  feasibilityScore: number;
  ecommerceScore: number;
  riskNote: string;
  nextStep: string;
};

export type EditableCommerceCopy = {
  headline: string;
  body: string;
  position: "left" | "right" | "top" | "bottom" | "center";
  locale: CommerceLocale;
  direction: "ltr" | "rtl";
};

export type ReferenceTransferMode = "finish" | "form" | "strong";
export type ReferenceImageRole = "auto" | "form" | "color" | "material" | "style";
export type OutputMode = "single" | "series";
export type FeasibilityMode = "balanced" | "production" | "low-cost" | "future";
export type StyleMode = "auto" | "premium" | "young" | "professional";
export type LocalEditIntent = "form" | "cmf" | "remove";

export type ProductPlanCard = {
  /** Zero-based position from the generation stream; used only to keep incremental local-save filenames stable. */
  streamIndex?: number;
  title: string;
  image: GeneratedImage;
  sellingPoints: string[];
  materialProcess: string;
  difference: string;
  channel: string;
  prompt: string;
  /** Design direction selected for the generation run that produced this card. */
  designDirectionLabel?: string;
  batchLabel?: string;
  batchVariationLabel?: string;
  variationLevel?: number;
  referenceBranchName?: string;
  referenceWeight?: number;
  transferMode?: ReferenceTransferMode;
  transferModeLabel?: string;
  /** Informational visual-review note. The supplier-return image is always preserved. */
  qualityWarning?: string;
  /** Detail-page copy remains editable and is composited in the browser at preview/export time. */
  editableCopy?: EditableCommerceCopy;
  review?: PlanReview;
};

export type GenerateRequest = {
  accessCode?: string;
  apiKey?: string;
  aiProvider?: string;
  customProviderName?: string;
  customProviderBaseUrl?: string;
  brainModel?: string;
  imageModel?: string;
  productName?: string;
  category?: string;
  templateId?: string;
  outputMode?: OutputMode;
  feasibilityMode?: FeasibilityMode;
  styleMode?: StyleMode;
  variationLevel?: number;
  notes?: string;
  count?: number;
  productImages?: ReferenceImageInput[];
  referenceImages?: ReferenceImageInput[];
  batchLabel?: string;
  batchVariationLabel?: string;
  referenceBranchName?: string;
  referenceWeight?: number;
  transferMode?: ReferenceTransferMode;
  transferModeLabel?: string;
  referenceRoleMode?: boolean;
  editRegionImage?: ReferenceImageInput;
  editRegionMask?: ReferenceImageInput;
  editRegionPatch?: ReferenceImageInput;
  editRegionPatchGuide?: ReferenceImageInput;
  editRegionPatchMask?: ReferenceImageInput;
  editRegionInstruction?: string;
  editRegionIntent?: LocalEditIntent;
  applicationMode?: "appearance-redesign" | "product-kit" | "detail-page";
  commercePlatform?: CommercePlatform;
  commerceLocale?: CommerceLocale;
  commerceResolution?: "standard" | "2K" | "4K";
  commerceDetailStyle?: CommerceDetailStyle;
  commerceCopyDensity?: CommerceCopyDensity;
  commerceDetailModules?: CommerceDetailModule[];
};

export type GenerateResponse = {
  cards: ProductPlanCard[];
  usedCount: number;
  templateLabel: string;
  providerLabel?: string;
  partialError?: string;
  requestedCount?: number;
  submittedImageRequests?: number;
};
