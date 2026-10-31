import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { startHttpServer } from "../src/http.js";
import { testClient } from "./helpers.js";

describe("Streamable HTTP", () => {
  it("serves tools/list and a health check", async () => {
    const backend = testClient();
    const running = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      client: backend.client,
    });
    const transport = new StreamableHTTPClientTransport(new URL(running.url));
    const client = new Client({ name: "icones-http-test", version: "0.0.0" });
    try {
      const health = await fetch(running.url.replace(/\/mcp$/, "/health"));
      expect(await health.text()).toBe("ok");
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toContain("preview_icons");
    } finally {
      await client.close();
      await running.close();
    }
  });
});
