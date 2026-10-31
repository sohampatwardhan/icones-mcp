/**
 * Identity strings shared by the CLI, the MCP server, and the Iconify client.
 */

import { createRequire } from "node:module";

/**
 * CommonJS require bound to this module's URL.
 *
 * @remarks
 * The package does not enable JSON module imports. `createRequire` is how the
 * ESM build reads the `version` field from `package.json`.
 */
const require = createRequire(import.meta.url);

/**
 * Version string copied from this package's `package.json`.
 */
export const VERSION = (require("../package.json") as { version: string }).version;

/**
 * `User-Agent` header sent on Iconify API requests.
 */
export const USER_AGENT = `icones-mcp/${VERSION} (+https://github.com/sohampatwardhan/icones-mcp)`;

/**
 * Server name reported to MCP clients during initialization.
 */
export const SERVER_NAME = "icones-mcp";
