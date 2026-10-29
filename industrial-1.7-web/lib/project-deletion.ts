type ProjectDeletionSteps = {
  confirm: () => Promise<boolean>;
  prepare: () => Promise<void>;
  remove: () => Promise<void>;
  commit: () => void | Promise<void>;
};

/** Keep draft writes ahead of deletion, including writes already awaiting disk. */
export function createProjectDeletionController() {
  let deleting: string | null = null;
  const paused = new Set<string>();
  const deleted = new Set<string>();
  const writes = new Map<string, Set<Promise<void>>>();
  return {
    isBusy: () => deleting !== null,
    isBlocked: (id: string) => paused.has(id) || deleted.has(id),
    restored(id: string) { deleted.delete(id); },
    write(id: string, operation: () => Promise<void>): Promise<void> {
      if (paused.has(id) || deleted.has(id)) return Promise.resolve();
      const pending = writes.get(id) || new Set<Promise<void>>();
      writes.set(id, pending);
      const result = Promise.resolve().then(operation);
      pending.add(result);
      const done = () => {
        pending.delete(result);
        if (!pending.size) writes.delete(id);
      };
      void result.then(done, done);
      return result;
    },
    async run(id: string, steps: ProjectDeletionSteps): Promise<boolean> {
      if (deleting !== null || deleted.has(id)) return false;
      deleting = id;
      try {
        if (!await steps.confirm()) return false;
        await steps.prepare();
        paused.add(id);
        while (writes.get(id)?.size) await Promise.all([...writes.get(id)!]);
        await steps.remove();
        deleted.add(id);
        await steps.commit();
        return true;
      } finally {
        paused.delete(id);
        deleting = null;
      }
    },
  };
}
