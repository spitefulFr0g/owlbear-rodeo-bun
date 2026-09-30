import { describe, expect, test } from "bun:test";
import { parseConfig } from "./config";

describe("parseConfig", () => {
  test("defaults to port 9000, same-origin and the bundled ICE servers", () => {
    const config = parseConfig([], {});
    expect(config.port).toBe(9000);
    expect(config.allowOrigin).toBeNull();
    expect(config.iceServersFile).toBeUndefined();
    expect(config.help).toBe(false);
  });

  test("reads settings from the environment", () => {
    const config = parseConfig([], {
      PORT: "8080",
      ALLOW_ORIGIN: "^https://example\\.com$",
      ICE_SERVERS_FILE: "/etc/ice.json",
    });
    expect(config.port).toBe(8080);
    expect(config.allowOrigin?.test("https://example.com")).toBe(true);
    expect(config.iceServersFile).toBe("/etc/ice.json");
  });

  test("flags take precedence over the environment", () => {
    const config = parseConfig(
      ["--port", "3000", "--allow-origin", ".*", "--ice-servers", "ice.json"],
      { PORT: "8080", ALLOW_ORIGIN: "nope", ICE_SERVERS_FILE: "other.json" }
    );
    expect(config.port).toBe(3000);
    expect(config.allowOrigin?.source).toBe(".*");
    expect(config.iceServersFile).toBe("ice.json");
  });

  test("accepts --flag=value and -p", () => {
    expect(parseConfig(["--port=4000"], {}).port).toBe(4000);
    expect(parseConfig(["-p", "4001"], {}).port).toBe(4001);
  });

  test("recognises --help", () => {
    expect(parseConfig(["--help"], {}).help).toBe(true);
    expect(parseConfig(["-h"], {}).help).toBe(true);
  });

  test("rejects an invalid port", () => {
    expect(() => parseConfig(["--port", "abc"], {})).toThrow(/port/i);
    expect(() => parseConfig(["--port", "70000"], {})).toThrow(/port/i);
    expect(() => parseConfig([], { PORT: "-1" })).toThrow(/port/i);
  });

  test("rejects an invalid origin pattern", () => {
    expect(() => parseConfig(["--allow-origin", "("], {})).toThrow(/origin/i);
  });

  test("rejects unknown flags", () => {
    expect(() => parseConfig(["--prot", "3000"], {})).toThrow();
  });
});
