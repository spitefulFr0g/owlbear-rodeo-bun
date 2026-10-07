import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import { mkdtemp, rm } from "fs/promises";
import { Server } from "http";
import { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { FsAssetStore } from "../entities/AssetStore";
import JoinTokens from "../entities/JoinTokens";
import AssetController from "./AssetController";

const MAX_BYTES = 1024;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

let dir: string;
let server: Server;
let baseUrl: string;
let token: string;
const joinTokens = new JoinTokens();

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "asset-routes-"));
  const store = new FsAssetStore(dir, MAX_BYTES);
  await store.init();
  const controller = new AssetController(store, joinTokens, MAX_BYTES);
  const app = express();
  app.use(controller.path, controller.setRoutes());
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  token = joinTokens.issue("socket-1", "game-1");
});

afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

function upload(
  id: string,
  body: Uint8Array | string | ReadableStream = png,
  headers: Record<string, string> = {}
) {
  return fetch(`${baseUrl}/assets/${id}`, {
    method: "PUT",
    body,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/png",
      "X-Asset-Width": "4",
      "X-Asset-Height": "2",
      "X-Asset-Owner": "gm",
      ...headers,
    },
  });
}

function download(id: string, method = "GET", authorization = `Bearer ${token}`) {
  return fetch(`${baseUrl}/assets/${id}`, {
    method,
    headers: { Authorization: authorization },
  });
}

describe("asset routes", () => {
  test("serve an uploaded asset with its type and metadata", async () => {
    expect((await upload("round-trip")).status).toBe(201);

    const response = await download("round-trip");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe(String(png.length));
    expect(response.headers.get("x-asset-width")).toBe("4");
    expect(response.headers.get("x-asset-height")).toBe("2");
    expect(response.headers.get("x-asset-owner")).toBe("gm");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
  });

  test("answer the existence check without a body", async () => {
    await upload("exists");
    const found = await download("exists", "HEAD");
    expect(found.status).toBe(200);
    expect(found.headers.get("content-length")).toBe(String(png.length));
    expect(await found.text()).toBe("");
    expect((await download("absent", "HEAD")).status).toBe(404);
  });

  test("return 404 for an asset that was never uploaded", async () => {
    expect((await download("absent")).status).toBe(404);
    expect((await download("NOT-A-VALID-ID")).status).toBe(404);
  });

  describe("auth", () => {
    test("reject requests without a join token", async () => {
      await upload("guarded");
      for (const method of ["GET", "HEAD", "PUT"]) {
        const response = await fetch(`${baseUrl}/assets/guarded`, { method });
        expect(response.status).toBe(401);
      }
    });

    test("reject an unknown or malformed token", async () => {
      await upload("guarded-2");
      expect((await download("guarded-2", "GET", "Bearer nope")).status).toBe(401);
      expect((await download("guarded-2", "GET", token)).status).toBe(401);
      expect((await download("guarded-2", "GET", `Basic ${token}`)).status).toBe(401);
    });

    test("do not store an upload without a token", async () => {
      const response = await fetch(`${baseUrl}/assets/unauthorised`, {
        method: "PUT",
        body: png,
        headers: { "Content-Type": "image/png" },
      });
      expect(response.status).toBe(401);
      expect((await download("unauthorised")).status).toBe(404);
    });

    test("reject a token after its socket has left", async () => {
      await upload("revoked");
      const leaving = joinTokens.issue("socket-2", "game-1");
      expect((await download("revoked", "GET", `Bearer ${leaving}`)).status).toBe(200);
      joinTokens.revoke("socket-2");
      expect((await download("revoked", "GET", `Bearer ${leaving}`)).status).toBe(401);
    });
  });

  describe("size cap", () => {
    test("accept an upload of exactly the limit", async () => {
      expect((await upload("at-limit", new Uint8Array(MAX_BYTES))).status).toBe(201);
    });

    test("reject an upload over the limit", async () => {
      const response = await upload("too-big", new Uint8Array(MAX_BYTES + 1));
      expect(response.status).toBe(413);
      expect((await download("too-big")).status).toBe(404);
    });

    test("reject a streamed upload that grows past the limit", async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_BYTES));
          controller.enqueue(new Uint8Array(MAX_BYTES));
          controller.close();
        },
      });
      const response = await upload("too-big-stream", body);
      expect(response.status).toBe(413);
      expect((await download("too-big-stream")).status).toBe(404);
    });
  });

  describe("write-once", () => {
    test("refuse to replace an asset", async () => {
      expect((await upload("once")).status).toBe(201);
      const second = await upload("once", new Uint8Array([9, 9, 9]));
      expect(second.status).toBe(409);
      const response = await download("once");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    });
  });

  describe("validation", () => {
    test("reject an id that is not a safe file name", async () => {
      expect((await upload("Bad_Id")).status).toBe(400);
    });

    test("reject uploads that are not images", async () => {
      const response = await upload("page", "<script>", {
        "Content-Type": "text/html",
      });
      expect(response.status).toBe(400);
    });

    test("accept assets with no known mime type", async () => {
      const response = await upload("legacy", png, {
        "Content-Type": "application/octet-stream",
      });
      expect(response.status).toBe(201);
    });

    test("reject missing or invalid metadata", async () => {
      expect((await upload("meta-1", png, { "X-Asset-Width": "wide" })).status).toBe(400);
      expect((await upload("meta-2", png, { "X-Asset-Height": "-1" })).status).toBe(400);
      expect((await upload("meta-3", png, { "X-Asset-Owner": "a b" })).status).toBe(400);
    });
  });
});
