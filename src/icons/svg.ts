/**
 * SVG construction for snippets, single-icon PNGs, and contact sheets.
 *
 * Bodies come from `\@iconify/utils`. Snippet SVGs keep `currentColor` unless
 * the caller passes a fixed color. License text is inserted as an SVG comment
 * immediately inside the root element.
 */

import { iconToHTML, iconToSVG, replaceIDs } from "@iconify/utils";
import type { ResolvedIcon } from "../iconify/types.js";
import type { IconifyInfo } from "@iconify/types";

/**
 * Builds the license sentence stored in an SVG comment.
 *
 * @param info - Collection metadata. When missing, the sentence tells the
 * reader to check the collection license.
 * @param iconId - Iconify id included in the sentence.
 * @returns A single line. Double hyphens are replaced with an em dash so the
 * text cannot terminate an XML comment.
 */
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

/**
 * Builds an SVG document for one resolved icon.
 *
 * @param icon - Icon body and view box.
 * @param options - Height, optional fixed color, and optional comment. `height`
 * is passed to `\@iconify/utils` and defaults to `1em`; use `"auto"` when the
 * SVG will be scaled into a pixel frame. `color` replaces `currentColor`, and
 * omitting it or passing `currentColor` leaves the markup unchanged. `comment`
 * is inserted as an XML comment inside the root element, with double hyphens
 * rewritten so the comment stays well-formed.
 * @returns A single-line SVG document.
 *
 * @remarks
 * Element ids inside the body are rewritten with `replaceIDs` so several icons
 * on one sheet do not share id references.
 */
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

/**
 * Builds the hosted Iconify SVG URL for an icon.
 *
 * @param baseUrl - API origin, without a trailing path.
 * @param prefix - Collection prefix.
 * @param name - Icon name.
 * @param color - Optional `color` query. Omitted when unset or `currentColor`.
 * @returns An absolute URL such as `https://api.iconify.design/lucide/house.svg`.
 */
export function iconSvgUrl(baseUrl: string, prefix: string, name: string, color?: string): string {
  const url = new URL(`${baseUrl}/${prefix}/${name}.svg`);
  if (color && color !== "currentColor") url.searchParams.set("color", color);
  return url.toString();
}

/**
 * Geometry pulled out of an SVG so it can be placed on a sheet or in a square frame.
 */
export interface ExtractedSvg {
  /**
   * Raw `viewBox` string. Defaults to `0 0 16 16` when the attribute is missing.
   */
  viewBox: string;

  /**
   * Markup between the root start tag and the closing `svg` tag.
   */
  inner: string;

  /**
   * View-box minimum x. Non-finite values become `0`.
   */
  minX: number;

  /**
   * View-box minimum y. Non-finite values become `0`.
   */
  minY: number;

  /**
   * View-box width. Non-finite or non-positive values become `16`.
   */
  width: number;

  /**
   * View-box height. Non-finite or non-positive values become `16`.
   */
  height: number;
}

/**
 * Splits an SVG document into its view box and inner markup.
 *
 * @param svg - A document produced by {@link buildSvg} or an equivalent root element.
 * @returns View-box numbers and the inner markup. Missing geometry falls back to a 16-unit box.
 */
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

/**
 * Escapes text for an XML attribute or text node.
 *
 * @param value - Raw text, such as an icon name or color.
 * @returns The text with `&`, `<`, `>`, `"`, and `'` replaced by entities.
 */
export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Centers an icon SVG in a square viewport.
 *
 * @param source - Icon SVG.
 * @param size - Square edge length in user units, which the rasterizer treats as pixels.
 * @param background - Optional fill for the square. `transparent` and omission skip the rectangle.
 * @returns A new SVG document of `size` by `size` with the icon scaled to fit.
 */
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

/**
 * Puts each SVG tag on its own line and indents everything except the root.
 *
 * @param svg - A compact SVG document.
 * @returns The same markup split on tag boundaries, with two-space indentation
 * for every line except the first and the last.
 */
export function prettifySvg(svg: string): string {
  const lines = svg.replace(/></g, ">\n<").split("\n");
  return lines
    .map((line, index) => (index === 0 || index === lines.length - 1 ? line.trim() : `  ${line.trim()}`))
    .join("\n");
}

/**
 * Formats a transform number without trailing zeros.
 *
 * @param value - A coordinate or scale.
 * @returns The number rounded to 4 decimal places, then shortened by `Number`.
 */
function num(value: number): string {
  return Number(value.toFixed(4)).toString();
}
