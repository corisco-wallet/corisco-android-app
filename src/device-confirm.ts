let pending = 0;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

/** Tracks identity signatures waiting on a tap on the device, so the UI can tell the user to look at it. */
export const deviceConfirm = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  isPending: () => pending > 0,
  async during<T>(work: () => Promise<T>): Promise<T> {
    pending++;
    notify();
    try {
      return await work();
    } finally {
      pending--;
      notify();
    }
  },
};
