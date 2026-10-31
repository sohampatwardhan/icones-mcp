/**
 * MCP server factory for Icônes tools and resources.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { IconifyClient, type IconifyClientOptions } from "./iconify/client.js";
import { registerIconesResources } from "./mcp/resources.js";
import { registerIconesTools } from "./mcp/tools.js";
import { SERVER_NAME, VERSION } from "./version.js";

/**
 * Construction options for {@link createIconesServer}.
 */
export interface IconesServerOptions {
  /**
   * Iconify client to use for every tool and resource.
   *
   * @remarks
   * When omitted, {@link clientFromEnv} creates one. An explicit client is
   * how tests inject a mock `fetch`.
   */
  client?: IconifyClient;

  /**
   * Options forwarded to {@link clientFromEnv} when {@link IconesServerOptions.client | client}
   * is omitted. Ignored when `client` is set.
   */
  clientOptions?: IconifyClientOptions;

  /**
   * MCP server name reported during initialization.
   *
   * @defaultValue {@link SERVER_NAME}
   */
  name?: string;

  /**
   * MCP server version reported during initialization.
   *
   * @defaultValue {@link VERSION}
   */
  version?: string;
}

/**
 * Creates an MCP server with the Icônes tools and resources registered.
 *
 * @param options - Optional client, name, and version overrides.
 * @returns A server ready for `connect`. The caller supplies stdio, HTTP, or
 * an in-memory transport.
 *
 * @example
 *
 * ```ts
 * const server = createIconesServer();
 * await server.connect(transport);
 * ```
 */
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

/**
 * Builds an {@link IconifyClient} from process environment variables.
 *
 * Reads `ICONIFY_API_URL`, `ICONES_MIN_INTERVAL_MS`, and `ICONES_CACHE`.
 * `ICONES_CACHE=0` disables the memory cache. A non-numeric interval is ignored
 * and the client default of 100 milliseconds is kept.
 *
 * @param overrides - Options applied after the environment. A field set here
 * replaces the corresponding environment value, including an explicit
 * `undefined` only when the caller omits the field.
 * @returns A client configured for this process.
 * @throws {@link IconifyError} when `ICONIFY_API_URL` is not an http(s) URL.
 *
 * @remarks
 * The default origin is `https://api.iconify.design`.
 */
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
