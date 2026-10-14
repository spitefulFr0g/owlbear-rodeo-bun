import { expect, test } from "bun:test";
import { ImageItem, ShapeItem } from "../../src/sceneRules";
import { uploadLibrary, createRoom, sendBatch, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const token: ImageItem = { id: "token", kind: "image", layer: "character", position: { x: 0, y: 0 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 0, owner: "gm", locked: false, hidden: false, metadata: {},
  image: { type: "default", key: "hero" }, width: 150, height: 150, label: "Hero",
  outline: { type: "circle", x: 0, y: 0, radius: 75 } };
const drawing: ShapeItem = { id: "drawing", kind: "shape", layer: "drawing", position: token.position,
  rotation: 0, scale: token.scale, order: 0, owner: "gm", locked: false, hidden: false, metadata: {},
  geometry: { type: "circle", radius: 75 }, color: "red", strokeWidth: 1, fill: false, blend: false, cut: false };

test("socket permissions return real items and use the latest switches and trusted marks", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Permissions");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id, "", "player");
    const sceneId = gm.snapshot!.scene!.id;
    const prepared = await sendBatch(gm.socket, { id: "prepare", sceneId, changes: [{ type: "add", item: token }, { type: "add", item: drawing }] });
    expect(prepared.refused).toEqual([]);
    const refused = await sendBatch(player.socket, { id: "refused", sceneId, changes: [
      { type: "add", item: { ...token, id: "map", layer: "map" } },
      { type: "delete", id: drawing.id },
      { type: "update", id: token.id, fields: { position: { x: 100, y: 100 }, locked: true } },
    ] });
    expect(refused.applied).toEqual([]);
    expect(refused.refused).toEqual([{ id: "map", item: null }, { id: drawing.id, item: drawing }, { id: token.id, item: token }]);
    const own = await sendBatch(player.socket, { id: "own", sceneId, changes: [{ type: "add", item: { ...token, id: "own" } }] });
    expect(own.refused).toEqual([]);
    await new Promise(resolve => gm.socket.emit("room_switches", { tokens: false }, resolve));
    const off = await sendBatch(player.socket, { id: "off", sceneId, changes: [{ type: "update", id: "own", fields: { label: "Changed" } }] });
    expect(off.applied).toEqual([]);
    expect(off.refused).toEqual([{ id: "own", item: { ...token, id: "own", owner: "player", order: 1 } }]);
    await new Promise(resolve => gm.socket.emit("room_trust", "player", true, resolve));
    const trusted = await sendBatch(player.socket, { id: "trusted", sceneId, changes: [
      { type: "update", id: token.id, fields: { label: "Trusted edit" } },
      { type: "update", id: "own", fields: { layer: "map" } },
    ] });
    expect(trusted.applied).toEqual([{ type: "update", id: token.id, fields: { label: "Trusted edit" } }]);
    expect(trusted.refused).toEqual(off.refused);
    await new Promise(resolve => gm.socket.emit("room_trust", "player", false, resolve));
    expect((await sendBatch(player.socket, { id: "untrusted", sceneId, changes: [{ type: "delete", id: "own" }] })).refused).toEqual(off.refused);
    const scene = (await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene!;
    expect(scene.items.drawing).toEqual(drawing);
    expect(scene.items.own).toEqual(off.refused[0].item!);
    expect((scene.items.token as ImageItem).label).toBe("Trusted edit");
  } finally { await server.dispose(); }
});

test("Owner Only refuses another's token, permits added and assigned tokens, and exempts trusted players", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Owner Only");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id, "", "player");
    const sceneId = gm.snapshot!.scene!.id;
    await sendBatch(gm.socket, { id: "prepare", sceneId, changes: [{ type: "add", item: token }] });
    await new Promise(resolve => gm.socket.emit("room_switches", { ownerOnly: true }, resolve));
    const move = { type: "update" as const, id: token.id, fields: { position: { x: 100, y: 100 } } };
    const refused = await sendBatch(player.socket, { id: "refused", sceneId, changes: [move] });
    expect(refused.applied).toEqual([]);
    expect(refused.refused).toEqual([{ id: token.id, item: token }]);
    const own = await sendBatch(player.socket, { id: "own", sceneId, changes: [
      { type: "add", item: { ...token, id: "own" } }, { ...move, id: "own" },
    ] });
    expect(own.refused).toEqual([]);
    expect(own.applied).toHaveLength(2);
    await sendBatch(gm.socket, { id: "assign", sceneId, changes: [{ type: "update", id: token.id, fields: { owner: "player" } }] });
    expect((await sendBatch(player.socket, { id: "assigned", sceneId, changes: [move] })).refused).toEqual([]);
    await sendBatch(gm.socket, { id: "reclaim", sceneId, changes: [{ type: "update", id: token.id, fields: { owner: "gm" } }] });
    await new Promise(resolve => gm.socket.emit("room_trust", "player", true, resolve));
    expect((await sendBatch(player.socket, { id: "trusted", sceneId, changes: [move] })).refused).toEqual([]);
    await new Promise(resolve => gm.socket.emit("room_trust", "player", false, resolve));
    await new Promise(resolve => gm.socket.emit("room_switches", { ownerOnly: false }, resolve));
    expect((await sendBatch(player.socket, { id: "off", sceneId, changes: [move] })).refused).toEqual([]);
  } finally { await server.dispose(); }
});

test("socket lock refusals return the real state and assigned owners can delete", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Locks");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id, "", "player");
    const sceneId = gm.snapshot!.scene!.id;
    await sendBatch(gm.socket, { id: "prepare", sceneId, changes: [{ type: "add", item: token }] });
    expect((await sendBatch(gm.socket, { id: "lock", sceneId, changes: [
      { type: "update", id: token.id, fields: { locked: true } },
    ] })).refused).toEqual([]);
    for (const trusted of [false, true]) {
      await new Promise(resolve => gm.socket.emit("room_trust", "player", trusted, resolve));
      const answer = await sendBatch(player.socket, { id: `locked-${trusted}`, sceneId, changes: [
        { type: "update", id: token.id, fields: { label: "Forbidden" } },
        { type: "delete", id: token.id },
        { type: "update", id: token.id, fields: { locked: false, owner: "player" } },
      ] });
      expect(answer.applied).toEqual([]);
      expect(answer.refused).toEqual(Array(3).fill({ id: token.id, item: { ...token, locked: true } }));
    }
    expect((await sendBatch(gm.socket, { id: "assign", sceneId, changes: [
      { type: "update", id: token.id, fields: { locked: false, owner: "player" } },
    ] })).refused).toEqual([]);
    for (const trusted of [true, false]) {
      await new Promise(resolve => gm.socket.emit("room_trust", "player", trusted, resolve));
      const answer = await sendBatch(player.socket, { id: `flags-${trusted}`, sceneId, changes: [
        { type: "update", id: token.id, fields: { label: "Forbidden", locked: true } },
        { type: "update", id: token.id, fields: { locked: false } },
        { type: "update", id: token.id, fields: { owner: "gm" } },
      ] });
      expect(answer.applied).toEqual([]);
      expect(answer.refused).toEqual(Array(3).fill({ id: token.id, item: { ...token, owner: "player" } }));
    }
    expect((await sendBatch(player.socket, { id: "delete", sceneId, changes: [{ type: "delete", id: token.id }] })).refused).toEqual([]);
  } finally { await server.dispose(); }
});

test("downloads never grant placement while own library uploads work with uploads on or off", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Images");
    const otherRoom = await createRoom(server, cookie, "Other images");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const otherGM = await server.joinRoomAsGM(otherRoom.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id, "", "player");
    const ids: Record<string, string> = {};
    for (const name of ["known", "thumbnail", "low", "medium", "high", "ultra"]) ids[name] = (await uploadLibrary(server, gm.token, name)).files.original.id;
    ids.foreign = (await uploadLibrary(server, otherGM.token, "foreign")).files.original.id;
    const add = async (id: string, image: ImageItem["image"], peer = player) => sendBatch(peer.socket, {
      id, sceneId: gm.snapshot!.scene!.id, changes: [{ type: "add", item: { ...token, id, image } }],
    });
    expect((await add("built-in", token.image)).refused).toEqual([]);
    const known: ImageItem["image"] = { type: "file", file: ids.known, thumbnail: ids.thumbnail,
      resolutions: { low: ids.low, medium: ids.medium, high: ids.high, ultra: ids.ultra } };
    expect((await add("known-image", known)).refused).toEqual([{ id: "known-image", item: null }]);
    for (const method of ["GET", "HEAD"]) {
      expect((await fetch(`${server.address}/assets/${ids.foreign}`, {
        method, headers: { Authorization: `Bearer ${player.token}` },
      })).status).toBe(200);
      expect((await add(`foreign-${method}`, { type: "file", file: ids.foreign })).refused).toEqual([{ id: `foreign-${method}`, item: null }]);
    }
    for (const image of [
      { ...known, thumbnail: ids.foreign },
      ...["low", "medium", "high", "ultra"].map(resolution => ({ ...known, resolutions: { ...known.resolutions, [resolution]: ids.foreign } })),
    ]) expect((await add("unknown-part", image)).refused).toEqual([{ id: "unknown-part", item: null }]);
    // The legacy manifest cannot make a file known.
    gm.socket.emit("manifest", { mapId: "map", assets: { [ids.foreign]: { id: ids.foreign, owner: "gm" } } });
    expect((await add("manifest-only", { type: "file", file: ids.foreign })).refused).toEqual([{ id: "manifest-only", item: null }]);
    expect((await add("gm-image", { type: "file", file: ids.foreign }, gm)).refused).toEqual([{ id: "gm-image", item: null }]);
    const sceneAnswer = await new Promise<{ ok: boolean }>(resolve => gm.socket.emit("scene_create", {
      name: "Unplaced map", map: { ...token, id: "unplaced-map", layer: "map", image: { type: "file", file: ids.foreign } },
    }, resolve));
    expect(sceneAnswer.ok).toBe(false);
    await new Promise(resolve => gm.socket.emit("room_trust", "player", true, resolve));
    expect((await add("trusted-image", { type: "file", file: ids.foreign })).refused).toEqual([{ id: "trusted-image", item: null }]);
    await new Promise(resolve => gm.socket.emit("room_trust", "player", false, resolve));
    await new Promise(resolve => gm.socket.emit("room_switches", { uploads: true }, resolve));
    ids.uploaded = (await uploadLibrary(server, player.token, "uploaded")).files.original.id;
    expect((await add("uploads-on", { type: "file", file: ids.uploaded })).refused).toEqual([]);
    await new Promise(resolve => gm.socket.emit("room_switches", { uploads: false }, resolve));
    expect((await add("reused-upload", { type: "file", file: ids.uploaded })).refused).toEqual([]);
    expect((await fetch(`${server.address}/assets/${ids.foreign}`, {
      method: "HEAD", headers: { Authorization: `Bearer ${gm.token}` },
    })).status).toBe(200);
    expect((await add("gm-fetched", { type: "file", file: ids.foreign })).refused).toEqual([{ id: "gm-fetched", item: null }]);
  } finally { await server.dispose(); }
});
