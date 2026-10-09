import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createServer, Server as HttpServer } from "http";
import { AddressInfo } from "net";
import { Server } from "socket.io";
import { io as connect, Socket } from "socket.io-client";
import msgParser from "socket.io-msgpack-parser";
import GameServer from "./GameServer";
import JoinTokens from "./JoinTokens";

let httpServer: HttpServer;
let io: Server;
let url: string;
const joinTokens = new JoinTokens();
const sockets: Socket[] = [];

beforeAll(async () => {
  httpServer = createServer();
  io = new Server(httpServer, { parser: msgParser });
  new GameServer(io, joinTokens).run();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const socket of sockets.splice(0)) {
    socket.disconnect();
  }
});

afterAll(() => {
  io.close();
});

function client(): Socket {
  const socket = connect(url, { parser: msgParser, transports: ["websocket"] });
  sockets.push(socket);
  return socket;
}

function next(socket: Socket, event: string): Promise<any[]> {
  return new Promise((resolve) => socket.once(event, (...args) => resolve(args)));
}

async function join(socket: Socket, gameId: string, password = "") {
  const joined = next(socket, "joined_game");
  socket.emit("join_game", gameId, password);
  return joined;
}

async function until(condition: () => boolean) {
  while (!condition()) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("joining a game", () => {
  test("gives the player a token for that game", async () => {
    const socket = client();
    const [socketId, token] = await join(socket, "game-token");
    expect(socketId).toBe(socket.id);
    expect(joinTokens.verify(token)).toBe("game-token");
  });

  test("does not show a player's token to the rest of the game", async () => {
    const first = client();
    await join(first, "game-private");
    const seenByFirst = next(first, "joined_game");
    const second = client();
    const [, token] = await join(second, "game-private");
    expect(await seenByFirst).toEqual([second.id]);
    expect(joinTokens.verify(token)).toBe("game-private");
  });

  test("gives no token for a wrong password", async () => {
    await join(client(), "game-locked", "secret");
    const intruder = client();
    let joined = false;
    intruder.on("joined_game", () => {
      joined = true;
    });
    const refused = next(intruder, "auth_error");
    intruder.emit("join_game", "game-locked", "wrong");
    await refused;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(joined).toBe(false);
  });

  test("the token stops working when the player disconnects", async () => {
    const socket = client();
    const [, token] = await join(socket, "game-leave");
    socket.disconnect();
    await until(() => joinTokens.verify(token) === undefined);
    expect(joinTokens.verify(token)).toBeUndefined();
  });
});
