import { describe, expect, it } from "vitest";
import { IconifyError } from "../src/iconify/errors.js";
import { assertColor } from "../src/icons/color.js";
import { iconPageUrl, parseIconId, parseIconIds } from "../src/icons/names.js";
import { buildSnippets, toComponentName } from "../src/icons/snippets.js";
import { filterCollections, summarizeInfo } from "../src/icons/summary.js";
import { buildSvg } from "../src/icons/svg.js";
import { testInfo } from "./helpers.js";
import type { ResolvedIcon } from "../src/iconify/types.js";

const icon: ResolvedIcon = {
  prefix: "lucide",
  name: "arrow-left",
  id: "lucide:arrow-left",
  width: 24,
  height: 24,
  left: 0,
  top: 0,
  body: '<path fill="currentColor" stroke-width="2" d="M4 12h16"/>',
  monotone: true,
};

describe("icon ids", () => {
  it("parses prefix and name", () => {
    expect(parseIconId(" lucide:house ")).toEqual({ prefix: "lucide", name: "house", id: "lucide:house" });
    expect(iconPageUrl("lucide", "house")).toBe("https://icones.js.org/collection/lucide?icon=lucide:house");
  });

  it("rejects malformed ids and duplicates", () => {
    expect(() => parseIconId("house")).toThrow(IconifyError);
    expect(() => parseIconId("lucide:house:extra")).toThrow(IconifyError);
    expect(() => parseIconId("../:passwd")).toThrow(IconifyError);
    expect(parseIconIds(["lucide:house", "lucide:house", "mdi:home"], 10)).toEqual(["lucide:house", "mdi:home"]);
  });

  it("rejects colors that could break out of an attribute", () => {
    expect(() => assertColor('"><script>', "color")).toThrow(IconifyError);
    expect(assertColor("#ff00aa", "color")).toBe("#ff00aa");
  });
});

describe("snippets", () => {
  const snippets = buildSnippets({
    icon,
    svg: buildSvg(icon, { comment: "Icon lucide:arrow-left. License: ISC" }),
    url: "https://api.iconify.design/lucide/arrow-left.svg",
  });

  it("covers the Icônes formats and keeps currentColor", () => {
    expect(toComponentName("fa6-solid:arrow-left")).toBe("Fa6SolidArrowLeft");
    expect(snippets.iconify).toBe("lucide:arrow-left");
    expect(snippets.svg).toContain("currentColor");
    expect(snippets.svg).toContain("License: ISC");
    expect(snippets.dataUrl?.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(snippets.url).toContain("/lucide/arrow-left.svg");
    expect(snippets.vue).toContain("<template>");
    expect(snippets.react).toContain("export function LucideArrowLeft");
    expect(snippets.react).toContain("strokeWidth");
    expect(snippets.react).not.toContain("<!--");
    expect(snippets.svelte).toContain("$props()");
    expect(snippets.unocss).toBe('<div class="i-lucide-arrow-left"></div>');
    expect(snippets.tailwind).toBe('<span class="icon-[lucide--arrow-left]"></span>');
  });

  it("applies a requested color inside the SVG", () => {
    const colored = buildSvg(icon, { color: "#ff0000" });
    expect(colored).toContain("#ff0000");
    expect(colored).not.toContain("currentColor");
  });
});

describe("collection filter", () => {
  const collections = [
    summarizeInfo("mdi", { ...testInfo, name: "Material Design Icons", total: 7000, category: "Material" }),
    summarizeInfo("lucide", { ...testInfo, name: "Lucide", total: 1500, category: "UI 24px", license: { title: "ISC", spdx: "ISC" } }),
    summarizeInfo("mdi-light", { ...testInfo, name: "Material Design Light", total: 200, category: "Material" }),
  ];

  it("ranks prefix matches and keeps license data", () => {
    const result = filterCollections(collections, { text: "mdi", limit: 10 });
    expect(result.matchCount).toBe(2);
    expect(result.collections.map((item) => item.prefix)).toEqual(["mdi", "mdi-light"]);
    expect(result.collections[0]?.license?.title).toBe("MIT");
  });

  it("filters by category", () => {
    const result = filterCollections(collections, { category: "ui", limit: 10 });
    expect(result.collections.map((item) => item.prefix)).toEqual(["lucide"]);
  });
});
