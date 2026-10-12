import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { defaultSceneGrid } from "../../src/sceneRules";
import { createRoom, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const action = (socket: Socket, event: string, value: unknown): Promise<any> =>
  new Promise(resolve => socket.timeout(500).emit(event, value, (error: Error | null, result: unknown) => resolve(error ? "timeout" : result)));
const barrier = (socket: Socket) => new Promise(resolve => socket.emit("get_display_token", resolve));

test("the v0.3.0 scene grid action is gone: nobody is answered or sent anything and the grid stays", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await action(gm.socket, "session", true);
    const player = await server.joinRoom(room.id);
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    const messages: unknown[] = [];
    for (const peer of [gm, player, display]) {
      for (const event of ["scene_grid", "scene_settings"]) peer.socket.on(event, value => messages.push(value));
    }
    const payload = { sceneId: gm.snapshot!.scene!.id, grid: { ...defaultSceneGrid, type: "hexVertical" } };
    expect(await Promise.all([gm, player, display].map(peer => action(peer.socket, "scene_grid", payload))))
      .toEqual(["timeout", "timeout", "timeout"]);
    for (const peer of [gm, player]) await barrier(peer.socket);
    expect(messages).toEqual([]);
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene!.grid).toEqual(defaultSceneGrid);
  } finally { await server.dispose(); }
});
