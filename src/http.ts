import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { clientFromEnv, createIconesServer, type IconesServerOptions } from "./server.js";

export interface HttpServerOptions extends IconesServerOptions {
  host?: string;
  port?: number;
}

export interface RunningHttpServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

/**
 * Stateless Streamable HTTP. Each request gets a fresh server and transport.
 * There is no authentication; bind to localhost unless you add your own.
 */
export function startHttpServer(options: HttpServerOptions = {}): Promise<RunningHttpServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3333;
  const shared: HttpServerOptions = {
    ...options,
    client: options.client ?? clientFromEnv(options.clientOptions),
  };

  const http = createServer(async (req, res) => {
    try {
      await handleHttp(req, res, shared);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      console.error("[icones-mcp]", error);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
      }
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message }, id: null }));
    }
  });

  return new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, host, () => {
      const address = http.address();
      const bound = typeof address === "object" && address ? address.port : port;
      resolve({
        url: `http://${host}:${bound}/mcp`,
        port: bound,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            http.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    });
  });
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  options: HttpServerOptions,
): Promise<void> {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, mcp-session-id, mcp-protocol-version, last-event-id");
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");

  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }
  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const server = createIconesServer(options);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  const body = req.method === "POST" ? await readJsonBody(req) : undefined;
  await transport.handleRequest(req, res, body);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Request body is not valid JSON.");
  }
}
