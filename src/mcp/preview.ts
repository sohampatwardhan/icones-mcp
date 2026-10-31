/**
 * Contact-sheet previews attached to search, collection, and preview tools.
 */

import type { IconifyInfo } from "@iconify/types";
import type { IconifyClient } from "../iconify/client.js";
import type { ResolvedIcon } from "../iconify/types.js";
import { rasterInk } from "../icons/color.js";
import { licenseOf, type LicenseSummary } from "../icons/summary.js";
import { renderContactSheet } from "../render/contact-sheet.js";
import { pngSize } from "../render/png.js";

/**
 * Inputs for one labeled sheet of already-resolved icons.
 */
export interface PreviewRequest {
  /**
   * Icons to draw, in order.
   */
  icons: ResolvedIcon[];

  /**
   * Collection metadata keyed by prefix. Used for the subtitle and license line.
   */
  infos: Map<string, IconifyInfo>;

  /**
   * Heading drawn above the grid. When it matches the single collection's name,
   * the subtitle is the license instead of repeating the name.
   */
  title?: string;

  /**
   * Line under the title. When omitted, a license line is built from `infos`.
   */
  subtitle?: string;

  /**
   * Icon edge length in pixels, forwarded to the sheet renderer.
   *
   * @defaultValue 64
   */
  size?: number;

  /**
   * Ink color. Omitted and `currentColor` both paint {@link rasterInk}'s default.
   */
  color?: string;

  /**
   * Sheet background. The sheet renderer supplies its own default when omitted.
   */
  background?: string;

  /**
   * Column count. The sheet renderer picks a default when omitted.
   */
  columns?: number;

  /**
   * Whether to draw each icon's name. The sheet renderer defaults to showing labels.
   */
  labels?: boolean;
}

/**
 * Loads collection metadata for the prefixes present in `icons`.
 *
 * @param client - Iconify client whose info cache should be reused.
 * @param icons - Icons whose prefixes should be described.
 * @returns Collection info keyed by prefix. Unknown prefixes are absent.
 * @throws {@link IconifyError} when the collections request fails.
 */
export async function loadInfos(
  client: IconifyClient,
  icons: ResolvedIcon[],
): Promise<Map<string, IconifyInfo>> {
  const prefixes = [...new Set(icons.map((icon) => icon.prefix))];
  return client.getInfos(prefixes);
}

/**
 * Renders a contact sheet and reports the PNG's pixel size.
 *
 * A single collection contributes its license to the subtitle. Mixed
 * collections get a note that each license is in the text result. Labels use
 * the icon name when every glyph shares a prefix, and the full id otherwise.
 *
 * @param request - Icons, metadata, and layout overrides.
 * @returns The PNG buffer plus its width and height.
 * @throws Error when `request.icons` is empty. See {@link renderContactSheet}.
 * @throws {@link IconifyError} when rasterization fails.
 */
export function renderIconSheet(request: PreviewRequest): {
  png: Buffer;
  width: number;
  height: number;
} {
  const prefixes = new Set(request.icons.map((icon) => icon.prefix));
  const singlePrefix = prefixes.size === 1 ? request.icons[0]?.prefix : undefined;
  const info = singlePrefix ? request.infos.get(singlePrefix) : undefined;
  const license = licenseOf(info);
  const licenseText = license ? formatLicense(license) : undefined;
  const titleMatchesCollection =
    Boolean(info) && request.title?.toLowerCase() === info?.name.toLowerCase();
  const subtitle =
    request.subtitle ??
    (info
      ? titleMatchesCollection
        ? licenseText
        : [info.name, licenseText].filter(Boolean).join(" · ")
      : "Multiple collections. See the text result for each license.");

  const rendered = renderContactSheet({
    icons: request.icons.map((icon) => ({
      icon,
      label: prefixes.size > 1 ? icon.id : icon.name,
    })),
    iconSize: request.size,
    columns: request.columns,
    color: rasterInk(request.color),
    background: request.background,
    title: request.title,
    subtitle,
    showLabels: request.labels,
  });
  const size = pngSize(rendered.png);
  return { png: rendered.png, width: size.width, height: size.height };
}

/**
 * Formats a license for a sheet subtitle.
 *
 * @param license - License title and optional SPDX id.
 * @returns The title alone when the SPDX id repeats it, otherwise `title (SPDX)`.
 */
function formatLicense(license: LicenseSummary): string {
  if (!license.spdx || license.spdx.toLowerCase() === license.title.toLowerCase()) return license.title;
  return `${license.title} (${license.spdx})`;
}
