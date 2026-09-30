import { describe, expect, test } from "bun:test";
import Auth from "./Auth";

describe("Auth", () => {
  const auth = new Auth();

  test("accepts the right password and rejects a wrong one", async () => {
    const hash = await auth.createPasswordHash("hunter2", 4);
    expect(await auth.checkPassword("hunter2", hash)).toBe(true);
    expect(await auth.checkPassword("hunter3", hash)).toBe(false);
  });

  test("supports games without a password", async () => {
    const hash = await auth.createPasswordHash("", 4);
    expect(await auth.checkPassword("", hash)).toBe(true);
    expect(await auth.checkPassword("guess", hash)).toBe(false);
  });

  test("rejects an empty password for a protected game", async () => {
    const hash = await auth.createPasswordHash("hunter2", 4);
    expect(await auth.checkPassword("", hash)).toBe(false);
  });
});
