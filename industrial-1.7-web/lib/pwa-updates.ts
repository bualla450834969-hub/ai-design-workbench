type Options = {
  container: ServiceWorkerContainer;
  scriptUrl: string;
  scope: string;
  onAvailable: () => void;
  onApplying: (applying: boolean) => void;
  reload: () => void;
};

/** Controller changes in other tabs never reload this page without its own click. */
export function createPwaUpdateManager(options: Options) {
  let registration: ServiceWorkerRegistration | null = null;
  let waiting: ServiceWorker | null = null;
  let controlled = Boolean(options.container.controller);
  let requested = false;
  let disposed = false;
  let starting: Promise<void> | null = null;
  let checking: Promise<void> | null = null;
  const cleanup: (() => void)[] = [];
  const noticeWaiting = () => {
    if (disposed) return;
    waiting = registration?.waiting || null;
    if (waiting && options.container.controller) options.onAvailable();
  };
  const watchInstalling = () => {
    const installing = registration?.installing;
    if (!installing) return;
    const changed = () => { if (installing.state === "installed") noticeWaiting(); };
    installing.addEventListener("statechange", changed);
    cleanup.push(() => installing.removeEventListener("statechange", changed));
  };
  const controllerChanged = () => {
    const wasControlled = controlled;
    controlled = Boolean(options.container.controller);
    if (!wasControlled || !controlled || disposed) return;
    waiting = null;
    if (requested) options.reload();
    else options.onAvailable();
  };
  const start = () => {
    if (disposed) return Promise.resolve();
    if (starting) return starting;
    starting = (async () => {
      controlled = Boolean(options.container.controller);
      options.container.addEventListener("controllerchange", controllerChanged);
      cleanup.push(() => options.container.removeEventListener("controllerchange", controllerChanged));
      let registered: ServiceWorkerRegistration;
      try { registered = await options.container.register(options.scriptUrl, { scope: options.scope, updateViaCache: "none" }); }
      catch (error) { options.container.removeEventListener("controllerchange", controllerChanged); starting = null; throw error; }
      if (disposed) return;
      registration = registered;
      noticeWaiting();
      watchInstalling();
      registration.addEventListener("updatefound", watchInstalling);
      cleanup.push(() => registration?.removeEventListener("updatefound", watchInstalling));
    })();
    return starting;
  };
  return {
    start,
    check() {
      if (disposed) return Promise.resolve();
      if (checking) return checking;
      checking = (async () => { await start(); if (!disposed) { await registration?.update(); noticeWaiting(); } })().finally(() => { checking = null; });
      return checking;
    },
    apply() {
      if (disposed || requested) return;
      waiting = registration?.waiting || null;
      if (!waiting || waiting.state === "redundant") { options.reload(); return; }
      requested = true;
      options.onApplying(true);
      waiting.postMessage({ type: "ACTIVATE_UPDATE" });
    },
    dispose() { disposed = true; cleanup.forEach((remove) => remove()); },
  };
}

export function isAppleTouchDevice(userAgent: string, maxTouchPoints: number) {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}
