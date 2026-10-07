import { describe, expect, test } from "bun:test";
import { defaultDataDir, parseConfig } from "./config";

describe("parseConfig", () => {
  test("defaults to port 9000, same-origin and the bundled ICE servers", () => {
    const config = parseConfig([], {});
    expect(config.port).toBe(9000);
    expect(config.allowOrigin).toBeNull();
    expect(config.iceServersFile).toBeUndefined();
    expect(config.dataDir).toBeUndefined();
    expect(config.help).toBe(false);
  });

  test("reads settings from the environment", () => {
    const config = parseConfig([], {
      PORT: "8080",
      ALLOW_ORIGIN: "^https://example\\.com$",
      ICE_SERVERS_FILE: "/etc/ice.json",
      DATA_DIR: "/var/lib/owlbear",
    });
    expect(config.port).toBe(8080);
    expect(config.allowOrigin?.test("https://example.com")).toBe(true);
    expect(config.iceServersFile).toBe("/etc/ice.json");
    expect(config.dataDir).toBe("/var/lib/owlbear");
  });

  test("flags take precedence over the environment", () => {
    const config = parseConfig(
      [
        "--port",
        "3000",
        "--allow-origin",
        ".*",
        "--ice-servers",
        "ice.json",
        "--data-dir",
        "assets",
      ],
      {
        PORT: "8080",
        ALLOW_ORIGIN: "nope",
        ICE_SERVERS_FILE: "other.json",
        DATA_DIR: "elsewhere",
      }
    );
    expect(config.port).toBe(3000);
    expect(config.allowOrigin?.source).toBe(".*");
    expect(config.iceServersFile).toBe("ice.json");
    expect(config.dataDir).toBe("assets");
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

describe("defaultDataDir", () => {
  test("is beside a compiled executable", () => {
    expect(
      defaultDataDir(
        "/opt/owlbear/owlbear-rodeo-linux-x64",
        "/$bunfs/root/owlbear-rodeo-linux-x64",
        "/home/gm"
      )
    ).toBe("/opt/owlbear/data");
  });

  test("recognises a compiled Windows executable", () => {
    expect(
      defaultDataDir("/opt/owlbear/owlbear.exe", "B:\\~BUN\\root\\owlbear.exe", "/")
    ).toBe("/opt/owlbear/data");
  });

  test("is in the working directory when running from source", () => {
    expect(
      defaultDataDir(
        "/home/gm/.bun/bin/bun",
        "/home/gm/owlbear/backend/src/index.ts",
        "/home/gm/owlbear/backend"
      )
    ).toBe("/home/gm/owlbear/backend/data");
  });
});
