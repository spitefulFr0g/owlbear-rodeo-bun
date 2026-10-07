import { describe, expect, test } from "bun:test";
import JoinTokens from "./JoinTokens";

describe("JoinTokens", () => {
  test("verifies a token it issued", () => {
    const tokens = new JoinTokens();
    const token = tokens.issue("socket-1", "game-1");
    expect(tokens.verify(token)).toBe("game-1");
  });

  test("issues a different token each time", () => {
    const tokens = new JoinTokens();
    expect(tokens.issue("socket-1", "game-1")).not.toBe(
      tokens.issue("socket-2", "game-1")
    );
  });

  test("rejects unknown tokens", () => {
    const tokens = new JoinTokens();
    tokens.issue("socket-1", "game-1");
    expect(tokens.verify("nope")).toBeUndefined();
    expect(tokens.verify("")).toBeUndefined();
  });

  test("rejects a token once its socket is revoked", () => {
    const tokens = new JoinTokens();
    const token = tokens.issue("socket-1", "game-1");
    const other = tokens.issue("socket-2", "game-1");
    tokens.revoke("socket-1");
    expect(tokens.verify(token)).toBeUndefined();
    expect(tokens.verify(other)).toBe("game-1");
  });

  test("replaces the token when a socket joins again", () => {
    const tokens = new JoinTokens();
    const first = tokens.issue("socket-1", "game-1");
    const second = tokens.issue("socket-1", "game-2");
    expect(tokens.verify(first)).toBeUndefined();
    expect(tokens.verify(second)).toBe("game-2");
  });
});
