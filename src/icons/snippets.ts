import type { ResolvedIcon } from "../iconify/types.js";
import { prettifySvg, type ExtractedSvg } from "./svg.js";

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

export type SnippetFormat = (typeof SNIPPET_FORMATS)[number];

export function toComponentName(iconId: string): string {
  const parts = iconId.split(/[^A-Za-z0-9]+/).filter((part) => part.length > 0);
  let name = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  if (!name) name = "Icon";
  if (/^[0-9]/.test(name)) name = `Icon${name}`;
  return name;
}

export function buildSnippets(options: {
  icon: ResolvedIcon;
  svg: string;
  url: string;
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

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function vueSnippet(svg: string): string {
  const indented = svg.split("\n").join("\n  ");
  return `<template>\n  ${indented}\n</template>\n`;
}

function reactSnippet(svg: string, component: string): string {
  const jsx = svgToJsx(svg)
    .replace(/^(<svg\b)([^>]*)>/, "$1$2 {...props}>")
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
  return `import type { SVGProps } from "react";\n\nexport function ${component}(props: SVGProps<SVGSVGElement>) {\n  return (\n${jsx}\n  );\n}\n`;
}

function svelteSnippet(svg: string): string {
  const withProps = svg.replace(/^(<svg\b)([^>]*)>/, "$1$2 {...props}>");
  return `<script lang="ts">\n  import type { SVGAttributes } from "svelte/elements";\n  let { ...props }: SVGAttributes<SVGSVGElement> = $props();\n</script>\n\n${withProps}\n`;
}

export function svgToJsx(svg: string): string {
  const comments = svg.replace(/<!--([\s\S]*?)-->/g, (_match, comment: string) => `{/*${comment}*/}`);
  return comments.replace(/<([A-Za-z0-9:-]+)([^>]*)>/g, (_full, tag: string, attrs: string) => {
    const converted = attrs.replace(/([\w:-]+)=/g, (_attr, name: string) => `${jsxAttribute(name)}=`);
    return `<${tag}${converted}>`;
  });
}

const JSX_ATTRIBUTES: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  readonly: "readOnly",
};

function jsxAttribute(name: string): string {
  if (JSX_ATTRIBUTES[name]) return JSX_ATTRIBUTES[name];
  if (name.startsWith("data-") || name.startsWith("aria-") || name.includes(":")) return name;
  return name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export type { ExtractedSvg };
