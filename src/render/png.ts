/**
 * Rasterizes SVG documents to PNG with the bundled Inter font.
 */

import { Resvg } from "@resvg/resvg-js";
import { IconifyError } from "../iconify/errors.js";
import { frameIconSvg } from "../icons/svg.js";
import { interFontPath } from "./font.js";

/**
 * Extra raster options for a document that is already a complete SVG.
 */
export interface RasterOptions {
  /**
   * Page background passed to resvg. `transparent` and omission leave the
   * pixels outside painted shapes transparent.
   */
  background?: string;
}

/**
 * Rasterizes a complete SVG document to PNG.
 *
 * System fonts are not loaded. Text uses the bundled Inter Regular face, which
 * is what contact-sheet labels ask for by family name.
 *
 * @param svg - A full SVG document, including the root element.
 * @param options - Optional page background.
 * @returns A PNG buffer. The signature is checked before the buffer is returned.
 * @throws {@link IconifyError} with code `upstream` when the bundled font is
 * missing, resvg fails, or the output is not a PNG. An {@link IconifyError}
 * raised inside the try block is rethrown with its original code.
 *
 * @remarks
 * `shapeRendering` and `textRendering` are set to geometric precision (`2`).
 */
export function rasterizeSvg(svg: string, options: RasterOptions = {}): Buffer {
  try {
    const resvg = new Resvg(svg, {
      font: {
        fontFiles: [interFontPath()],
        loadSystemFonts: false,
        defaultFontFamily: "Inter",
        sansSerifFamily: "Inter",
      },
      shapeRendering: 2,
      textRendering: 2,
      background: options.background && options.background !== "transparent" ? options.background : undefined,
      logLevel: "off",
    });
    const png = Buffer.from(resvg.render().asPng());
    if (png.length < 8 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error("renderer did not produce a PNG");
    }
    return png;
  } catch (error) {
    if (error instanceof IconifyError) throw error;
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new IconifyError(`Could not rasterize the icon SVG (${reason}).`, "upstream");
  }
}

/**
 * Frames one icon in a square and rasterizes it.
 *
 * @param svg - Icon SVG, usually from {@link buildSvg}.
 * @param size - Square edge length in pixels.
 * @param background - Fill behind the icon. `transparent` omits the fill.
 * @returns A PNG of `size` by `size` pixels.
 * @throws {@link IconifyError} when rasterization fails. See {@link rasterizeSvg}.
 */
export function rasterizeIcon(svg: string, size: number, background?: string): Buffer {
  return rasterizeSvg(frameIconSvg(svg, size, background), {
    background: background && background !== "transparent" ? background : undefined,
  });
}

/**
 * Reads width and height from a PNG IHDR chunk.
 *
 * @param png - A PNG file buffer.
 * @returns Pixel width and height from bytes 16 and 20 of the buffer.
 * @throws {@link IconifyError} with code `upstream` when the buffer is shorter
 * than 24 bytes or does not start with the PNG signature.
 */
export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new IconifyError("Expected a PNG image.", "upstream");
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
