import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createIconesServer } from "../src/server.js";
import { decodePng, hasColor, testClient } from "./helpers.js";

interface ToolContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

interface ToolResult {
  content?: ToolContent[];
  isError?: boolean;
}

async function connect() {
  const backend = testClient();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createIconesServer({ client: backend.client });
  await server.connect(serverTransport);
  const mcp = new Client({ name: "iconify-mcp-test", version: "0.0.0" });
  await mcp.connect(clientTransport);
  return {
    mcp,
    calls: backend.calls,
    async close() {
      await mcp.close();
      await server.close();
    },
  };
}

function image(result: ToolResult): Buffer {
  const block = result.content?.find((item) => item.type === "image");
  expect(block?.mimeType).toBe("image/png");
  expect(block?.data).toBeTruthy();
  return Buffer.from(block?.data ?? "", "base64");
}

describe("MCP tools and resources", () => {
  it("lists tools, returns a PNG, and exposes licenses", async () => {
    const { mcp, close } = await connect();
    try {
      const listed = await mcp.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
        "get_collection",
        "get_icon",
        "list_collections",
        "preview_icons",
        "search_icons",
      ]);

      const collections = (await mcp.callTool({
        name: "list_collections",
        arguments: { query: "test" },
      })) as ToolResult;
      expect(collections.isError).toBeFalsy();
      expect(collections.content?.[0]?.text).toContain('"spdx": "MIT"');

      const icon = (await mcp.callTool({
        name: "get_icon",
        arguments: { icon: "test:house", size: 36, color: "#ff0000" },
      })) as ToolResult;
      expect(icon.isError).toBeFalsy();
      expect(icon.content?.[0]?.text).toContain("alias of home");
      expect(icon.content?.[0]?.text).toContain("i-test-house");
      expect(icon.content?.[0]?.text).toContain("https://icones.js.org/collection/test?icon=test:house");
      const png = decodePng(image(icon));
      expect(png.width).toBe(36);
      expect(hasColor(png, 255, 0, 0)).toBe(true);

      const preview = (await mcp.callTool({
        name: "preview_icons",
        arguments: { icons: ["test:home", "test:star"], columns: 2, title: "Test" },
      })) as ToolResult;
      const sheet = decodePng(image(preview));
      expect(sheet.width).toBeGreaterThan(80);
      expect(hasColor(sheet, 0x1c, 0x19, 0x17)).toBe(true);
      expect(preview.content?.[0]?.text).toContain("MIT");

      const missing = (await mcp.callTool({
        name: "get_icon",
        arguments: { icon: "not an icon" },
      })) as ToolResult;
      expect(missing.isError).toBe(true);
      expect(missing.content?.[0]?.text).toContain("prefix:name");
    } finally {
      await close();
    }
  });

  it("reads svg and png resources on iconify:// and icones://", async () => {
    const { mcp, close } = await connect();
    try {
      expect(mcp.getServerVersion()?.name).toBe("iconify-mcp");
      for (const scheme of ["iconify", "icones"]) {
        const svg = await mcp.readResource({ uri: `${scheme}://icon/test/home.svg` });
        const svgContent = svg.contents[0];
        expect(svgContent?.mimeType).toBe("image/svg+xml");
        expect(svgContent && "text" in svgContent ? svgContent.text : "").toContain("<svg");
        expect(svgContent && "text" in svgContent ? svgContent.text : "").toContain("MIT");

        const png = await mcp.readResource({ uri: `${scheme}://icon/test/home.png` });
        const pngContent = png.contents[0];
        expect(pngContent?.mimeType).toBe("image/png");
        const decoded = decodePng(Buffer.from(pngContent && "blob" in pngContent ? pngContent.blob : "", "base64"));
        expect(decoded.width).toBe(128);
        expect(hasColor(decoded, 0x1c, 0x19, 0x17)).toBe(true);

        const collection = await mcp.readResource({ uri: `${scheme}://collection/test` });
        const collectionContent = collection.contents[0];
        expect(collectionContent && "text" in collectionContent ? collectionContent.text : "").toContain('"license"');
      }
    } finally {
      await close();
    }
  });
});
