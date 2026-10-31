/**
 * Color checks for SVG attributes and PNG backgrounds.
 *
 * Snippet SVGs keep `currentColor` unless the caller sets a color. PNGs cannot
 * rasterize `currentColor`, so they fall back to a dark ink on a light canvas.
 */

import { IconifyError } from "../iconify/errors.js";

/**
 * Hex colors, CSS color names, and `rgb()` / `rgba()` values accepted from tools.
 *
 * @remarks
 * The pattern is intentionally narrow so a color cannot break out of an SVG
 * attribute. Named colors are 1 to 32 letters. Hex is 3 to 8 digits.
 */
const COLOR_RE =
  /^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,32}|rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/;

/**
 * Default ink painted into PNG previews when the caller does not set `color`.
 */
export const DEFAULT_INK = "#1c1917";

/**
 * Default background for a single-icon PNG.
 */
export const DEFAULT_CANVAS = "#ffffff";

/**
 * Default background for a contact sheet.
 */
export const DEFAULT_SHEET = "#f7f6f3";

/**
 * Accepts a CSS color that is safe to place in an SVG attribute.
 *
 * @param value - Caller-supplied color.
 * @param label - Field name included in the error, such as `color` or `background`.
 * @returns The trimmed color.
 * @throws {@link IconifyError} with code `invalid` when the value is not a hex
 * color, a CSS color name, or `rgb()` / `rgba()`.
 */
export function assertColor(value: string, label: string): string {
  const trimmed = value.trim();
  if (!COLOR_RE.test(trimmed)) {
    throw new IconifyError(
      `${label} must be a hex color such as #111111, a CSS color name, or rgb()/rgba(). Received "${value}".`,
      "invalid",
    );
  }
  return trimmed;
}

/**
 * Accepts a contact-sheet or icon background, including the transparent sentinels.
 *
 * @param value - Caller-supplied background.
 * @returns `"transparent"` when the value is `transparent` or `none`, otherwise
 * the trimmed color.
 * @throws {@link IconifyError} when the value is neither a transparent sentinel
 * nor a color accepted by {@link assertColor}.
 */
export function assertBackground(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "transparent" || trimmed === "none") return "transparent";
  return assertColor(trimmed, "background");
}

/**
 * Color actually painted into a PNG. `currentColor` cannot be rasterized.
 *
 * @param color - Requested ink, or `undefined` to use the default.
 * @returns {@link DEFAULT_INK} when `color` is omitted or is `currentColor`.
 * Otherwise the validated color.
 * @throws {@link IconifyError} when `color` is present and not a supported color.
 */
export function rasterInk(color: string | undefined): string {
  if (!color || color === "currentColor") return DEFAULT_INK;
  return assertColor(color, "color");
}
