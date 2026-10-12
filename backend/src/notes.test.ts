import { expect, test } from "bun:test";
import { maxTextLength, TextItem } from "../../src/sceneRules";
import {
  createRoom,
  nextMessage,
  sendBatch,
  setupAdministrator,
  startTestServer,
} from "./testing/serverHelpers";

const note: TextItem = {
  id: "note",
  kind: "text",
  layer: "note",
  position: { x: 150, y: 300 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: 0,
  owner: "forged",
  locked: false,
  hidden: false,
  metadata: {},
  text: "Meet at the tower",
  color: "yellow",
  size: 300,
  square: true,
};

test("notes and text edits reach everyone and survive a restart", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise((resolve) => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id, "", "note-owner");
    const displayToken = await new Promise<string>((resolve) =>
      gm.socket.emit("get_display_token", resolve),
    );
    const display = await server.joinDisplay(room.id, displayToken);
    const sceneId = gm.snapshot!.scene!.id;
    const gmAdd = nextMessage(gm.socket, "scene_changes");
    const displayAdd = nextMessage(display.socket, "scene_changes");
    const added = await sendBatch(player.socket, {
      id: "add",
      sceneId,
      changes: [{ type: "add", item: note }],
    });
    expect(added.applied).toEqual([
      { type: "add", item: { ...note, owner: "note-owner" } },
    ]);
    expect((await gmAdd)[0].changes).toEqual(added.applied);
    expect((await displayAdd)[0].changes).toEqual(added.applied);
    const gmEdit = nextMessage(gm.socket, "scene_changes");
    const displayEdit = nextMessage(display.socket, "scene_changes");
    const edited = await sendBatch(player.socket, {
      id: "edit",
      sceneId,
      changes: [
        {
          type: "update",
          id: note.id,
          fields: {
            text: "The tower is empty",
            position: { x: -300, y: 450 },
            square: false,
          },
        },
      ],
    });
    expect(edited.refused).toEqual([]);
    expect((await gmEdit)[0].changes).toEqual(edited.applied);
    expect((await displayEdit)[0].changes).toEqual(edited.applied);
    const before = (await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene!;
    expect(before.items.note).toEqual({
      ...note,
      owner: "note-owner",
      text: "The tower is empty",
      position: { x: -300, y: 450 },
      square: false,
    });
    await server.restart();
    expect(
      (await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene,
    ).toEqual(before);
  } finally {
    await server.dispose();
  }
});

test("the text cap accepts its boundary and refuses longer adds and edits without relaying them", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise((resolve) => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id);
    const sceneId = gm.snapshot!.scene!.id;
    const accepted = await sendBatch(gm.socket, {
      id: "boundary",
      sceneId,
      changes: [
        { type: "add", item: { ...note, text: "x".repeat(maxTextLength) } },
      ],
    });
    expect(accepted.refused).toEqual([]);
    const events: unknown[] = [];
    player.socket.on("scene_changes", (value) => events.push(value));
    const refused = await sendBatch(gm.socket, {
      id: "too-long",
      sceneId,
      changes: [
        {
          type: "add",
          item: {
            ...note,
            id: "too-long",
            text: "x".repeat(maxTextLength + 1),
          },
        },
        {
          type: "update",
          id: note.id,
          fields: { text: "x".repeat(maxTextLength + 1), color: "red" },
        },
      ],
    });
    expect(refused.applied).toEqual([]);
    expect(refused.refused).toEqual([
      { id: "too-long", item: null },
      {
        id: note.id,
        item: { ...note, owner: "gm", text: "x".repeat(maxTextLength) },
      },
    ]);
    await new Promise((resolve) =>
      player.socket.emit("get_display_token", resolve),
    );
    expect(events).toEqual([]);
    await server.restart();
    expect(
      (await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene!.items,
    ).toEqual({
      note: { ...note, owner: "gm", text: "x".repeat(maxTextLength) },
    });
  } finally {
    await server.dispose();
  }
});
