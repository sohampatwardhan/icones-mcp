import type { IconifyInfo } from "@iconify/types";
import type { IconifyClient } from "../iconify/client.js";
import type { ResolvedIcon } from "../iconify/types.js";
import { rasterInk } from "../icons/color.js";
import { licenseOf, type LicenseSummary } from "../icons/summary.js";
import { renderContactSheet } from "../render/contact-sheet.js";
import { pngSize } from "../render/png.js";

export interface PreviewRequest {
  icons: ResolvedIcon[];
  infos: Map<string, IconifyInfo>;
  title?: string;
  subtitle?: string;
  size?: number;
  color?: string;
  background?: string;
  columns?: number;
  labels?: boolean;
}

export async function loadInfos(
  client: IconifyClient,
  icons: ResolvedIcon[],
): Promise<Map<string, IconifyInfo>> {
  const prefixes = [...new Set(icons.map((icon) => icon.prefix))];
  return client.getInfos(prefixes);
}

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

function formatLicense(license: LicenseSummary): string {
  if (!license.spdx || license.spdx.toLowerCase() === license.title.toLowerCase()) return license.title;
  return `${license.title} (${license.spdx})`;
}
