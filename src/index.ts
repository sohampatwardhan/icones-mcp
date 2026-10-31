/**
 * Public API for embedding the Icônes MCP server.
 *
 * Hosts that do not shell out to the CLI import the server factory, the HTTP
 * transport, and the Iconify client from this module. The declarations
 * themselves are documented next to their implementations.
 *
 * @packageDocumentation
 */

export { IconifyClient, type IconifyClientOptions } from "./iconify/client.js";
export { IconifyError, type IconifyErrorCode } from "./iconify/errors.js";
export { startHttpServer, type HttpServerOptions, type RunningHttpServer } from "./http.js";
export { createIconesServer, clientFromEnv, type IconesServerOptions } from "./server.js";
export { SERVER_NAME, VERSION } from "./version.js";
