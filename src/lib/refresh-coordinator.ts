export interface RefreshCoordinator {
  start(): void;
  runNow(): Promise<void>;
  stop(): void;
}

/** Runs refresh work serially; ticks arriving while it runs collapse to one. */
export function createRefreshCoordinator(
  callback: () => Promise<void>,
  intervalMs: number,
  onError: (error: unknown) => void,
  setIntervalFn: typeof setInterval = setInterval,
  clearIntervalFn: typeof clearInterval = clearInterval,
): RefreshCoordinator {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<void> | undefined;
  let queued = false;
  let stopped = false;
  let lastErrorFingerprint: string | undefined;

  const errorFingerprint = (error: unknown): string => {
    if (error instanceof Error) {
      const reasonCode =
        "reasonCode" in error
          ? String((error as Error & { reasonCode?: unknown }).reasonCode ?? "")
          : "";
      return `${error.name}:${reasonCode}`;
    }
    return typeof error;
  };

  const run = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (running) {
      queued = true;
      return running;
    }
    const work = (async () => {
      do {
        queued = false;
        try {
          await callback();
          lastErrorFingerprint = undefined;
        } catch (error) {
          const fingerprint = errorFingerprint(error);
          if (fingerprint !== lastErrorFingerprint) onError(error);
          lastErrorFingerprint = fingerprint;
        }
      } while (!stopped && queued);
    })().finally(() => {
      if (running === work) running = undefined;
    });
    running = work;
    return work;
  };

  return {
    start(): void {
      if (timer || stopped) return;
      timer = setIntervalFn(() => void run(), intervalMs);
      timer.unref?.();
    },
    runNow: run,
    stop(): void {
      stopped = true;
      queued = false;
      if (timer) clearIntervalFn(timer);
      timer = undefined;
    },
  };
}
