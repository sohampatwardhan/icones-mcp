/**
 * Turns Iconify tool results into MCP content blocks.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { IconifyError } from "../iconify/errors.js";

/**
 * Builds a successful tool result from a summary line, JSON, and optional PNGs.
 *
 * @param summary - First line of the text block, shown above the JSON payload.
 * @param data - JSON-serializable payload pretty-printed with two-space indentation.
 * @param images - PNG buffers appended as `image/png` content, base64-encoded.
 * Defaults to no images.
 * @returns An MCP tool result whose content is text followed by the images.
 */
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

/**
 * Turns a thrown value into an MCP tool error.
 *
 * @param error - The rejection or thrown value from a tool handler.
 * @returns A result with `isError` set and a single text block. The message
 * comes from `Error.message` when `error` is an `Error`.
 *
 * @remarks
 * {@link IconifyError} is expected input validation or an Iconify miss, so it
 * is not logged. Any other error is written to stderr before the message is
 * returned to the client.
 */
export function asToolError(error: unknown): CallToolResult {
  if (!(error instanceof IconifyError)) {
    console.error("[iconify-mcp]", error);
  }
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
