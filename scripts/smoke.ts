/**
 * Stdio smoke test for the built CLI.
 *
 * Connects to `dist/cli.js`, checks the tool list, calls `preview_icons` with
 * the twelve Lucide icons from the README, and writes the PNG. The script
 * exits non-zero when the sheet is missing, too small, or has no dark strokes.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PNG } from "pngjs";

/**
 * Repository root, one directory above this script.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Lucide ids drawn by the README contact sheet.
 */
const ICONS = [
  "lucide:house",
  "lucide:search",
  "lucide:heart",
  "lucide:star",
  "lucide:sun",
  "lucide:moon",
  "lucide:cloud",
  "lucide:camera",
  "lucide:bell",
  "lucide:settings",
  "lucide:user",
  "lucide:mail",
];

/**
 * One MCP content block returned by `callTool` in this script.
 */
interface ToolContent {
  /**
   * MCP content type, such as `text` or `image`.
   */
  type: string;

  /**
   * Text payload when `type` is `text`.
   */
  text?: string;

  /**
   * Base64 image payload when `type` is `image`.
   */
  data?: string;

  /**
   * MIME type of an image block.
   */
  mimeType?: string;
}

/**
 * Directory for the extra contact-sheet copy.
 *
 * @returns `SMOKE_OUT` when that variable is a non-empty path, otherwise
 * {@link tmpdir}.
 * @remarks
 * The copy stays out of `/opt`. Creating `/opt/cursor` fails with `EACCES` on
 * machines where `/opt` is not writable.
 */
function smokeArtifactDir(): string {
  const configured = process.env.SMOKE_OUT?.trim();
  return configured ? configured : tmpdir();
}

/**
 * Runs the smoke check and writes the contact sheet.
 *
 * @returns A promise that resolves after the client is closed.
 * @throws Error when the build is missing, the server name is not `iconify-mcp`,
 * the tool list changed, `preview_icons` fails, or the PNG does not look like a sheet of icons.
 *
 * @remarks
 * The sheet checked into the repo is `CONTACT_SHEET_OUT`, or
 * `docs/contact-sheet.png` under the repository root. A second copy is written
 * to `contact-sheet.png` inside {@link smokeArtifactDir}.
 */
async function main(): Promise<void> {
  const cli = join(root, "dist/cli.js");
  if (!existsSync(cli)) {
    throw new Error("dist/cli.js is missing. Run npm run build first.");
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli],
    cwd: root,
    stderr: "inherit",
  });
  const client = new Client({ name: "iconify-mcp-smoke", version: "0.0.0" });
  await client.connect(transport);
  try {
    const server = client.getServerVersion();
    if (server?.name !== "iconify-mcp") {
      throw new Error(`Unexpected server name: ${server?.name ?? "missing"}`);
    }
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    const expected = ["get_collection", "get_icon", "list_collections", "preview_icons", "search_icons"];
    if (names.join() !== expected.join()) {
      throw new Error(`Unexpected tools: ${names.join(", ")}`);
    }

    const result = (await client.callTool({
      name: "preview_icons",
      arguments: {
        icons: ICONS,
        title: "Lucide",
        columns: 4,
        size: 72,
        color: "#1c1917",
        background: "#f7f6f3",
      },
    })) as { isError?: boolean; content?: ToolContent[] };

    if (result.isError) {
      throw new Error(result.content?.map((item) => item.text).join("\n") || "preview_icons failed");
    }
    const image = result.content?.find((item) => item.type === "image");
    if (image?.mimeType !== "image/png" || !image.data) {
      throw new Error("preview_icons did not return a PNG image.");
    }
    const png = Buffer.from(image.data, "base64");
    const decoded = PNG.sync.read(png);
    if (decoded.width < 200 || decoded.height < 150) {
      throw new Error(`Contact sheet is unexpectedly small (${decoded.width}×${decoded.height}).`);
    }
    let dark = 0;
    for (let index = 0; index < decoded.data.length; index += 4) {
      const red = decoded.data[index] ?? 255;
      const alpha = decoded.data[index + 3] ?? 0;
      if (alpha > 200 && red < 80) dark += 1;
    }
    if (dark < 100) {
      throw new Error("Contact sheet PNG has no visible icon strokes.");
    }

    const out = process.env.CONTACT_SHEET_OUT ?? join(root, "docs/contact-sheet.png");
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, png);
    const artifactDir = smokeArtifactDir();
    await mkdir(artifactDir, { recursive: true });
    const artifact = join(artifactDir, "contact-sheet.png");
    await writeFile(artifact, png);
    const text = result.content?.find((item) => item.type === "text")?.text ?? "";
    process.stderr.write(
      `contact sheet ${decoded.width}×${decoded.height} (${png.length} bytes) -> ${out}\ncopy -> ${artifact}\n${text.split("\n")[0]}\n`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
