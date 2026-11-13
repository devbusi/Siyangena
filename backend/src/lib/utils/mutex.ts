// A simple FIFO mutex. Every promoter transaction goes through one of these so
// nothing changes the promoter's Sequence while a resale Batch is being signed.
export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  // Resolves with a release function once the lock is ours.
  acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => (release = resolve));
    const ready = this.tail.then(() => {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        release();
      };
    });
    this.tail = this.tail.then(() => next);
    return ready;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
