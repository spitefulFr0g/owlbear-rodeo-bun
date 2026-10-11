import { ImageItem } from "../../src/sceneRules";
import { expect, test } from "bun:test";
import { createRoom, nextMessage, sendBatch, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const token: ImageItem = { id: "hero", kind: "image", layer: "character", position: { x: 150, y: 300 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 999, owner: "forged", locked: false, hidden: false, metadata: {},
  image: { type: "default", key: "hero" }, width: 150, height: 150, label: "Hero",
  outline: { type: "circle", x: 75, y: 75, radius: 75 } };

test("hidden items are withheld in snapshots, relays and refusals, and revealed by show or ownership", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene.id;
    const batch = (changes: import("../../src/sceneRules").Change[]) => ({ id: "batch", sceneId, changes });
    await sendBatch(gm.socket, batch([{ type: "add", item: { ...token, hidden: true } }]));
    const waiting = await server.joinRoom(room.id, "", "waiting");
    const started = nextMessage(waiting.socket, "scene_snapshot");
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    expect((await started)[0].scene.items).toEqual({});
    const player = await server.joinRoom(room.id, "", "alice");
    const other = await server.joinRoom(room.id, "", "bob");
    const displayToken = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, displayToken);
    expect(player.snapshot!.scene.items).toEqual({});
    expect(display.snapshot!.scene.items).toEqual({});
    const events: unknown[] = [];
    other.socket.on("scene_changes", value => events.push(value));
    display.socket.on("scene_changes", value => events.push(value));
    const refusal = await sendBatch(player.socket, batch([{ type: "update", id: token.id, fields: { label: "Guess" } }]));
    expect(refusal.refused).toEqual([{ id: token.id, item: null }]);
    await sendBatch(gm.socket, batch([{ type: "update", id: token.id, fields: { label: "Secret" } }]));
    const given = nextMessage(player.socket, "scene_changes");
    await sendBatch(gm.socket, batch([{ type: "update", id: token.id, fields: { owner: "alice" } }]));
    expect((await given)[0].changes[0]).toEqual({ type: "add", item: expect.objectContaining({ hidden: true, owner: "alice", label: "Secret" }) });
    expect(events).toEqual([]);
    const shown = nextMessage(other.socket, "scene_changes");
    await sendBatch(gm.socket, batch([{ type: "update", id: token.id, fields: { hidden: false } }]));
    expect((await shown)[0].changes[0]).toEqual({ type: "add", item: expect.objectContaining({ hidden: false }) });
    const hidden = nextMessage(other.socket, "scene_changes");
    await sendBatch(gm.socket, batch([{ type: "update", id: token.id, fields: { hidden: true } }]));
    expect((await hidden)[0].changes).toEqual([{ type: "delete", id: token.id }]);
    expect((await sendBatch(player.socket, batch([{ type: "update", id: token.id, fields: { hidden: false } }]))).applied).toEqual([]);
    await new Promise(resolve => gm.socket.emit("room_trust", "alice", true, resolve));
    expect((await sendBatch(player.socket, batch([{ type: "update", id: token.id, fields: { hidden: false } }]))).refused).toEqual([]);
    expect((await sendBatch(other.socket, batch([{ type: "update", id: token.id, fields: { hidden: true } }]))).applied).toEqual([]);
  } finally { await server.dispose(); }
});
