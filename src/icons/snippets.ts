/**
 * Code snippets in the formats Icônes offers for one icon.
 */

import type { ResolvedIcon } from "../iconify/types.js";
import { prettifySvg, type ExtractedSvg } from "./svg.js";

/**
 * Snippet formats `get_icon` can return.
 *
 * `iconify` is the `prefix:name` id. `url` is the Iconify SVG URL. `unocss`
 * and `tailwind` are class names for those icon presets.
 */
export const SNIPPET_FORMATS = [
  "iconify",
  "svg",
  "dataUrl",
  "url",
  "vue",
  "react",
  "svelte",
  "unocss",
  "tailwind",
] as const;

/**
 * One entry of {@link SNIPPET_FORMATS}.
 */
export type SnippetFormat = (typeof SNIPPET_FORMATS)[number];

/**
 * Builds a PascalCase component name from an Iconify id.
 *
 * @param iconId - Id such as `lucide:arrow-left`. Non-alphanumeric characters split words.
 * @returns A component name that does not start with a digit. Empty input becomes `Icon`.
 *
 * @example
 *
 * ```ts
 * toComponentName("lucide:arrow-left");
 * // "LucideArrowLeft"
 * ```
 */
export function toComponentName(iconId: string): string {
  const parts = iconId.split(/[^A-Za-z0-9]+/).filter((part) => part.length > 0);
  let name = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  if (!name) name = "Icon";
  if (/^[0-9]/.test(name)) name = `Icon${name}`;
  return name;
}

/**
 * Builds the code snippets Icônes shows for one icon.
 *
 * @param options - Icon, SVG, hosted URL, and the formats to include.
 * @returns A map of format name to snippet. Only requested formats are present.
 *
 * @remarks
 * Vue, React, and Svelte snippets keep the SVG markup, including `currentColor`
 * unless the caller already substituted a color. UnoCSS uses `i-prefix-name`.
 * Tailwind's Iconify plugin uses `icon-[prefix--name]`. Formats default to
 * every entry of {@link SNIPPET_FORMATS}.
 *
 * @example
 *
 * ```ts
 * buildSnippets({ icon, svg, url, formats: ["react", "iconify"] });
 * ```
 */
export function buildSnippets(options: {
  /**
   * Resolved icon. The id is the Iconify snippet and the component name.
   */
  icon: ResolvedIcon;
  /**
   * SVG markup, usually already including the license comment.
   */
  svg: string;
  /**
   * Hosted SVG URL, used as the `url` snippet.
   */
  url: string;
  /**
   * Formats to include.
   *
   * @defaultValue every entry of {@link SNIPPET_FORMATS}
   */
  formats?: readonly SnippetFormat[];
}): Record<string, string> {
  const wanted = new Set(options.formats ?? SNIPPET_FORMATS);
  const component = toComponentName(options.icon.id);
  const unoName = `${options.icon.prefix}-${options.icon.name}`;
  const pretty = prettifySvg(options.svg);
  const snippets: Record<string, string> = {};

  if (wanted.has("iconify")) snippets.iconify = options.icon.id;
  if (wanted.has("svg")) snippets.svg = pretty;
  if (wanted.has("dataUrl")) snippets.dataUrl = svgToDataUrl(options.svg);
  if (wanted.has("url")) snippets.url = options.url;
  if (wanted.has("vue")) snippets.vue = vueSnippet(pretty);
  if (wanted.has("react")) snippets.react = reactSnippet(pretty, component);
  if (wanted.has("svelte")) snippets.svelte = svelteSnippet(pretty);
  if (wanted.has("unocss")) snippets.unocss = `<div class="i-${unoName}"></div>`;
  if (wanted.has("tailwind")) {
    snippets.tailwind = `<span class="icon-[${options.icon.prefix}--${options.icon.name}]"></span>`;
  }
  return snippets;
}

/**
 * Encodes an SVG as a base64 data URL.
 *
 * @param svg - SVG document. The compact form is used so the URL stays shorter
 * than the prettified snippet.
 * @returns A `data:image/svg+xml;base64,...` URL.
 */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/**
 * Wraps an SVG in a Vue single-file component template.
 *
 * @param svg - Prettified SVG.
 * @returns A `<template>` block with the SVG indented one level.
 */
function vueSnippet(svg: string): string {
  const indented = svg.split("\n").join("\n  ");
  return `<template>\n  ${indented}\n</template>\n`;
}

/**
 * Wraps an SVG in a React component that spreads props onto the root element.
 *
 * @param svg - Prettified SVG.
 * @param component - PascalCase function name.
 * @returns A TypeScript module that imports `SVGProps` and exports the component.
 */
function reactSnippet(svg: string, component: string): string {
  const jsx = svgToJsx(svg)
    .replace(/^(<svg\b)([^>]*)>/, "$1$2 {...props}>")
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
  return `import type { SVGProps } from "react";\n\nexport function ${component}(props: SVGProps<SVGSVGElement>) {\n  return (\n${jsx}\n  );\n}\n`;
}

/**
 * Wraps an SVG in a Svelte component that spreads props onto the root element.
 *
 * @param svg - Prettified SVG.
 * @returns A Svelte 5 component using `$props()`.
 */
function svelteSnippet(svg: string): string {
  const withProps = svg.replace(/^(<svg\b)([^>]*)>/, "$1$2 {...props}>");
  return `<script lang="ts">\n  import type { SVGAttributes } from "svelte/elements";\n  let { ...props }: SVGAttributes<SVGSVGElement> = $props();\n</script>\n\n${withProps}\n`;
}

/**
 * Converts SVG markup to JSX. HTML comments become JSX comments, and attribute
 * names become camelCase.
 *
 * @param svg - SVG markup. HTML comments are rewritten before attributes so the
 * comment bodies are not treated as tags.
 * @returns JSX text. It is not pretty-printed beyond the input's own newlines.
 *
 * @remarks
 * `data-*` and `aria-*` names, and names containing `:`, are left unchanged.
 */
export function svgToJsx(svg: string): string {
  const comments = svg.replace(/<!--([\s\S]*?)-->/g, (_match, comment: string) => `{/*${comment}*/}`);
  return comments.replace(/<([A-Za-z0-9:-]+)([^>]*)>/g, (_full, tag: string, attrs: string) => {
    const converted = attrs.replace(/([\w:-]+)=/g, (_attr, name: string) => `${jsxAttribute(name)}=`);
    return `<${tag}${converted}>`;
  });
}

/**
 * HTML attributes renamed when an SVG is converted to JSX.
 */
const JSX_ATTRIBUTES: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  readonly: "readOnly",
};

/**
 * Maps one SVG attribute name to the JSX prop name.
 *
 * @param name - Attribute name as it appears in the SVG.
 * @returns The JSX name. Known HTML renames win, then hyphenated words are camelCased.
 */
function jsxAttribute(name: string): string {
  if (JSX_ATTRIBUTES[name]) return JSX_ATTRIBUTES[name];
  if (name.startsWith("data-") || name.startsWith("aria-") || name.includes(":")) return name;
  return name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export type { ExtractedSvg };
