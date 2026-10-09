import AttemptLimiter from "./AttemptLimiter";
import cors from "cors";
import RoomController from "./controllers/RoomController";
import InviteController from "./controllers/InviteController";
import Accounts from "./accounts/Accounts";
import { setupLock } from "./accounts/setupLock";
import { apiOrigin } from "./accounts/apiOrigin";
import SignInController from "./controllers/SignInController";
import SetupController from "./controllers/SetupController";
import { OwlbearDatabase } from "./database";
import { lockDataDirectory } from "./database/directoryLock";
import { upgradeSteps, UpgradeStep } from "./database/startup";
import express, { Application, RequestHandler } from "express";
import helmet from "helmet";
import { networkInterfaces } from "os";
import { join, resolve } from "path";
import { Server } from "socket.io";
import msgParser from "socket.io-msgpack-parser";
import AppServer from "./entities/AppServer";
import AssetController from "./controllers/AssetController";
import { FsAssetStore } from "./entities/AssetStore";
import Controller from "./controllers/Controller";
import GameServer from "./entities/GameServer";
import HealthcheckController from "./controllers/HealthcheckController";
import JoinTokens from "./entities/JoinTokens";
import { Clock } from "./clock";
import { AddressInfo } from "net";
import { frontendHandler } from "./frontend";
import { lanUrls } from "./lanUrls";
import { isOriginAllowed } from "./origin";
import frontendAssets from "./generated/frontendAssets";

export interface ServerOptions {
  dataDir: string;
  port: number;
  allowOrigin: RegExp | null;
  clock: Clock;
  reopenSetup?: boolean;
  databaseUpgrades?: readonly UpgradeStep[];
}

export interface RunningServer {
  address: string;
  stop(): Promise<void>;
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const { port, allowOrigin } = options;
  // The app tells players maps can be up to 50 MB. This leaves some headroom.
  const MAX_ASSET_BYTES = 64 * 1024 * 1024;

  const dataDir = resolve(options.dataDir);
  const releaseDirectory = lockDataDirectory(dataDir);
  try {
  const database = new OwlbearDatabase(join(dataDir, "owlbear.db"), options.databaseUpgrades ?? upgradeSteps);
  const assetStore = new FsAssetStore(join(dataDir, "assets"), MAX_ASSET_BYTES, options.clock, database);
  try {
    await assetStore.init();
  } catch (error: any) {
    database.close();
    throw new Error(`Unable to use the data directory ${dataDir}: ${error.message}\nChoose another with --data-dir.`);
  }

  const accounts = new Accounts(database, options.clock, options.reopenSetup);
  const attempts = new AttemptLimiter(options.clock);
  const joinTokens = new JoinTokens();

  const app: Application = express();
  const server = new AppServer(app, port);

  const io = new Server({
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
    callback(null, { origin: allowed, credentials: true, preflightContinue: true });
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
    new AssetController(assetStore, joinTokens, MAX_ASSET_BYTES),
  ];

  server.loadMiddleware(globalMiddleware);
  app.use("/api", apiOrigin(allowOrigin));
  // An allowed browser origin needs this preflight to submit the setup form.
  app.options("/api/setup", (req, res, next) => {
    if (req.headers["access-control-request-method"] === "POST" &&
      isOriginAllowed(req.headers.origin, req.headers.host, allowOrigin)) res.sendStatus(204);
    else next();
  });
  app.use(setupLock(accounts, frontendAssets));
  app.options("*", (_req, res) => res.sendStatus(204));
  app.use("/api", new SetupController(accounts).setRoutes());
  app.use("/api", new SignInController(accounts, attempts).setRoutes());
  const game = new GameServer(io, joinTokens, database, options.clock, attempts);
  app.use("/api", new RoomController(accounts, database, game.gameRepo, (id, name) => io.to(id).emit("room_state", { name })).setRoutes());
  app.use("/api", new InviteController(accounts).setRoutes());
  server.loadControllers(controllers);
  server.loadMiddleware([frontendHandler(frontendAssets)]);

  io.on("connection", (socket) => {
    socket.use(([event], next) => {
      if (!accounts.hasAdministrator()) {
        if (event === "join_game" || event === "join_display") socket.emit("setup_required");
        return;
      }
      next();
    });
  });
  const httpServer = await new Promise<import("http").Server>((resolve, reject) => {
    const listening = server.run(() => resolve(listening));
    listening.once("error", reject);
    game.initaliseSocketServer(listening);
    game.run();
  }).catch((error) => {
    io.close();
    database.close();
    throw error;
  });
  const boundPort = (httpServer.address() as AddressInfo).port;
  const urls = [`http://localhost:${boundPort}`, ...lanUrls(boundPort, networkInterfaces())];
  console.log(`Owlbear Rodeo is running at:\n  ${urls.join("\n  ")}`);
  console.log(`Maps and tokens are kept in ${dataDir}`);
  if (accounts.setupState() === "open") console.warn("Warning: setup is open; the next visitor can create one new administrator.");
  else console.log(accounts.hasAdministrator() ? "An administrator exists; setup is closed." : "No administrator exists; setup is required.");
  if (!frontendAssets["/index.html"]) {
    console.warn("No frontend is embedded in this build, so only the game server is available.");
  }
  let stopping: Promise<void> | undefined;
  return {
    address: `http://localhost:${boundPort}`,
    stop() {
      stopping ??= new Promise<void>((resolve, reject) => {
        io.close((error?: Error) => error ? reject(error) : resolve());
        httpServer.closeIdleConnections();
      }).finally(() => {
        try { game.flush(); }
        finally { database.close(); releaseDirectory(); }
      });
      return stopping;
    },
  };
  } catch (error) {
    releaseDirectory();
    throw error;
  }
}
