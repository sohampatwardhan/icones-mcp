import { Resvg } from "@resvg/resvg-js";
import { IconifyError } from "../iconify/errors.js";
import { frameIconSvg } from "../icons/svg.js";
import { interFontPath } from "./font.js";

export interface RasterOptions {
  background?: string;
}

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

export function rasterizeIcon(svg: string, size: number, background?: string): Buffer {
  return rasterizeSvg(frameIconSvg(svg, size, background), {
    background: background && background !== "transparent" ? background : undefined,
  });
}

export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new IconifyError("Expected a PNG image.", "upstream");
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
