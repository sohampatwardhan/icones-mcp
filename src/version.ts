import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const VERSION = (require("../package.json") as { version: string }).version;

export const USER_AGENT = `icones-mcp/${VERSION} (+https://github.com/sohampatwardhan/icones-mcp)`;

export const SERVER_NAME = "icones-mcp";
