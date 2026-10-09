import cors from "cors";
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
    new AssetController(assetStore, joinTokens, MAX_ASSET_BYTES),
  ];

  server.loadMiddleware(globalMiddleware);
  server.loadControllers(controllers);
  server.loadMiddleware([frontendHandler(frontendAssets)]);

  const game = new GameServer(io, joinTokens);
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
      }).finally(() => { database.close(); releaseDirectory(); });
      return stopping;
    },
  };
  } catch (error) {
    releaseDirectory();
    throw error;
  }
}
