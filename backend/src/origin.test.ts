import { describe, expect, test } from "bun:test";
import { isOriginAllowed } from "./origin";

describe("isOriginAllowed", () => {
  test("allows requests without an Origin header", () => {
    expect(isOriginAllowed(undefined, "localhost:9000", null)).toBe(true);
  });

  describe("with no allow pattern (same-origin only)", () => {
    test("allows an origin that matches the Host header", () => {
      expect(
        isOriginAllowed("http://192.168.1.20:9000", "192.168.1.20:9000", null)
      ).toBe(true);
    });

    test("rejects a different host or port", () => {
      expect(
        isOriginAllowed("http://evil.example", "192.168.1.20:9000", null)
      ).toBe(false);
      expect(
        isOriginAllowed("http://192.168.1.20:3000", "192.168.1.20:9000", null)
      ).toBe(false);
    });

    test("rejects when the Host header is missing", () => {
      expect(isOriginAllowed("http://localhost:9000", undefined, null)).toBe(
        false
      );
    });

    test("rejects a malformed origin", () => {
      expect(isOriginAllowed("null", "localhost:9000", null)).toBe(false);
    });
  });

  describe("with an allow pattern", () => {
    const allow = /^https:\/\/table\.example$/;

    test("allows origins that match the pattern", () => {
      expect(isOriginAllowed("https://table.example", "anything", allow)).toBe(
        true
      );
    });

    test("still allows same-origin requests", () => {
      expect(
        isOriginAllowed("http://localhost:9000", "localhost:9000", allow)
      ).toBe(true);
    });

    test("rejects origins that match neither", () => {
      expect(
        isOriginAllowed("https://evil.example", "localhost:9000", allow)
      ).toBe(false);
    });
  });
});
