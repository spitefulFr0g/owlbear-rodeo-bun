import { expect, test } from "bun:test";
import { beginLibrary, createRoom, setupAdministrator, startTestServer } from "./testing/serverHelpers";

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
