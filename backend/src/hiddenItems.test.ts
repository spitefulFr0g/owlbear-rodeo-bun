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
    const sceneId = gm.snapshot!.scene!.id;
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
    expect(player.snapshot!.scene!.items).toEqual({});
    expect(display.snapshot!.scene!.items).toEqual({});
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


test("a player cannot claim GM ownership through their browser id", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene!.id;
    await sendBatch(gm.socket, { id: "secret", sceneId, changes: [
      { type: "add", item: { ...token, hidden: true } },
    ] });
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id, "", "gm");
    expect(player.snapshot!.scene!.items).toEqual({});
    const answer = await sendBatch(player.socket, { id: "guess", sceneId, changes: [
      { type: "update", id: token.id, fields: { label: "Claimed" } },
      { type: "add", item: { ...token, id: "forged-owner" } },
    ] });
    expect(answer.applied).toEqual([]);
    expect(answer.refused).toEqual([
      { id: token.id, item: null }, { id: "forged-owner", item: null },
    ]);
  } finally { await server.dispose(); }
});

for (const square of [true, false]) {
  test(`own hidden ${square ? "notes" : "text"} stay private until authorized show and survive restart`, async () => {
    const server = await startTestServer();
    try {
      const { cookie } = await setupAdministrator(server);
      const room = await createRoom(server, cookie, "Writing");
      const gm = await server.joinRoomAsGM(room.id, cookie);
      await new Promise(resolve => gm.socket.emit("session", true, resolve));
      const owner = await server.joinRoom(room.id, "", "alice");
      const other = await server.joinRoom(room.id, "", "bob");
      const displayToken = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
      const display = await server.joinDisplay(room.id, displayToken);
      const item: import("../../src/sceneRules").TextItem = {
        id: "writing", kind: "text", layer: square ? "note" : "text", square,
        position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, order: 0,
        owner: "alice", locked: false, hidden: true, metadata: {}, text: "Secret", color: "red", size: 150,
      };
      const batch = (changes: import("../../src/sceneRules").Change[]) => ({ id: "writing", sceneId: gm.snapshot!.scene!.id, changes });
      const events: unknown[] = [];
      for (const peer of [other, display]) peer.socket.on("scene_changes", value => events.push(value));
      const gmAdded = nextMessage(gm.socket, "scene_changes");
      const added = await sendBatch(owner.socket, batch([{ type: "add", item }]));
      expect(added.refused).toEqual([]);
      expect(added.applied).toEqual([{ type: "add", item }]);
      expect((await gmAdded)[0].changes).toEqual(added.applied);
      expect((await server.joinRoom(room.id, "", "alice")).snapshot!.scene!.items.writing).toEqual(item);
      expect((await server.joinRoom(room.id, "", "bob")).snapshot!.scene!.items).toEqual({});
      expect((await server.joinDisplay(room.id, displayToken)).snapshot!.scene!.items).toEqual({});
      const gmEvents: unknown[] = [];
      gm.socket.on("scene_changes", value => gmEvents.push(value));
      const show = { type: "update" as const, id: item.id, fields: { hidden: false } };
      const refused = await sendBatch(owner.socket, batch([show]));
      expect(refused.applied).toEqual([]);
      expect(refused.refused).toEqual([{ id: item.id, item }]);
      expect(gmEvents).toEqual([]);
      expect(events).toEqual([]);
      expect((await sendBatch(owner.socket, batch([{ type: "update", id: item.id, fields: { text: "Edited" } }]))).refused).toEqual([]);
      await new Promise(resolve => gm.socket.emit("room_switches", { notes: false }, resolve));
      const off = await sendBatch(owner.socket, batch([
        { type: "add", item: { ...item, id: "off" } },
        { type: "update", id: item.id, fields: { text: "Forbidden" } },
      ]));
      expect(off.applied).toEqual([]);
      expect(off.refused.map(value => value.id)).toEqual(["off", item.id]);
      await new Promise(resolve => gm.socket.emit("room_trust", "alice", true, resolve));
      const shownTo = [gm, other, display].map(peer => nextMessage(peer.socket, "scene_changes"));
      expect((await sendBatch(owner.socket, batch([show]))).refused).toEqual([]);
      const shown = await Promise.all(shownTo);
      expect(shown[0][0].changes).toEqual([show]);
      for (const message of shown.slice(1)) expect(message[0].changes).toEqual([
        { type: "add", item: { ...item, text: "Edited", hidden: false } },
      ]);
      await server.restart();
      expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene!.items.writing).toEqual({ ...item, text: "Edited", hidden: false });
    } finally { await server.dispose(); }
  });
}
