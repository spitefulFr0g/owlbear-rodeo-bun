import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer, uploadLibrary } from "../testing/serverHelpers";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
test("immutable downloads retain metadata and cast access while unreserved writes are refused", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server); const room = await createRoom(server, cookie, "Assets");
    const gm = await server.joinRoomAsGM(room.id, cookie); const asset = await uploadLibrary(server, gm.token, png);
    const id = asset.files.original.id;
    const link = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, link);
    for (const token of [gm.token, display.token]) {
      const response = await fetch(`${server.address}/assets/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("content-length")).toBe(String(png.length));
      expect(response.headers.get("x-asset-width")).toBe("4");
      expect(response.headers.get("x-asset-height")).toBe("2");
      expect(response.headers.get("x-asset-owner")).toBe("gm");
      expect(response.headers.get("cache-control")).toContain("immutable");
      expect(response.headers.get("content-security-policy")).toContain("sandbox");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
      const head = await fetch(`${server.address}/assets/${id}`, { method: "HEAD", headers: { Authorization: `Bearer ${token}` } });
      expect(head.status).toBe(200); expect(await head.text()).toBe("");
      expect((await fetch(`${server.address}/assets/${id}`, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: "replacement" })).status).toBe(403);
    }
    for (const authorization of ["", "Bearer nope", `Basic ${gm.token}`, gm.token]) expect((await fetch(`${server.address}/assets/${id}`, { headers: { Authorization: authorization } })).status).toBe(401);
    for (const id of ["absent", "BAD_ID"]) expect((await fetch(`${server.address}/assets/${id}`, { headers: { Authorization: `Bearer ${gm.token}` } })).status).toBe(404);
    const disconnected = nextMessage(display.socket, "disconnect");
    await new Promise(resolve => gm.socket.emit("new_display_link", resolve)); await disconnected;
    expect((await fetch(`${server.address}/assets/${id}`, { headers: { Authorization: `Bearer ${display.token}` } })).status).toBe(401);
  } finally { await server.dispose(); }
});
