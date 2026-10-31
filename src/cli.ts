#!/usr/bin/env node
/**
 * Command-line entry for `iconify-mcp`.
 *
 * With no flags the process speaks MCP over stdin and stdout. `--http` listens
 * for stateless Streamable HTTP instead. Logs go to stderr so they stay off
 * the JSON-RPC stream. `icones-mcp` is a compatibility alias for the same program.
 *
 * @packageDocumentation
 * @remarks
 * HTTP mode does not authenticate clients. Bind it to localhost unless another
 * process is enforcing access.
 */

import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startHttpServer } from "./http.js";
import { createIconesServer } from "./server.js";
import { VERSION } from "./version.js";

/**
 * Usage text printed for `--help` and `-h`.
 */
const help = `iconify-mcp ${VERSION}

Unofficial community MCP server for the Iconify catalog.
Icon pages link to Icônes (https://icones.js.org).

Usage:
  iconify-mcp                 Start the stdio MCP server
  iconify-mcp --http          Start Streamable HTTP on 127.0.0.1:3333
  iconify-mcp --http --port 8787 --host 127.0.0.1

icones-mcp is a compatibility alias for the same program.

Environment:
  ICONIFY_API_URL            Iconify API base URL (default https://api.iconify.design)
  ICONES_MIN_INTERVAL_MS     Minimum gap between API requests (default 100)
  ICONES_CACHE=0             Disable the in-memory response cache

HTTP mode does not authenticate clients. Keep it on localhost.
`;

/**
 * Parses CLI flags and starts either the stdio server or Streamable HTTP.
 *
 * @returns A promise that stays pending while the stdio server is connected.
 * HTTP mode resolves once the port is listening; the process then stays alive
 * with the open server.
 * @throws Error when `--port` is present but not an integer from 1 through 65535.
 * Listen failures and MCP connection failures reject the same promise. The
 * process-level catch sets a non-zero exit code.
 *
 * @example
 *
 * ```sh
 * node dist/cli.js
 * node dist/cli.js --http --port 3333
 * ```
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      http: { type: "boolean", default: false },
      port: { type: "string" },
      host: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  if (values.help) {
    process.stdout.write(help);
    return;
  }

  if (values.http || values.port || values.host) {
    const port = values.port ? Number(values.port) : 3333;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Port "${values.port}" is not valid.`);
    }
    const running = await startHttpServer({ host: values.host ?? "127.0.0.1", port });
    console.error(`iconify-mcp listening on ${running.url}`);
    return;
  }

  const server = createIconesServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("iconify-mcp running on stdio");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
