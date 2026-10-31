import type { IconifyInfo } from "@iconify/types";
import type { IconifyCollection } from "../iconify/types.js";
import { collectionPageUrl, iconPageUrl } from "./names.js";

export interface LicenseSummary {
  title: string;
  spdx?: string;
  url?: string;
}

export interface CollectionSummary {
  prefix: string;
  name: string;
  total?: number;
  version?: string;
  author?: { name: string; url?: string };
  license?: LicenseSummary;
  category?: string;
  palette?: boolean;
  tags?: string[];
  samples: string[];
  height?: number | number[];
  iconesUrl: string;
}

export interface CollectionFilter {
  text?: string;
  category?: string;
  prefix?: string;
  limit: number;
}

export function summarizeInfo(prefix: string, info: IconifyInfo): CollectionSummary {
  return {
    prefix,
    name: info.name,
    ...(info.total !== undefined ? { total: info.total } : {}),
    ...(info.version ? { version: info.version } : {}),
    author: {
      name: info.author.name,
      ...(info.author.url ? { url: info.author.url } : {}),
    },
    license: licenseOf(info),
    ...(info.category ? { category: info.category } : {}),
    ...(info.palette !== undefined ? { palette: info.palette } : {}),
    ...(info.tags && info.tags.length > 0 ? { tags: info.tags } : {}),
    samples: (info.samples ?? []).map((name) => `${prefix}:${name}`),
    ...(info.height !== undefined ? { height: info.height } : {}),
    iconesUrl: collectionPageUrl(prefix),
  };
}

export function licenseOf(info: IconifyInfo | undefined): LicenseSummary | undefined {
  if (!info?.license?.title) return undefined;
  return {
    title: info.license.title,
    ...(info.license.spdx ? { spdx: info.license.spdx } : {}),
    ...(info.license.url ? { url: info.license.url } : {}),
  };
}

export function filterCollections(
  collections: CollectionSummary[],
  filter: CollectionFilter,
): { totalCollections: number; matchCount: number; collections: CollectionSummary[] } {
  const text = filter.text?.trim().toLowerCase();
  const category = filter.category?.trim().toLowerCase();
  const prefix = filter.prefix?.trim().toLowerCase();

  const matches = collections.filter((item) => {
    if (item.prefix === "") return false;
    if (prefix && item.prefix.toLowerCase() !== prefix && !item.prefix.toLowerCase().startsWith(prefix)) {
      return false;
    }
    if (category && !(item.category ?? "").toLowerCase().includes(category)) return false;
    if (!text) return true;
    const haystack = [
      item.prefix,
      item.name,
      item.author?.name ?? "",
      item.category ?? "",
      item.license?.title ?? "",
      item.license?.spdx ?? "",
      ...(item.tags ?? []),
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(text);
  });

  matches.sort((a, b) => {
    const scoreDelta = score(a, text) - score(b, text);
    if (scoreDelta !== 0) return scoreDelta;
    return (b.total ?? 0) - (a.total ?? 0) || a.prefix.localeCompare(b.prefix);
  });

  return {
    totalCollections: collections.length,
    matchCount: matches.length,
    collections: matches.slice(0, filter.limit),
  };
}

export function visibleIconNames(collection: IconifyCollection): string[] {
  const names = new Set<string>();
  for (const name of collection.uncategorized ?? []) names.add(name);
  for (const group of Object.values(collection.categories ?? {})) {
    for (const name of group) names.add(name);
  }
  return [...names];
}

export function categoryCounts(collection: IconifyCollection): { name: string; count: number }[] {
  return Object.entries(collection.categories ?? {})
    .map(([name, icons]) => ({ name, count: icons.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function aliasParent(value: string | { parent: string } | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.parent;
}

export function aliasesFor(collection: IconifyCollection, name: string): string[] {
  const aliases: string[] = [];
  for (const [alias, parent] of Object.entries(collection.aliases ?? {})) {
    if (aliasParent(parent) === name) aliases.push(alias);
  }
  return aliases.sort();
}

export function iconLink(prefix: string, name: string): string {
  return iconPageUrl(prefix, name);
}

function score(item: CollectionSummary, text: string | undefined): number {
  if (!text) return 1;
  const prefix = item.prefix.toLowerCase();
  const name = item.name.toLowerCase();
  if (prefix === text || name === text) return 0;
  if (prefix.startsWith(text) || name.startsWith(text)) return 1;
  return 2;
}
