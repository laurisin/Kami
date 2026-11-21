export interface ReliableClockTimer {
  start: (onTick: () => void, intervalMs?: number) => void;
  stop: () => void;
  dispose: () => void;
}

const WORKER_SCRIPT = `
let timerId = null;
self.onmessage = function (e) {
  const msg = e.data;
  if (!msg) return;
  if (msg.type === 'start') {
    if (timerId !== null) clearInterval(timerId);
    const ms = Math.max(10, Number(msg.intervalMs) || 20);
    timerId = setInterval(function () {
      self.postMessage('tick');
    }, ms);
  } else if (msg.type === 'stop') {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }
};
`;

export function createReliableClockTimer(): ReliableClockTimer {
  let worker: Worker | null = null;
  let blobUrl: string | null = null;
  let fallbackId: number | null = null;
  let tickCallback: (() => void) | null = null;

  const ensureWorker = (): Worker | null => {
    if (worker) return worker;
    if (
      typeof Worker === 'undefined' ||
      typeof Blob === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return null;
    }

    try {
      const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
      blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl);
      worker.onmessage = (e) => {
        if (e.data === 'tick' && tickCallback) {
          tickCallback();
        }
      };
      return worker;
    } catch {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
      worker = null;
      return null;
    }
  };

  const stop = () => {
    tickCallback = null;
    if (worker) {
      worker.postMessage({ type: 'stop' });
    }
    if (fallbackId !== null) {
      window.clearInterval(fallbackId);
      fallbackId = null;
    }
  };

  const start = (onTick: () => void, intervalMs = 20) => {
    stop();
    tickCallback = onTick;
    const w = ensureWorker();
    if (w) {
      w.postMessage({ type: 'start', intervalMs });
    } else {
      fallbackId = window.setInterval(() => {
        tickCallback?.();
      }, intervalMs);
    }
  };

  const dispose = () => {
    stop();
    if (worker) {
      worker.terminate();
      worker = null;
    }
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
  };

  return { start, stop, dispose };
}
