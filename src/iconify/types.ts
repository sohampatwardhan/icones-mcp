import type { IconifyInfo, IconifyJSON } from "@iconify/types";

export interface IconifyCollection {
  prefix: string;
  total: number;
  title?: string;
  info?: IconifyInfo;
  uncategorized?: string[];
  categories?: Record<string, string[]>;
  hidden?: string[];
  aliases?: Record<string, string | { parent: string }>;
}

export interface IconifySearchResponse {
  icons: string[];
  total: number;
  limit: number;
  start: number;
  collections: Record<string, IconifyInfo>;
  request?: Record<string, string>;
}

export interface ResolvedIcon {
  prefix: string;
  name: string;
  id: string;
  aliasOf?: string;
  width: number;
  height: number;
  left: number;
  top: number;
  body: string;
  monotone: boolean;
}

export interface SearchParams {
  query: string;
  limit?: number;
  start?: number;
  prefix?: string;
  prefixes?: string[];
  category?: string;
}

export const DEFAULT_BASE_URL = "https://api.iconify.design";

export const TTL = {
  collections: 12 * 60 * 60 * 1000,
  collection: 6 * 60 * 60 * 1000,
  search: 10 * 60 * 1000,
  icon: 24 * 60 * 60 * 1000,
} as const;

export type IconifyJSONWithMissing = IconifyJSON & { not_found?: string[] };
