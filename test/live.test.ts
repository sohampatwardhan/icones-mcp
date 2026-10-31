import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { createIconesServer } from "../src/server.js";

interface ToolContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

describe("live Iconify API", () => {
  it("returns a real Lucide icon as PNG image content", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createIconesServer({ clientOptions: { minIntervalMs: 50 } });
    await server.connect(serverTransport);
    const mcp = new Client({ name: "icones-live-test", version: "0.0.0" });
    await mcp.connect(clientTransport);
    try {
      const result = (await mcp.callTool({
        name: "get_icon",
        arguments: { icon: "lucide:home", size: 64 },
      })) as { isError?: boolean; content?: ToolContent[] };
      expect(result.isError).toBeFalsy();
      const text = result.content?.find((item) => item.type === "text")?.text ?? "";
      expect(text).toContain("lucide:home");
      expect(text).toContain("alias of house");
      expect(text.toLowerCase()).toContain("isc");
      expect(text).toContain("https://icones.js.org/collection/lucide?icon=lucide:home");
      const image = result.content?.find((item) => item.type === "image");
      expect(image?.mimeType).toBe("image/png");
      const png = PNG.sync.read(Buffer.from(image?.data ?? "", "base64"));
      expect(png.width).toBe(64);
      expect(png.height).toBe(64);
      const opaque = [...png.data].filter((_, index) => index % 4 === 3 && png.data[index] === 255).length;
      expect(opaque).toBeGreaterThan(20);
    } finally {
      await mcp.close();
      await server.close();
    }
  }, 60_000);
});
