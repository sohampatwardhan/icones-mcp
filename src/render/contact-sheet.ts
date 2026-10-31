/**
 * Labeled contact sheets drawn as one SVG and rasterized to PNG.
 *
 * Labels use the Inter family. The rasterizer loads the bundled face and does
 * not look for system fonts.
 */

import type { ResolvedIcon } from "../iconify/types.js";
import { DEFAULT_INK, DEFAULT_SHEET } from "../icons/color.js";
import { buildSvg, escapeXml, extractSvg } from "../icons/svg.js";
import { rasterizeSvg } from "./png.js";

/**
 * One cell on a contact sheet.
 */
export interface SheetIcon {
  /**
   * Icon to draw.
   */
  icon: ResolvedIcon;

  /**
   * Caption under the glyph. Truncated to 28 characters when labels are shown.
   */
  label: string;
}

/**
 * Layout inputs for {@link renderContactSheet}.
 */
export interface ContactSheetOptions {
  /**
   * Icons in row-major order. At least one is required.
   */
  icons: SheetIcon[];

  /**
   * Icon edge length in pixels, before the cell padding.
   *
   * @defaultValue 64
   */
  iconSize?: number;

  /**
   * Number of columns. Values below 1 are raised to 1. The count is also
   * capped at the number of icons.
   *
   * @defaultValue the smaller of 4 and the icon count
   */
  columns?: number;

  /**
   * Ink passed to {@link buildSvg} for every glyph.
   *
   * @defaultValue {@link DEFAULT_INK} (`#1c1917`)
   */
  color?: string;

  /**
   * Page background.
   *
   * @defaultValue {@link DEFAULT_SHEET} (`#f7f6f3`)
   */
  background?: string;

  /**
   * Card fill behind each icon.
   *
   * @defaultValue `#ffffff`
   */
  card?: string;

  /**
   * Caption color.
   *
   * @defaultValue `#57534e`
   */
  labelColor?: string;

  /**
   * Optional heading. Adds a text line and extra header space when set.
   */
  title?: string;

  /**
   * Optional line under the title, typically a license.
   */
  subtitle?: string;

  /**
   * Whether to draw captions.
   *
   * @defaultValue true
   */
  showLabels?: boolean;
}

/**
 * Pixel geometry of a rendered sheet.
 */
export interface SheetLayout {
  /**
   * Image width in pixels.
   */
  width: number;

  /**
   * Image height in pixels.
   */
  height: number;

  /**
   * Column count actually used.
   */
  columns: number;

  /**
   * Row count.
   */
  rows: number;

  /**
   * Icon edge length in pixels.
   */
  iconSize: number;
}

/**
 * Page padding, in pixels.
 */
const PAD = 24;

/**
 * Gap between cards, in pixels.
 */
const GAP = 12;

/**
 * Builds a contact sheet and rasterizes it.
 *
 * @param options - Icons and layout overrides.
 * @returns The PNG, the SVG that was rasterized, and the layout numbers.
 * @throws Error when `options.icons` is empty.
 * @throws {@link IconifyError} when rasterization fails. See {@link rasterizeSvg}.
 */
export function renderContactSheet(options: ContactSheetOptions): {
  png: Buffer;
  svg: string;
  layout: SheetLayout;
} {
  if (options.icons.length === 0) {
    throw new Error("Contact sheet needs at least one icon.");
  }
  const built = buildSheetSvg(options);
  const png = rasterizeSvg(built.svg);
  return { png, svg: built.svg, layout: built.layout };
}

/**
 * Composes the contact-sheet SVG without rasterizing it.
 *
 * Cards are rounded rectangles. Each icon is scaled uniformly to fit
 * `iconSize` and centered in its card. Captions are centered under the glyph
 * in 12px Inter.
 *
 * @param options - Icons and layout overrides.
 * @returns The SVG document and the layout numbers. The SVG's width and height
 * attributes match `layout`.
 */
export function buildSheetSvg(options: ContactSheetOptions): { svg: string; layout: SheetLayout } {
  const iconSize = options.iconSize ?? 64;
  const showLabels = options.showLabels !== false;
  const count = options.icons.length;
  const columns = Math.max(1, Math.min(options.columns ?? Math.min(4, count), count));
  const rows = Math.ceil(count / columns);
  const labelFont = 12;
  const labels = options.icons.map((item) => truncate(item.label, 28));
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  const labelWidth = showLabels ? Math.ceil(longest * labelFont * 0.62) : 0;
  const cellW = Math.max(iconSize + 28, labelWidth + 20);
  const cellH = 16 + iconSize + (showLabels ? 26 : 12);
  const header = (options.title ? 26 : 0) + (options.subtitle ? 18 : 0) + (options.title || options.subtitle ? 10 : 0);
  const width = PAD * 2 + columns * cellW + (columns - 1) * GAP;
  const height = PAD * 2 + header + rows * cellH + Math.max(0, rows - 1) * GAP;
  const background = options.background ?? DEFAULT_SHEET;
  const card = options.card ?? "#ffffff";
  const ink = options.color ?? DEFAULT_INK;
  const labelColor = options.labelColor ?? "#57534e";
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="${escapeXml(background)}"/>`,
  ];

  if (options.title) {
    parts.push(
      `<text x="${PAD}" y="${PAD + 18}" fill="#1c1917" font-family="Inter, sans-serif" font-size="18">${escapeXml(options.title)}</text>`,
    );
  }
  if (options.subtitle) {
    const subtitleY = PAD + (options.title ? 40 : 16);
    parts.push(
      `<text x="${PAD}" y="${subtitleY}" fill="#78716c" font-family="Inter, sans-serif" font-size="12">${escapeXml(options.subtitle)}</text>`,
    );
  }

  options.icons.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = PAD + column * (cellW + GAP);
    const y = PAD + header + row * (cellH + GAP);
    parts.push(
      `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="14" fill="${escapeXml(card)}" stroke="#e7e5e4"/>`,
    );
    const svg = buildSvg(item.icon, { height: "auto", color: ink });
    const extracted = extractSvg(svg);
    const scale = Math.min(iconSize / extracted.width, iconSize / extracted.height);
    const drawW = extracted.width * scale;
    const drawH = extracted.height * scale;
    const tx = x + (cellW - drawW) / 2 - extracted.minX * scale;
    const ty = y + 14 + (iconSize - drawH) / 2 - extracted.minY * scale;
    parts.push(
      `<g transform="translate(${num(tx)} ${num(ty)}) scale(${num(scale)})">${extracted.inner}</g>`,
    );
    if (showLabels) {
      const label = labels[index] ?? item.label;
      parts.push(
        `<text x="${num(x + cellW / 2)}" y="${num(y + 14 + iconSize + 18)}" fill="${escapeXml(labelColor)}" font-family="Inter, sans-serif" font-size="${labelFont}" text-anchor="middle">${escapeXml(label)}</text>`,
      );
    }
  });

  parts.push("</svg>");
  return {
    svg: parts.join(""),
    layout: { width, height, columns, rows, iconSize },
  };
}

/**
 * Shortens a caption that would widen the card.
 *
 * @param value - Caption text.
 * @param max - Maximum length, including the ellipsis.
 * @returns `value` unchanged when it fits, otherwise the prefix plus `...`.
 */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

/**
 * Formats a transform number without trailing zeros.
 *
 * @param value - A coordinate or scale.
 * @returns The number rounded to 3 decimal places, then shortened by `Number`.
 */
function num(value: number): string {
  return Number(value.toFixed(3)).toString();
}
