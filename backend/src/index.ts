import cors from "cors";
import express, { Application, RequestHandler } from "express";
import helmet from "helmet";
import { networkInterfaces } from "os";
import { join, resolve } from "path";
import { Server } from "socket.io";
// @ts-ignore
import msgParser from "socket.io-msgpack-parser";
import AppServer from "./entities/AppServer";
import AssetController from "./controllers/AssetController";
import { FsAssetStore } from "./entities/AssetStore";
import Controller from "./controllers/Controller";
import GameServer from "./entities/GameServer";
import HealthcheckController from "./controllers/HealthcheckController";
import IceServer from "./entities/IceServer";
import IceServerController from "./controllers/IceServerController";
import JoinTokens from "./entities/JoinTokens";
import { defaultDataDir, parseConfig, USAGE } from "./config";
import { frontendHandler } from "./frontend";
import { lanUrls } from "./lanUrls";
import { isOriginAllowed } from "./origin";
import frontendAssets from "./generated/frontendAssets";

let config;
try {
  config = parseConfig(process.argv.slice(2), process.env);
} catch (error: any) {
  console.error(`${error.message}\n\n${USAGE}`);
  process.exit(1);
}
if (config.help) {
  console.log(USAGE);
  process.exit(0);
}
const { allowOrigin } = config;

const iceServer = new IceServer(config.iceServersFile);
try {
  await iceServer.getIceServers();
} catch (error: any) {
  console.error(
    `Unable to load ICE servers from ${config.iceServersFile}: ${error.message}`
  );
  process.exit(1);
}

// The app tells players maps can be up to 50 MB. This leaves some headroom.
const MAX_ASSET_BYTES = 64 * 1024 * 1024;

const dataDir = resolve(
  config.dataDir ?? defaultDataDir(process.execPath, Bun.main, process.cwd())
);
const assetStore = new FsAssetStore(join(dataDir, "assets"), MAX_ASSET_BYTES);
try {
  await assetStore.init();
} catch (error: any) {
  console.error(
    `Unable to use the data directory ${dataDir}: ${error.message}\nChoose another with --data-dir.`
  );
  process.exit(1);
}

const joinTokens = new JoinTokens();

const app: Application = express();
const server = new AppServer(app, config.port);

const io = new Server(server, {
  cookie: false,
  allowRequest: (req, callback) => {
    callback(
      null,
      isOriginAllowed(req.headers.origin, req.headers.host, allowOrigin)
    );
  },
  serveClient: false,
  maxHttpBufferSize: 1e7,
  parser: msgParser,
});

const corsConfig = cors((req, callback) => {
  const allowed = isOriginAllowed(
    req.headers.origin,
    req.headers.host,
    allowOrigin
  );
  callback(null, { origin: allowed, credentials: true });
});

const globalMiddleware: Array<RequestHandler> = [
  helmet({
    // The frontend relies on inline scripts, blob: images and WebAssembly
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
  corsConfig,
];

const controllers: Array<Controller> = [
  new HealthcheckController(),
  new IceServerController(iceServer),
  new AssetController(assetStore, joinTokens, MAX_ASSET_BYTES),
];

server.loadMiddleware(globalMiddleware);
server.loadControllers(controllers);
server.loadMiddleware([frontendHandler(frontendAssets)]);

const httpServer = server.run(() => {
  const urls = [
    `http://localhost:${config.port}`,
    ...lanUrls(config.port, networkInterfaces()),
  ];
  console.log(`Owlbear Rodeo is running at:\n  ${urls.join("\n  ")}`);
  console.log(`Maps and tokens are kept in ${dataDir}`);
  if (!frontendAssets["/index.html"]) {
    console.warn(
      "No frontend is embedded in this build, so only the game server is available."
    );
  }
});
const game = new GameServer(io, joinTokens);
game.initaliseSocketServer(httpServer);
game.run();

process.once("SIGTERM", () => {
  console.log("sigterm event");
  server.close(() => {
    console.log("http server closed");
  });

  io.close(() => {
    console.log("socket server closed");
    io.sockets.emit("server shutdown");
  });

  setTimeout(() => {
    process.exit(0);
  }, 3000).unref();
});

process.on("unhandledRejection", (reason, p) => {
  console.log("Unhandled Rejection at: Promise", p, "reason:", reason);
  // application specific logging, throwing an error, or other logic here
});
