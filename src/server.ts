import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { IconifyClient, type IconifyClientOptions } from "./iconify/client.js";
import { registerIconesResources } from "./mcp/resources.js";
import { registerIconesTools } from "./mcp/tools.js";
import { SERVER_NAME, VERSION } from "./version.js";

export interface IconesServerOptions {
  client?: IconifyClient;
  clientOptions?: IconifyClientOptions;
  name?: string;
  version?: string;
}

export function createIconesServer(options: IconesServerOptions = {}): McpServer {
  const client = options.client ?? clientFromEnv(options.clientOptions);
  const server = new McpServer({
    name: options.name ?? SERVER_NAME,
    version: options.version ?? VERSION,
  });
  registerIconesTools(server, client);
  registerIconesResources(server, client);
  return server;
}

export function clientFromEnv(overrides: IconifyClientOptions = {}): IconifyClient {
  const interval = process.env.ICONES_MIN_INTERVAL_MS;
  const parsedInterval = interval ? Number(interval) : undefined;
  return new IconifyClient({
    baseUrl: process.env.ICONIFY_API_URL || undefined,
    minIntervalMs: parsedInterval !== undefined && Number.isFinite(parsedInterval) ? parsedInterval : undefined,
    cache: process.env.ICONES_CACHE === "0" ? false : undefined,
    ...overrides,
  });
}
