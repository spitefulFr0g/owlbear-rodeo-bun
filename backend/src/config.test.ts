import { describe, expect, spyOn, test } from "bun:test";
import { defaultDataDir, parseConfig, USAGE } from "./config";

describe("parseConfig", () => {
  test("defaults to port 9000, same-origin", () => {
    const config = parseConfig([], {});
    expect(config.port).toBe(9000);
    expect(config.allowOrigin).toBeNull();
    expect(config.dataDir).toBeUndefined();
    expect(config.help).toBe(false);
  });

  test("reads settings from the environment", () => {
    const config = parseConfig([], {
      PORT: "8080",
      ALLOW_ORIGIN: "^https://example\\.com$",
      DATA_DIR: "/var/lib/owlbear",
    });
    expect(config.port).toBe(8080);
    expect(config.allowOrigin?.test("https://example.com")).toBe(true);
    expect(config.dataDir).toBe("/var/lib/owlbear");
  });

  test("flags take precedence over the environment", () => {
    const config = parseConfig(
      [
        "--port",
        "3000",
        "--allow-origin",
        ".*",
        "--data-dir",
        "assets",
      ],
      {
        PORT: "8080",
        ALLOW_ORIGIN: "nope",
        DATA_DIR: "elsewhere",
      }
    );
    expect(config.port).toBe(3000);
    expect(config.allowOrigin?.source).toBe(".*");
    expect(config.dataDir).toBe("assets");
  });

  test("accepts --flag=value and -p", () => {
    expect(parseConfig(["--port=4000"], {}).port).toBe(4000);
    expect(parseConfig(["-p", "4001"], {}).port).toBe(4001);
  });

  test("accepts the removed ICE option and warns once even with the environment set", () => {
    const warning = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(parseConfig(["--ice-servers", "/missing/ice.json"], {
        ICE_SERVERS_FILE: "/also-missing/ice.json",
      })).toEqual({ port: 9000, allowOrigin: null, dataDir: undefined, help: false, reopenSetup: false, behindProxy: false });
      expect(warning.mock.calls).toEqual([[
        "Warning: --ice-servers / ICE_SERVERS_FILE no longer does anything because peer-to-peer connections were removed.",
      ]]);
    } finally {
      warning.mockRestore();
    }
  });

  test("warns when only the removed ICE environment variable is set", () => {
    const warning = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(parseConfig([], { ICE_SERVERS_FILE: "/missing/ice.json" }).port).toBe(9000);
      expect(warning.mock.calls).toEqual([[
        "Warning: --ice-servers / ICE_SERVERS_FILE no longer does anything because peer-to-peer connections were removed.",
      ]]);
    } finally {
      warning.mockRestore();
    }
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

test("reopen setup is a command-line-only flag described in help", () => {
  expect(parseConfig(["--reopen-setup", "--port", "8081", "--data-dir", "saved"], {}).reopenSetup).toBe(true);
  expect(parseConfig([], { REOPEN_SETUP: "true", OWLBEAR_REOPEN_SETUP: "1" }).reopenSetup).toBe(false);
  expect(USAGE).toContain("--reopen-setup");
  expect(USAGE).toContain("one new administrator");
});

test("behind proxy is an explicit command-line flag described in help", () => {
  expect(parseConfig([], {}).behindProxy).toBe(false);
  expect(parseConfig(["--behind-proxy"], {}).behindProxy).toBe(true);
  expect(USAGE).toContain("--behind-proxy");
  expect(USAGE).toContain("nearest proxy");
});
