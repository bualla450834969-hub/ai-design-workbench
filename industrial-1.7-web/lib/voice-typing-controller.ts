export type VoiceInputOrigin = "parameter" | "free-chat";
export type VoiceTypingPhase = "pending" | "requested" | "failed";
export type VoiceTypingState = { origin: VoiceInputOrigin; phase: VoiceTypingPhase } | null;
type VoiceTypingHandlers = {
  invoke: (request: { action: "start" | "stop" }) => Promise<DesktopVoiceTypingResult>;
  onState: (state: VoiceTypingState) => void;
  onHint: (hint: string) => void;
};

/** Only coordinates OS requests. It never reads, appends or deduplicates text. */
export function createVoiceTypingController() {
  let pending = false;
  let requestedOrigin: VoiceInputOrigin | null = null;
  let pendingRequest: Promise<void> | null = null;
  let queuedStop: Promise<void> | null = null;
  let revision = 0;
  function perform(action: "start" | "stop", targetOrigin: VoiceInputOrigin, input: VoiceTypingHandlers & { focus?: () => void }): Promise<void> {
    const requestRevision = revision;
    pending = true;
    input.onState({ origin: targetOrigin, phase: "pending" });
    input.onHint(action === "stop" ? "正在结束系统听写…" : "正在唤起系统听写…");
    const request = (async () => {
      try {
        if (action === "start") input.focus?.();
        const result = await input.invoke({ action });
        if (requestRevision !== revision) return;
        if (result.sessionRequested) requestedOrigin = targetOrigin;
        if (result.stopped) requestedOrigin = null;
        if (result.stopped) input.onState(null);
        else if (result.requestSent || result.shortcutSent || result.status === "session-requested") input.onState({ origin: targetOrigin, phase: "requested" });
        else input.onState({ origin: targetOrigin, phase: "failed" });
        input.onHint(result.message);
      } catch (reason) {
        if (requestRevision !== revision) return;
        input.onState({ origin: targetOrigin, phase: "failed" });
        input.onHint(reason instanceof Error ? reason.message : "系统听写未能切换，请查看系统听写状态。");
      } finally {
        pending = false;
      }
    })();
    pendingRequest = request;
    void request.then(() => { if (pendingRequest === request) pendingRequest = null; });
    return request;
  }
  return {
    requestedOrigin: () => requestedOrigin,
    pending: () => pending,
    synchronizeStopped(onState: VoiceTypingHandlers["onState"]) {
      revision++;
      requestedOrigin = null;
      onState(null);
    },
    synchronizeRequested(origin: VoiceInputOrigin, onState: VoiceTypingHandlers["onState"]) {
      revision++;
      requestedOrigin = origin;
      onState({ origin, phase: "requested" });
    },
    async toggle(origin: VoiceInputOrigin, input: VoiceTypingHandlers & { focus: () => void }): Promise<void> {
      if (pending || queuedStop) return;
      // Finish an existing session first, even if the other composer was
      // clicked. Do not move its IME target or restart into another field.
      await perform(requestedOrigin ? "stop" : "start", requestedOrigin || origin, input);
    },
    async stop(input: VoiceTypingHandlers): Promise<void> {
      if (queuedStop) return queuedStop;
      // A context change can arrive while the OS helper is starting. Wait for
      // it, then close the old session before another field may request one.
      const stop = (async () => {
        if (pendingRequest) await pendingRequest;
        if (requestedOrigin) await perform("stop", requestedOrigin, input);
      })();
      queuedStop = stop;
      void stop.then(() => { if (queuedStop === stop) queuedStop = null; });
      return stop;
    },
  };
}
