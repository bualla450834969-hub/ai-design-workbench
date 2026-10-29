type DesktopProviderType = "geekai" | "apiyi" | "aihubmix" | "openai-compatible";

interface ModelCheckStatus {
  status: "verified" | "untested" | "incompatible" | "failed" | string;
  lastTestedAt?: string;
  reason?: string;
}

interface DesktopProviderDraft {
  id: string;
  name: string;
  type: DesktopProviderType;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  workspaceId: string;
  modelCatalog: string[];
  modelVerifications: Record<string, ModelCheckStatus>;
  enabled: boolean;
  apiKey?: string;
}

interface DesktopProvider {
  id: string;
  name: string;
  type: DesktopProviderType;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  workspaceId: string;
  modelCatalog: string[];
  modelVerifications: Record<string, ModelCheckStatus>;
  enabled: boolean;
  hasApiKey: boolean;
  keyHint: string;
  imageModelStatuses: Record<string, ModelCheckStatus>;
}

interface DesktopProviderSaveResult {
  providers: DesktopProvider[];
  restarting: boolean;
}

interface DesktopProviderTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  model: string;
}

interface DesktopVoiceTypingResult {
  sessionRequested?: boolean;
  stopped?: boolean;
  requestSent?: boolean;
  shortcutSent?: boolean;
  status?: string;
  message: string;
}

declare module "pdf-parse" {
  export class PDFParse {
    constructor(options: { data: Uint8Array });
    getText(): Promise<{ text: string }>;
    destroy(): Promise<void>;
  }
}

declare module "mammoth" {
  export function extractRawText(input: { buffer: Buffer }): Promise<{ value: string }>;
}

declare module "postgres" {
  interface PostgresSql {
    begin<T>(isolation: string, fn: (tx: PostgresSql) => Promise<T>): Promise<T>;
    end(options?: { timeout?: number }): Promise<void>;
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<Array<{ bytes?: number | null; value?: unknown }>>;
  }
  function postgres(connectionString: string, options?: Record<string, unknown>): PostgresSql;
  export default postgres;
  export type Sql = PostgresSql;
}

interface DesktopApi {
  activateLicense(input: { code: string; userName?: string }): Promise<unknown>;
  openExternal(url: string): Promise<void>;
  listProviders?(): Promise<DesktopProvider[]>;
  loadProviderModels?(draft: DesktopProviderDraft): Promise<string[]>;
  testTextProvider?(draft: DesktopProviderDraft): Promise<DesktopProviderTestResult>;
  saveProvider?(draft: DesktopProviderDraft): Promise<DesktopProviderSaveResult>;
  activateProvider?(id: string): Promise<DesktopProviderSaveResult>;
  deleteProvider?(id: string): Promise<DesktopProviderSaveResult>;
}

interface Window {
  desktopAPI?: DesktopApi;
}

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
