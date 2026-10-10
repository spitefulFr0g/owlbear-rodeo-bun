import { Clock } from "./clock";

const MINUTE = 60_000;
interface Count {
  wrong: number[];
  lastWrong: number;
  refusals: number;
  until: number;
}

/** Counts are local to one server run; all expiry is checked against its clock. */
export default class AttemptLimiter {
  private counts = new Map<string, Count>();
  constructor(private readonly clock: Clock) {}

  private count(key: string): Count | undefined {
    const count = this.counts.get(key);
    if (count && this.clock.now() - count.lastWrong >= 24 * 60 * MINUTE) {
      this.counts.delete(key);
      return undefined;
    }
    return count;
  }

  retryAfterSeconds(keys: string[]): number {
    return Math.max(0, ...keys.map(key =>
      Math.ceil(((this.count(key)?.until ?? 0) - this.clock.now()) / 1000)));
  }

  wrong(keys: string[]): void {
    const now = this.clock.now();
    for (const key of keys) {
      const count = this.count(key) ?? { wrong: [], lastWrong: now, refusals: 0, until: 0 };
      if (count.until > now) continue;
      count.wrong = count.wrong.filter(at => now - at < 15 * MINUTE);
      count.wrong.push(now);
      count.lastWrong = now;
      if (count.wrong.length >= 5) {
        count.until = now + (count.refusals === 0 ? 5 : 15) * MINUTE;
        count.refusals++;
        count.wrong = [];
      }
      this.counts.set(key, count);
    }
  }

  reset(key: string): void { this.counts.delete(key); }
}
