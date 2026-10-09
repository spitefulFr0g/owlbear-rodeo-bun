import { describe, expect, test } from "bun:test";
import express from "express";
import { AddressInfo } from "net";
import { frontendHandler, resolveAsset } from "./frontend";

const assets = {
  "/index.html": "/bunfs/index.html",
  "/favicon.ico": "/bunfs/favicon.ico",
  "/static/js/main.abc123.js": "/bunfs/main.abc123.js",
};

describe("resolveAsset", () => {
  test("serves an embedded file by its exact path", () => {
    expect(resolveAsset("/favicon.ico", assets)).toEqual({
      filePath: "/bunfs/favicon.ico",
      type: ".ico",
      immutable: false,
    });
  });

  test("marks hashed files under /static/ as immutable", () => {
    expect(resolveAsset("/static/js/main.abc123.js", assets)).toEqual({
      filePath: "/bunfs/main.abc123.js",
      type: ".js",
      immutable: true,
    });
  });

  test("serves index.html for the root", () => {
    expect(resolveAsset("/", assets)?.filePath).toBe("/bunfs/index.html");
  });

  test("falls back to index.html for app routes", () => {
    expect(resolveAsset("/game/Ab3_x-9", assets)).toEqual({
      filePath: "/bunfs/index.html",
      type: ".html",
      immutable: false,
    });
    expect(resolveAsset("/how-to-play", assets)?.filePath).toBe(
      "/bunfs/index.html"
    );
  });

  test("returns nothing for a missing file", () => {
    expect(resolveAsset("/static/js/gone.js", assets)).toBeUndefined();
    expect(resolveAsset("/missing.png", assets)).toBeUndefined();
  });

  test("returns nothing when no frontend is embedded", () => {
    expect(resolveAsset("/", {})).toBeUndefined();
    expect(resolveAsset("/game/abc", {})).toBeUndefined();
  });
});


test("serves URL-encoded asset filenames through HTTP", async () => {
  const app = express();
  app.use(frontendHandler({ "/static/café map.txt": import.meta.path }));
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://localhost:${port}/static/caf%C3%A9%20map.txt`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("serves URL-encoded asset filenames through HTTP");
  } finally {
    server.close();
  }
});

test("serves index.html for invite and administration browser pages through HTTP", async () => {
  const app = express();
  app.use(frontendHandler({ "/index.html": import.meta.path }));
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    for (const path of ["/invite/abc123", "/admin"]) {
      const response = await fetch(`http://localhost:${port}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toBe(await Bun.file(import.meta.path).text());
    }
  } finally { server.close(); }
});
