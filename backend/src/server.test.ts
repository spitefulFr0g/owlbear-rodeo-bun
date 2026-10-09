import { expect, test } from "bun:test";
import { startTestServer } from "./testing/serverHelpers";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

test("an image uploaded with a room connection survives a server restart", async () => {
  const server = await startTestServer();
  try {
    const { token } = await server.joinRoom("room");
    const uploaded = await fetch(`${server.address}/assets/image`, {
      method: "PUT", body: png,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png",
        "X-Asset-Width": "4", "X-Asset-Height": "2", "X-Asset-Owner": "gm" },
    });
    expect(uploaded.status).toBe(201);
    await uploaded.text();
    await server.restart();
    const rejoined = await server.joinRoom("room");
    const downloaded = await fetch(`${server.address}/assets/image`, {
      headers: { Authorization: `Bearer ${rejoined.token}` },
    });
    expect(downloaded.status).toBe(200);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(png);
  } finally { await server.dispose(); }
});

test("two servers keep room passwords, join tokens and images separate", async () => {
  const first = await startTestServer();
  const second = await startTestServer();
  try {
    expect(first.address).not.toBe(second.address);
    const a = await first.joinRoom("same-room", "first-password");
    const b = await second.joinRoom("same-room", "second-password");
    const response = await fetch(`${first.address}/assets/separate`, {
      method: "PUT", body: png,
      headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "image/png",
        "X-Asset-Width": "4", "X-Asset-Height": "2", "X-Asset-Owner": "gm" },
    });
    expect(response.status).toBe(201);
    await response.text();
    const foreign = await fetch(`${second.address}/assets/separate`, {
      headers: { Authorization: `Bearer ${a.token}` },
    });
    expect(foreign.status).toBe(401);
    await foreign.text();
    const absent = await fetch(`${second.address}/assets/separate`, {
      headers: { Authorization: `Bearer ${b.token}` },
    });
    expect(absent.status).toBe(404);
    await absent.text();
  } finally { await first.dispose(); await second.dispose(); }
});

test("stopping the server disconnects room clients and releases its listener", async () => {
  const server = await startTestServer();
  try {
    const { socket } = await server.joinRoom("room");
    const disconnected = new Promise<string>((resolve) => socket.once("disconnect", resolve));
    await server.stop();
    await disconnected;
    expect(socket.connected).toBe(false);
    await expect(fetch(server.address)).rejects.toThrow();
    await server.stop();
  } finally { await server.dispose(); }
});
