import { iconToHTML, iconToSVG, replaceIDs } from "@iconify/utils";
import type { ResolvedIcon } from "../iconify/types.js";
import type { IconifyInfo } from "@iconify/types";

export function licenseComment(info: IconifyInfo | undefined, iconId: string): string {
  if (!info) return `Icon ${iconId} via Iconify. Check the collection license before redistributing.`;
  const author = info.author?.url ? `${info.author.name} (${info.author.url})` : info.author?.name;
  const license = info.license?.url ? `${info.license.title} (${info.license.url})` : info.license?.title;
  return [
    `Icon ${iconId} from ${info.name}`,
    author ? `by ${author}` : "",
    license ? `License: ${license}` : "",
  ]
    .filter(Boolean)
    .join(". ")
    .replaceAll("--", "—");
}

export function buildSvg(
  icon: ResolvedIcon,
  options: { height?: string | number; color?: string; comment?: string } = {},
): string {
  const rendered = iconToSVG(
    {
      body: icon.body,
      width: icon.width,
      height: icon.height,
      left: icon.left,
      top: icon.top,
    },
    { height: options.height ?? "1em" },
  );
  let body = replaceIDs(rendered.body);
  if (options.color && options.color !== "currentColor") {
    body = body.replaceAll("currentColor", options.color);
  }
  let svg = iconToHTML(body, rendered.attributes);
  if (options.comment) {
    const safe = options.comment.replaceAll("--", "—");
    svg = svg.replace(/^(<svg\b[^>]*>)/, `$1<!-- ${safe} -->`);
  }
  return svg;
}

export function iconSvgUrl(baseUrl: string, prefix: string, name: string, color?: string): string {
  const url = new URL(`${baseUrl}/${prefix}/${name}.svg`);
  if (color && color !== "currentColor") url.searchParams.set("color", color);
  return url.toString();
}

export interface ExtractedSvg {
  viewBox: string;
  inner: string;
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export function extractSvg(svg: string): ExtractedSvg {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? "0 0 16 16";
  const open = svg.indexOf(">");
  const close = svg.lastIndexOf("</svg>");
  const inner = open >= 0 && close > open ? svg.slice(open + 1, close) : svg;
  const [minX = 0, minY = 0, width = 16, height = 16] = viewBox.split(/[\s,]+/).map(Number);
  return {
    viewBox,
    inner,
    minX: Number.isFinite(minX) ? minX : 0,
    minY: Number.isFinite(minY) ? minY : 0,
    width: Number.isFinite(width) && width > 0 ? width : 16,
    height: Number.isFinite(height) && height > 0 ? height : 16,
  };
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function frameIconSvg(source: string, size: number, background?: string): string {
  const extracted = extractSvg(source);
  const scale = Math.min(size / extracted.width, size / extracted.height);
  const drawW = extracted.width * scale;
  const drawH = extracted.height * scale;
  const tx = (size - drawW) / 2 - extracted.minX * scale;
  const ty = (size - drawH) / 2 - extracted.minY * scale;
  const backgroundRect =
    background && background !== "transparent"
      ? `<rect width="100%" height="100%" fill="${escapeXml(background)}"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${backgroundRect}<g transform="translate(${num(tx)} ${num(ty)}) scale(${num(scale)})">${extracted.inner}</g></svg>`;
}

export function prettifySvg(svg: string): string {
  const lines = svg.replace(/></g, ">\n<").split("\n");
  return lines
    .map((line, index) => (index === 0 || index === lines.length - 1 ? line.trim() : `  ${line.trim()}`))
    .join("\n");
}

function num(value: number): string {
  return Number(value.toFixed(4)).toString();
}
