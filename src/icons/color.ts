import { IconifyError } from "../iconify/errors.js";

const COLOR_RE =
  /^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,32}|rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/;

export const DEFAULT_INK = "#1c1917";
export const DEFAULT_CANVAS = "#ffffff";
export const DEFAULT_SHEET = "#f7f6f3";

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

export function assertBackground(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "transparent" || trimmed === "none") return "transparent";
  return assertColor(trimmed, "background");
}

/** Color actually painted into a PNG. currentColor cannot be rasterized. */
export function rasterInk(color: string | undefined): string {
  if (!color || color === "currentColor") return DEFAULT_INK;
  return assertColor(color, "color");
}
