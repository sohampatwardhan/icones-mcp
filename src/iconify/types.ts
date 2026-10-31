/**
 * Shapes returned by the public Iconify API and the ids this server resolves.
 */

import type { IconifyInfo, IconifyJSON } from "@iconify/types";

/**
 * Response from `GET /collection`.
 *
 * @remarks
 * `uncategorized` and `categories` list visible icon names. `hidden` names and
 * `aliases` are separate and are not included in those lists.
 */
export interface IconifyCollection {
  /**
   * Collection prefix, such as `lucide`.
   */
  prefix: string;

  /**
   * Total icon count reported by Iconify, including names not present in this payload.
   */
  total: number;

  /**
   * Human-readable collection title, when the API sent one.
   */
  title?: string;

  /**
   * Collection metadata, including author and license, when `info=true` was requested.
   */
  info?: IconifyInfo;

  /**
   * Icon names that do not belong to a category.
   */
  uncategorized?: string[];

  /**
   * Icon names grouped by category title.
   */
  categories?: Record<string, string[]>;

  /**
   * Icon names Iconify asks clients not to show.
   */
  hidden?: string[];

  /**
   * Alias name to parent name. The parent may be a string or `{ parent }`.
   */
  aliases?: Record<string, string | { parent: string }>;
}

/**
 * One page from `GET /search`.
 */
export interface IconifySearchResponse {
  /**
   * Matching icon ids in `prefix:name` form.
   */
  icons: string[];

  /**
   * Total matches for the query, which may be larger than `icons`.
   */
  total: number;

  /**
   * Page size the API applied.
   */
  limit: number;

  /**
   * Offset of this page.
   */
  start: number;

  /**
   * Metadata for collections that contributed matches, keyed by prefix.
   */
  collections: Record<string, IconifyInfo>;

  /**
   * Echo of the query parameters, when the API includes it.
   */
  request?: Record<string, string>;
}

/**
 * Icon body resolved through `\@iconify/utils` and ready to render.
 */
export interface ResolvedIcon {
  /**
   * Collection prefix.
   */
  prefix: string;

  /**
   * Icon name within the collection.
   */
  name: string;

  /**
   * Full Iconify id, `prefix:name`.
   */
  id: string;

  /**
   * Parent icon name when `name` is an alias.
   */
  aliasOf?: string;

  /**
   * View-box width in icon units.
   */
  width: number;

  /**
   * View-box height in icon units.
   */
  height: number;

  /**
   * Left offset of the icon body.
   */
  left: number;

  /**
   * Top offset of the icon body.
   */
  top: number;

  /**
   * Inner SVG markup. May contain `currentColor`.
   */
  body: string;

  /**
   * Whether `body` references `currentColor` and can take a single ink color.
   */
  monotone: boolean;
}

/**
 * Arguments for {@link IconifyClient.search}.
 */
export interface SearchParams {
  /**
   * Search text. Iconify matches names and keywords, not visual similarity.
   */
  query: string;

  /**
   * Requested page size.
   *
   * @defaultValue 32
   */
  limit?: number;

  /**
   * Result offset.
   *
   * @defaultValue 0
   */
  start?: number;

  /**
   * Restrict the search to one collection prefix.
   */
  prefix?: string;

  /**
   * Restrict the search to these collection prefixes.
   */
  prefixes?: string[];

  /**
   * Restrict the search to icon sets in this Iconify category.
   */
  category?: string;
}

/**
 * Public Iconify API origin used when `ICONIFY_API_URL` is unset.
 */
export const DEFAULT_BASE_URL = "https://api.iconify.design";

/**
 * Default memory-cache lifetimes, in milliseconds.
 *
 * @remarks
 * Collection metadata changes rarely, so it is kept for hours. Search pages
 * are kept for minutes. Resolved icon bodies are kept for a day.
 */
export const TTL = {
  collections: 12 * 60 * 60 * 1000,
  collection: 6 * 60 * 60 * 1000,
  search: 10 * 60 * 1000,
  icon: 24 * 60 * 60 * 1000,
} as const;

/**
 * Icon set JSON plus the `not_found` list returned by `GET /{prefix}.json`.
 */
export type IconifyJSONWithMissing = IconifyJSON & { not_found?: string[] };
