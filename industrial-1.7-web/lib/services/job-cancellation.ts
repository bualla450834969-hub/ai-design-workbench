const controllers = new Map<string, AbortController>();

export function beginJob(jobId: string) {
  const controller = new AbortController();
  controllers.set(jobId, controller);
  return controller.signal;
}

export function cancelJob(jobId: string) {
  const controller = controllers.get(jobId);
  controller?.abort(new Error("用户已取消生成"));
  return Boolean(controller);
}

export function endJob(jobId: string) {
  controllers.delete(jobId);
}
