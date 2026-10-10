import { expect, test } from "bun:test";
import { TestClock } from "./testing/serverHelpers";

test("moving the clock runs due work in order, including newly scheduled work", async () => {
  const clock = new TestClock(1000);
  const seen: number[] = [];
  clock.after(3000, () => { seen.push(clock.now()); });
  clock.after(1000, () => {
    seen.push(clock.now());
    clock.after(500, () => { seen.push(clock.now()); });
  });
  const cancel = clock.after(200, () => { seen.push(-1); });
  cancel();
  await clock.advance(999);
  expect(seen).toEqual([]);
  await clock.advance(2001);
  expect(seen).toEqual([2000, 2500, 4000]);
  expect(clock.now()).toBe(4000);
});
