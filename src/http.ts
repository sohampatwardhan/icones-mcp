/**
 * Stateless Streamable HTTP transport for the Icônes MCP server.
 *
 * @remarks
 * Each MCP request builds a fresh server and transport. There is no session
 * store and no authentication. A single Iconify client is reused across
 * requests so the memory cache and request spacing stay shared.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { clientFromEnv, createIconesServer, type IconesServerOptions } from "./server.js";

/**
 * Bind address and {@link createIconesServer} options for {@link startHttpServer}.
 */
export interface HttpServerOptions extends IconesServerOptions {
  /**
   * Interface to bind.
   *
   * @defaultValue `"127.0.0.1"`
   */
  host?: string;

  /**
   * TCP port to bind. `0` asks the operating system for an ephemeral port.
   *
   * @defaultValue 3333
   */
  port?: number;
}

/**
 * A listening HTTP server and the URL of its MCP endpoint.
 */
export interface RunningHttpServer {
  /**
   * MCP endpoint, for example `http://127.0.0.1:3333/mcp`.
   */
  url: string;

  /**
   * Port the server actually bound. This can differ from the requested port
   * when the request was `0`.
   */
  port: number;

  /**
   * Stops accepting connections and closes the underlying Node server.
   *
   * @returns A promise that resolves when the server has closed.
   * @throws Error when Node reports an error while closing.
   */
  close: () => Promise<void>;
}

/**
 * Starts a stateless Streamable HTTP server.
 *
 * `POST /mcp` handles MCP JSON-RPC. `GET /health` returns the text `ok`.
 * Any other path responds with 404. `OPTIONS` returns 204 for CORS preflight.
 * Uncaught request errors are written as JSON-RPC internal errors and logged
 * to stderr.
 *
 * @param options - Bind address, port, and server construction options.
 * @returns The bound URL, port, and a `close` function.
 * @throws Error when the requested port cannot be bound.
 *
 * @example
 *
 * ```ts
 * const running = await startHttpServer({ host: "127.0.0.1", port: 3333 });
 * console.log(running.url);
 * await running.close();
 * ```
 *
 * @remarks
 * There is no authentication. Bind to localhost unless a reverse proxy adds
 * its own access control. CORS allows any origin.
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

/**
 * Routes one HTTP request to the health check, CORS preflight, or MCP transport.
 *
 * @param req - Incoming Node request.
 * @param res - Response to write.
 * @param options - Server options, including the shared Iconify client.
 * @returns A promise that settles after a short-circuit status is written or
 * the MCP transport has accepted the request.
 * @throws Error when a POST body is not valid JSON. The caller maps that to a
 * JSON-RPC error response.
 */
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

/**
 * Reads and parses a JSON request body.
 *
 * @param req - Incoming request whose body should be consumed.
 * @returns The parsed JSON value, or `undefined` when the body is empty.
 * @throws Error when the body is non-empty and is not valid JSON.
 */
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
