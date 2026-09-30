const cancelled = () => new DOMException('cancelled', 'AbortError');

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(cancelled());
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function createRateQueue(intervalMs: number): {
  run<T>(job: () => Promise<T>, signal: AbortSignal): Promise<T>;
} {
  let tail: Promise<void> = Promise.resolve();
  let lastStarted: number | null = null;
  return {
    run<T>(job: () => Promise<T>, signal: AbortSignal): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const abort = () => reject(cancelled());
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        const next = tail.then(async () => {
          if (signal.aborted) throw cancelled();
          const remaining = lastStarted === null ? 0 : intervalMs - (performance.now() - lastStarted);
          // Node truncates fractional timer delays, so round up to preserve the minimum.
          if (remaining > 0) await delay(Math.ceil(remaining), signal);
          if (signal.aborted) throw cancelled();
          lastStarted = performance.now();
          // From here the running job owns cancellation through its captured signal.
          signal.removeEventListener('abort', abort);
          return job();
        });
        tail = next.then(() => {}, () => {});
        next.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
      });
    },
  };
}
