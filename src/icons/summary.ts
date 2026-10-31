/**
 * Collection summaries, license lines, and icon-name paging helpers.
 */

import type { IconifyInfo } from "@iconify/types";
import type { IconifyCollection } from "../iconify/types.js";
import { collectionPageUrl, iconPageUrl } from "./names.js";

/**
 * License text returned with collections, search hits, and icons.
 */
export interface LicenseSummary {
  /**
   * License title from Iconify, such as `MIT` or `Apache 2.0`.
   */
  title: string;

  /**
   * SPDX identifier, when Iconify provides one.
   */
  spdx?: string;

  /**
   * URL of the license text, when Iconify provides one.
   */
  url?: string;
}

/**
 * One collection as shown by `list_collections` and `get_collection`.
 */
export interface CollectionSummary {
  /**
   * Iconify prefix.
   */
  prefix: string;

  /**
   * Display name.
   */
  name: string;

  /**
   * Icon count, when the collection metadata includes it.
   */
  total?: number;

  /**
   * Collection version string, when present.
   */
  version?: string;

  /**
   * Author name and optional URL.
   */
  author?: { name: string; url?: string };

  /**
   * License for the icon artwork. This is the collection's license, not the server's.
   */
  license?: LicenseSummary;

  /**
   * Iconify category, when the collection has one.
   */
  category?: string;

  /**
   * Whether the set is a fixed palette rather than monotone `currentColor` icons.
   */
  palette?: boolean;

  /**
   * Search tags, omitted when the collection has none.
   */
  tags?: string[];

  /**
   * Sample icon ids in `prefix:name` form.
   */
  samples: string[];

  /**
   * Default icon height or heights from the collection metadata.
   */
  height?: number | number[];

  /**
   * Icônes page for the collection.
   */
  iconesUrl: string;
}

/**
 * Filter applied to the in-memory collection list.
 */
export interface CollectionFilter {
  /**
   * Case-insensitive substring matched against prefix, name, author, category,
   * tags, and license.
   */
  text?: string;

  /**
   * Case-insensitive substring matched against the collection category.
   */
  category?: string;

  /**
   * Prefix that must equal the collection prefix or be a prefix of it.
   */
  prefix?: string;

  /**
   * Maximum number of matches to return after sorting.
   */
  limit: number;
}

/**
 * Projects Iconify collection metadata into the summary returned to MCP clients.
 *
 * @param prefix - Collection prefix. Sample names are joined with this prefix.
 * @param info - Metadata from `GET /collections`.
 * @returns A summary. Optional Iconify fields are omitted when absent rather than set to null.
 */
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

/**
 * Copies the license fields that are safe to show to a client.
 *
 * @param info - Collection metadata, or `undefined` when the prefix was unknown.
 * @returns The title plus SPDX id and URL when Iconify sent them, or `undefined`
 * when there is no license title.
 */
export function licenseOf(info: IconifyInfo | undefined): LicenseSummary | undefined {
  if (!info?.license?.title) return undefined;
  return {
    title: info.license.title,
    ...(info.license.spdx ? { spdx: info.license.spdx } : {}),
    ...(info.license.url ? { url: info.license.url } : {}),
  };
}

/**
 * Filters and sorts collection summaries.
 *
 * Exact prefix or name matches come first, then prefix or name prefixes, then
 * other substring matches. Ties break toward the larger icon count, then the
 * prefix in lexicographic order. Collections with an empty prefix are dropped.
 *
 * @param collections - Summaries to filter. Hidden collections should already
 * have been removed by the caller.
 * @param filter - Text, category, prefix, and limit.
 * @returns The unfiltered count, the match count before the limit, and the page.
 */
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

/**
 * Lists icon names a collection browser should show.
 *
 * @param collection - Payload from `GET /collection`.
 * @returns Names from `uncategorized` and `categories`. Hidden names and aliases
 * are not included. Duplicates are removed. Order follows first appearance.
 */
export function visibleIconNames(collection: IconifyCollection): string[] {
  const names = new Set<string>();
  for (const name of collection.uncategorized ?? []) names.add(name);
  for (const group of Object.values(collection.categories ?? {})) {
    for (const name of group) names.add(name);
  }
  return [...names];
}

/**
 * Counts icons in each category.
 *
 * @param collection - Payload from `GET /collection`.
 * @returns Category title and count, sorted by title.
 */
export function categoryCounts(collection: IconifyCollection): { name: string; count: number }[] {
  return Object.entries(collection.categories ?? {})
    .map(([name, icons]) => ({ name, count: icons.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Reads the parent name from an Iconify alias entry.
 *
 * @param value - A parent name, or an object with a `parent` field, or `undefined`.
 * @returns The parent name, or `undefined` when there is no alias entry.
 */
export function aliasParent(value: string | { parent: string } | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.parent;
}

/**
 * Lists aliases whose parent is `name`.
 *
 * @param collection - Collection payload that includes `aliases`.
 * @param name - Parent icon name.
 * @returns Alias names, sorted lexicographically.
 */
export function aliasesFor(collection: IconifyCollection, name: string): string[] {
  const aliases: string[] = [];
  for (const [alias, parent] of Object.entries(collection.aliases ?? {})) {
    if (aliasParent(parent) === name) aliases.push(alias);
  }
  return aliases.sort();
}

/**
 * Builds the Icônes URL for one icon.
 *
 * @param prefix - Collection prefix.
 * @param name - Icon name.
 * @returns The collection URL with the `icon` query set to the full id.
 */
export function iconLink(prefix: string, name: string): string {
  return iconPageUrl(prefix, name);
}

/**
 * Rank used by {@link filterCollections}. Lower sorts first.
 *
 * @param item - Collection being ranked.
 * @param text - Lowercased query, or `undefined` when the caller did not filter by text.
 * @returns `0` for an exact prefix or name match, `1` for a prefix match, `2` otherwise.
 * Every item ranks as `1` when `text` is omitted so icon count decides the order.
 */
function score(item: CollectionSummary, text: string | undefined): number {
  if (!text) return 1;
  const prefix = item.prefix.toLowerCase();
  const name = item.name.toLowerCase();
  if (prefix === text || name === text) return 0;
  if (prefix.startsWith(text) || name.startsWith(text)) return 1;
  return 2;
}
