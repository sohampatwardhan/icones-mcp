import { describe, expect, it } from "vitest";
import { buildSheetSvg, renderContactSheet } from "../src/render/contact-sheet.js";
import { pngSize, rasterizeIcon } from "../src/render/png.js";
import { buildSvg } from "../src/icons/svg.js";
import type { ResolvedIcon } from "../src/iconify/types.js";
import { decodePng, hasColor, homeBody } from "./helpers.js";

const icon = (name: string, body = homeBody): ResolvedIcon => ({
  prefix: "test",
  name,
  id: `test:${name}`,
  width: 24,
  height: 24,
  left: 0,
  top: 0,
  body,
  monotone: true,
});

describe("rasterizer", () => {
  it("renders a colored PNG at the requested size", () => {
    const svg = buildSvg(icon("home"), { height: "auto", color: "#ff0000" });
    const png = rasterizeIcon(svg, 32, "#ffffff");
    expect(pngSize(png)).toEqual({ width: 32, height: 32 });
    const decoded = decodePng(png);
    expect(hasColor(decoded, 255, 0, 0)).toBe(true);
    expect(hasColor(decoded, 255, 255, 255)).toBe(true);
  });

  it("draws a labeled contact sheet", () => {
    const icons = [icon("home"), icon("star")];
    const built = buildSheetSvg({
      icons: icons.map((item) => ({ icon: item, label: item.name })),
      title: "Test",
      subtitle: "MIT",
      iconSize: 48,
      columns: 2,
      color: "#112233",
    });
    expect(built.svg).toContain(">home<");
    expect(built.svg).toContain(">star<");
    expect(built.svg).toContain("font-family=\"Inter, sans-serif\"");
    const rendered = renderContactSheet({
      icons: icons.map((item) => ({ icon: item, label: item.name })),
      title: "Test",
      subtitle: "MIT",
      iconSize: 48,
      columns: 2,
      color: "#112233",
    });
    expect(pngSize(rendered.png)).toEqual({ width: built.layout.width, height: built.layout.height });
    const decoded = decodePng(rendered.png);
    expect(hasColor(decoded, 0x11, 0x22, 0x33)).toBe(true);
    expect(decoded.data.length).toBe(built.layout.width * built.layout.height * 4);
  });
});
