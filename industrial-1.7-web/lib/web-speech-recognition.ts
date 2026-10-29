import type { VoiceInputOrigin } from "@/lib/voice-typing-controller";

export type WebSpeechState = { origin: VoiceInputOrigin; phase: "starting" | "listening" | "stopping"; listening: boolean } | null;

export function webSpeechButtonStatus(state: WebSpeechState, origin: VoiceInputOrigin, supported: boolean | null) {
  const current = state?.origin === origin ? state : null;
  const phase = current?.phase || null;
  const pending = phase === "starting" || phase === "stopping";
  const label = phase === "starting" ? "取消启动语音输入"
    : phase === "stopping" ? "正在结束语音输入"
      : current ? "结束语音输入"
        : supported === false ? "使用系统键盘听写" : "启动语音输入";
  return { phase, pending, requested: Boolean(current), listening: Boolean(current?.listening && phase === "listening"), label };
}
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechResultEvent = { resultIndex: number; results: { length: number; [index: number]: SpeechResult } };

/** Only the interoperable portion of the browser-owned Web Speech interface. */
export type BrowserSpeechRecognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onstart: (() => void) | null; onaudiostart: (() => void) | null; onaudioend: (() => void) | null;
  onend: (() => void) | null; onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null; onnomatch: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
export type BrowserSpeechConstructor = new () => BrowserSpeechRecognition;
type BrowserSpeechScope = { isSecureContext?: boolean; SpeechRecognition?: BrowserSpeechConstructor; webkitSpeechRecognition?: BrowserSpeechConstructor };

export const SYSTEM_KEYBOARD_DICTATION_HINT = "请点输入框，使用系统键盘上的麦克风听写。网页不能开关系统听写。";

export function browserSpeechCapability(scope: BrowserSpeechScope | null = typeof window === "undefined" ? null : window as unknown as BrowserSpeechScope) {
  const constructor = scope?.SpeechRecognition || scope?.webkitSpeechRecognition;
  if (!scope || scope.isSecureContext !== true || typeof constructor !== "function") return { supported: false as const, constructor: null, hint: `当前浏览器不支持直接听写。${SYSTEM_KEYBOARD_DICTATION_HINT}` };
  return { supported: true as const, constructor, hint: "使用浏览器语音服务听写；需要允许麦克风访问。" };
}

function errorHint(error: string) {
  if (["not-allowed", "service-not-allowed"].includes(error)) return `未获得浏览器麦克风或语音识别权限，请在浏览器设置中允许。${SYSTEM_KEYBOARD_DICTATION_HINT}`;
  if (error === "audio-capture") return `未能使用麦克风，请检查设备或其他应用是否占用。${SYSTEM_KEYBOARD_DICTATION_HINT}`;
  if (error === "network") return `浏览器语音服务连接失败，请检查网络。${SYSTEM_KEYBOARD_DICTATION_HINT}`;
  if (error === "no-speech") return "没有识别到语音，请再点麦克风重试，或使用系统键盘听写。";
  if (error === "language-not-supported") return `当前浏览器语音服务不支持此语言。${SYSTEM_KEYBOARD_DICTATION_HINT}`;
  return `浏览器听写未完成，请重新尝试。${SYSTEM_KEYBOARD_DICTATION_HINT}`;
}

/** No OS shortcuts, audio upload endpoint, model calls or automatic restarts. */
export function createWebSpeechController(input: {
  capability?: () => ReturnType<typeof browserSpeechCapability>;
  onState: (state: WebSpeechState) => void;
  onText: (origin: VoiceInputOrigin, text: string) => void;
  onHint: (hint: string) => void;
  focus: (origin: VoiceInputOrigin) => void;
}) {
  let recognition: BrowserSpeechRecognition | null = null;
  let state: WebSpeechState = null;
  let revision = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const update = (next: WebSpeechState) => {
    if (state === next || state && next && state.origin === next.origin && state.phase === next.phase && state.listening === next.listening) return;
    state = next; input.onState(next);
  };
  const starting = () => state?.phase === "starting";
  const clearTimeoutIfAny = () => { if (timeout) clearTimeout(timeout); timeout = undefined; };

  function cancel(notify = true) {
    revision++; clearTimeoutIfAny();
    const previous = recognition; recognition = null; state = null;
    try { previous?.abort(); } catch { /* Already ended. */ }
    if (notify) input.onState(null);
  }

  function stop() {
    if (!recognition || !state || state.phase === "stopping") return;
    if (state.phase === "starting") { cancel(); input.onHint("已取消开始听写。"); return; }
    const currentRevision = revision;
    const previous = recognition;
    update({ ...state, phase: "stopping" });
    input.onHint("正在结束浏览器听写，等待最后的识别文字…");
    try { previous.stop(); }
    catch { cancel(); input.onHint(`未能正常结束浏览器听写，已取消此次识别。${SYSTEM_KEYBOARD_DICTATION_HINT}`); return; }
    if (revision !== currentRevision || recognition !== previous) return;
    timeout = setTimeout(() => { if (revision !== currentRevision) return; cancel(); input.onHint("此次浏览器听写已结束，已识别的文字保留。"); }, 5000);
  }

  function toggle(origin: VoiceInputOrigin) {
    // A second composer click finishes the original session without moving text.
    if (recognition || state) { stop(); return; }
    const capability = (input.capability || browserSpeechCapability)();
    input.focus(origin);
    if (!capability.supported) { input.onHint(capability.hint); return; }
    const currentRevision = ++revision;
    const isCurrent = () => revision === currentRevision && recognition === current;
    let current: BrowserSpeechRecognition;
    const handled = new Set<number>();
    let hadError = false;
    try {
      current = new capability.constructor(); recognition = current;
      current.lang = "zh-CN"; current.continuous = true; current.interimResults = false; current.maxAlternatives = 1;
      current.onstart = current.onaudiostart = () => {
        if (!isCurrent() || state?.phase === "stopping") return;
        if (state?.phase === "listening" && state.listening) return;
        clearTimeoutIfAny(); update({ origin, phase: "listening", listening: true });
        input.onHint("浏览器正在听写，再点麦克风结束。");
      };
      current.onaudioend = () => { if (isCurrent() && state) update({ ...state, listening: false }); };
      current.onresult = (event) => {
        if (!isCurrent() || hadError) return;
        const final: string[] = [];
        for (let index = event.resultIndex; index < event.results.length; index++) {
          const result = event.results[index];
          if (!result?.isFinal || handled.has(index)) continue;
          handled.add(index);
          const text = result[0]?.transcript?.trim(); if (text) final.push(text);
        }
        if (final.length) input.onText(origin, final.join(" "));
      };
      current.onnomatch = () => { if (isCurrent()) input.onHint("没有识别出文字，请说清楚一些或使用系统键盘听写。"); };
      current.onerror = (event) => {
        if (!isCurrent()) return;
        hadError = true;
        const message = event.error === "aborted" ? "此次浏览器听写已取消。" : errorHint(event.error || "");
        cancel(); input.onHint(message);
      };
      current.onend = () => {
        if (!isCurrent()) return;
        clearTimeoutIfAny(); recognition = null; update(null);
        if (!hadError) input.onHint("浏览器听写已结束，已识别的文字保留。");
      };
      update({ origin, phase: "starting", listening: false });
      input.onHint("正在请求浏览器听写，请允许麦克风访问…");
      current.start();
      if (isCurrent() && starting()) timeout = setTimeout(() => {
        if (!isCurrent()) return;
        cancel(); input.onHint(`浏览器听写未能启动，请检查麦克风权限或网络。${SYSTEM_KEYBOARD_DICTATION_HINT}`);
      }, 15_000);
    } catch { cancel(); input.onHint(`当前浏览器未能启动听写。${SYSTEM_KEYBOARD_DICTATION_HINT}`); }
  }

  return { toggle, stop, cancel, dispose: () => cancel(false), getState: () => state };
}
