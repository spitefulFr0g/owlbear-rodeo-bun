/** Server time in milliseconds, with cancellable delayed work. */
export interface Clock {
  now(): number;
  after(delayMs: number, task: () => void | Promise<void>): () => void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  after(delayMs, task) {
    const timer = setTimeout(() => { void task(); }, delayMs);
    return () => clearTimeout(timer);
  },
};
