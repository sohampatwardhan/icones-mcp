import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { IconifyError } from "../iconify/errors.js";

export function toolText(summary: string, data: unknown, images: Buffer[] = []): CallToolResult {
  const content: CallToolResult["content"] = [
    { type: "text", text: `${summary}\n\n${JSON.stringify(data, null, 2)}` },
  ];
  for (const image of images) {
    content.push({
      type: "image",
      data: image.toString("base64"),
      mimeType: "image/png",
    });
  }
  return { content };
}

export function asToolError(error: unknown): CallToolResult {
  if (!(error instanceof IconifyError)) {
    console.error("[icones-mcp]", error);
  }
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
