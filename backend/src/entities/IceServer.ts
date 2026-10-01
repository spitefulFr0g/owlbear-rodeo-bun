// Imported rather than read from disk so it is bundled into the executable
import defaultIceServers from "../../ice.json";

export default class IceServer {
  private readonly servers: Promise<any>;

  /** @param file Optional JSON file that replaces the bundled `ice.json` */
  constructor(file?: string) {
    this.servers = file
      ? Bun.file(file).json()
      : Promise.resolve(defaultIceServers);
  }

  async getIceServers(): Promise<any> {
    const servers = await this.servers;
    return servers;
  }
}
