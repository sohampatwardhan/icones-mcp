#!/usr/bin/env node
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startHttpServer } from "./http.js";
import { createIconesServer } from "./server.js";
import { VERSION } from "./version.js";

const help = `icones-mcp ${VERSION}

Search Iconify icons (the catalog behind https://icones.js.org) and return PNG previews.

Usage:
  icones-mcp                 Start the stdio MCP server
  icones-mcp --http          Start Streamable HTTP on 127.0.0.1:3333
  icones-mcp --http --port 8787 --host 127.0.0.1

Environment:
  ICONIFY_API_URL            Iconify API base URL (default https://api.iconify.design)
  ICONES_MIN_INTERVAL_MS     Minimum gap between API requests (default 100)
  ICONES_CACHE=0             Disable the in-memory response cache

HTTP mode does not authenticate clients. Keep it on localhost.
`;

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
    console.error(`icones-mcp listening on ${running.url}`);
    return;
  }

  const server = createIconesServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("icones-mcp running on stdio");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
