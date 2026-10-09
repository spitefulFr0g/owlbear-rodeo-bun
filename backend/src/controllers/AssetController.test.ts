import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { io } from "socket.io-client";
import msgParser from "socket.io-msgpack-parser";
import { nextMessage, setupAdministrator, startTestServer } from "../testing/serverHelpers";

const MAX_BYTES = 64 * 1024 * 1024;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

let server: Awaited<ReturnType<typeof startTestServer>>;
let baseUrl: string;
let token: string;

beforeAll(async () => {
  server = await startTestServer();
  await setupAdministrator(server);
  baseUrl = server.address;
  token = (await server.joinRoom("game-1")).token;
});

afterAll(async () => {
  await server.dispose();
});

async function waitForRevocation(token: string) {
  const deadline = Date.now() + 2000;
  while ((await download("display-download", "HEAD", `Bearer ${token}`)).status !== 401) {
    if (Date.now() > deadline) throw new Error("Token was not revoked");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

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
    test("cast display tokens allow downloads but refuse uploads", async () => {
      await upload("display-download");
      const owner = await server.joinRoom("game-1");
      owner.socket.emit("player_state", { userId: "gm" });
      owner.socket.emit("map", { id: "map", owner: "gm" });
      const link = await new Promise<string>(resolve => owner.socket.emit("get_display_token", resolve));
      const display = io(baseUrl, { parser: msgParser, transports: ["websocket"], reconnection: false });
      const joined = nextMessage(display, "joined_display");
      display.emit("join_display", "game-1", link);
      const [, displayToken] = await joined;
      const authorization = `Bearer ${displayToken}`;
      const response = await download("display-download", "GET", authorization);
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
      expect((await download("display-download", "HEAD", authorization)).status).toBe(200);
      expect((await upload("display-upload", png, { Authorization: authorization })).status).toBe(403);
      expect((await download("display-upload")).status).toBe(404);
      display.disconnect();
      await waitForRevocation(displayToken);
      expect((await download("display-download", "GET", authorization)).status).toBe(401);
    });

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
      const connection = await server.joinRoom("game-1");
      const leaving = connection.token;
      expect((await download("revoked", "GET", `Bearer ${leaving}`)).status).toBe(200);
      connection.socket.disconnect();
      await waitForRevocation(leaving);
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
