import { expect, test } from "bun:test";
import { maxTextLength } from "../../src/sceneRules";
import { beginLibrary, createRoom, libraryCommand, libraryMetadata, setupAdministrator, startTestServer, uploadLibrary } from "./testing/serverHelpers";

test("malformed media types are refused before reserving an upload", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Validation");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    for (const mime of [["image/png"], 12, null, {}]) {
      const response = await beginLibrary(server, gm.token, { files: { original: { size: 5, mime } } });
      expect(response.status).toBe(400);
    }
  } finally { await server.dispose(); }
});

test("a default label too long for a placed token's label is refused", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Validation");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const label = (length: number) => ({ defaults: { ...libraryMetadata.defaults, defaultLabel: "x".repeat(length) } });
    expect((await beginLibrary(server, gm.token, label(maxTextLength + 1))).status).toBe(400);
    const asset = await uploadLibrary(server, gm.token, "image", label(maxTextLength));
    expect((await libraryCommand(gm.socket, { action: "edit", id: asset.id, changes: label(maxTextLength + 1) })).ok).toBe(false);
    expect((await libraryCommand(gm.socket, { action: "edit", id: asset.id, changes: label(maxTextLength) })).ok).toBe(true);
  } finally { await server.dispose(); }
});
