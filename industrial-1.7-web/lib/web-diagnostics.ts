type WebDiagnosticInput = {
  version: string;
  buildRevision: string;
  zoomPercent: number;
  update: { available: boolean; checking: boolean; applying: boolean; hasError: boolean };
};
type WebDiagnosticEnvironment = {
  userAgent: string;
  language: string;
  width: number;
  height: number;
  online: boolean;
  secureContext: boolean;
  directorySelection: boolean;
  speechRecognition: boolean;
};

/** Explicit allowlist: never serialize a session, URL, project or provider object. */
export function createWebDiagnostics(input: WebDiagnosticInput, environment: WebDiagnosticEnvironment) {
  const label = (value: string) => /^[a-zA-Z0-9._-]{1,80}$/.test(value) ? value : "unknown";
  const dimension = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100_000, Math.round(value))) : 0;
  return {
    formatVersion: 1,
    app: { version: label(input.version), buildRevision: label(input.buildRevision) },
    browser: {
      userAgent: environment.userAgent.slice(0, 1200),
      language: environment.language.slice(0, 80),
      viewport: { width: dimension(environment.width), height: dimension(environment.height) },
      online: environment.online === true,
      secureContext: environment.secureContext === true,
      directorySelection: environment.directorySelection === true,
      speechRecognition: environment.speechRecognition === true,
    },
    interface: { zoomPercent: Number.isFinite(input.zoomPercent) ? Math.max(80, Math.min(160, Math.round(input.zoomPercent))) : 100 },
    update: {
      available: input.update.available === true,
      checking: input.update.checking === true,
      applying: input.update.applying === true,
      hasError: input.update.hasError === true,
    },
  };
}
