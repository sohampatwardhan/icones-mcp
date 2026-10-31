/**
 * HTTP client for the public Iconify API behind Icônes.
 *
 * Requests are spaced by a {@link RequestGate}, cached in memory, and retried
 * on HTTP 429 and 5xx. SVG bodies are resolved locally with `\@iconify/utils`.
 */

import { getIconData } from "@iconify/utils";
import type { IconifyInfo } from "@iconify/types";
import { USER_AGENT } from "../version.js";
import { TtlCache } from "./cache.js";
import { IconifyError } from "./errors.js";
import { RequestGate } from "./gate.js";
import {
  DEFAULT_BASE_URL,
  TTL,
  type IconifyCollection,
  type IconifyJSONWithMissing,
  type IconifySearchResponse,
  type ResolvedIcon,
  type SearchParams,
} from "./types.js";

/**
 * Construction options for {@link IconifyClient}.
 */
export interface IconifyClientOptions {
  /**
   * API origin. A trailing slash is removed. Only `http:` and `https:` are accepted.
   *
   * @defaultValue {@link DEFAULT_BASE_URL}
   */
  baseUrl?: string;

  /**
   * Fetch implementation. Tests pass a stub here.
   *
   * @defaultValue the global `fetch`
   */
  fetch?: typeof fetch;

  /**
   * Minimum gap between upstream requests, in milliseconds.
   *
   * @defaultValue 100
   */
  minIntervalMs?: number;

  /**
   * Response-cache control.
   *
   * `false` bypasses the memory cache. A positive number replaces every TTL,
   * in milliseconds. `0` disables the cache.
   *
   * @defaultValue the per-route lifetimes in {@link TTL}
   */
  cache?: boolean | number;

  /**
   * `User-Agent` header.
   *
   * @defaultValue {@link USER_AGENT}
   */
  userAgent?: string;

  /**
   * Per-request timeout, in milliseconds, applied with `AbortSignal.timeout`.
   *
   * @defaultValue 15000
   */
  timeoutMs?: number;

  /**
   * Extra attempts after the first failure for 429, 5xx, and network errors.
   * Not-found and bad-request responses are not retried here.
   *
   * @defaultValue 2
   */
  maxRetries?: number;

  /**
   * Delay used by the request gate and between retries. Tests pass a resolved promise.
   *
   * @defaultValue `setTimeout`
   */
  sleep?: (ms: number) => Promise<void>;

  /**
   * Clock for cache expiry and the request gate.
   *
   * @defaultValue `Date.now`
   */
  now?: () => number;
}

/**
 * Cache sentinel for an icon id Iconify reported as missing.
 *
 * @remarks
 * The icon cache stores `null` rather than omitting the key, so a repeated
 * lookup does not hit the network again during the short negative TTL.
 */
const MISSING = null;

/**
 * Cached client for Iconify collection, search, and icon-set endpoints.
 */
export class IconifyClient {
  /**
   * Normalized API origin, without a trailing slash.
   */
  readonly baseUrl: string;

  /**
   * Fetch used for every request.
   */
  private readonly fetchImpl: typeof fetch;

  /**
   * Serializes requests and enforces {@link IconifyClientOptions.minIntervalMs}.
   */
  private readonly gate: RequestGate;

  /**
   * Cache of raw JSON responses, keyed by the absolute URL. Holds at most 400 entries.
   */
  private readonly cache: TtlCache<unknown>;

  /**
   * Resolved icons, keyed by `prefix:name`. `null` means the id was missing.
   * Holds at most 1000 entries.
   */
  private readonly icons = new TtlCache<ResolvedIcon | null>(1_000);

  /**
   * Collection metadata, keyed by prefix. `null` means the prefix was unknown.
   * Holds at most 500 entries.
   */
  private readonly infos = new TtlCache<IconifyInfo | null>(500);

  /**
   * `User-Agent` sent on every request.
   */
  private readonly userAgent: string;

  /**
   * Abort timeout for one HTTP call, in milliseconds.
   */
  private readonly timeoutMs: number;

  /**
   * Retries remaining after the first attempt for retryable failures.
   */
  private readonly maxRetries: number;

  /**
   * Delay helper shared with the request gate.
   */
  private readonly sleep: (ms: number) => Promise<void>;

  /**
   * Effective TTLs. Every field is `0` when the cache is disabled.
   */
  private readonly ttl: typeof TTL;

  /**
   * @param options - Origin, fetch, cache, and retry overrides.
   * @throws {@link IconifyError} with code `invalid` when `baseUrl` is not an http(s) URL.
   */
  constructor(options: IconifyClientOptions = {}) {
    this.baseUrl = normalizeBase(options.baseUrl ?? DEFAULT_BASE_URL);
    this.fetchImpl = options.fetch ?? fetch;
    const now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }));
    this.gate = new RequestGate(options.minIntervalMs ?? 100, this.sleep, now);
    this.cache = new TtlCache(400, now);
    this.userAgent = options.userAgent ?? USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = options.maxRetries ?? 2;
    const ttlOverride = typeof options.cache === "number" ? options.cache : undefined;
    const disabled = options.cache === false || ttlOverride === 0;
    this.ttl = disabled
      ? { collections: 0, collection: 0, search: 0, icon: 0 }
      : {
          collections: ttlOverride ?? TTL.collections,
          collection: ttlOverride ?? TTL.collection,
          search: ttlOverride ?? TTL.search,
          icon: ttlOverride ?? TTL.icon,
        };
  }

  /**
   * Lists every collection the API exposes.
   *
   * @returns Metadata keyed by prefix. Each valid entry is also stored in the
   * info cache for the collections TTL.
   * @throws {@link IconifyError} when the request fails.
   */
  async listCollections(): Promise<Record<string, IconifyInfo>> {
    const data = await this.getJson<Record<string, IconifyInfo>>("/collections", this.ttl.collections);
    for (const [prefix, info] of Object.entries(data)) {
      if (isInfo(info)) this.infos.set(prefix, info, this.ttl.collections);
    }
    return data;
  }

  /**
   * Loads metadata for specific prefixes, using the info cache first.
   *
   * @param prefixes - Prefixes to resolve. Duplicates are ignored.
   * @returns The prefixes that exist. Unknown prefixes are omitted and remembered
   * as misses for at most five minutes, so a bad prefix is not fetched on every call.
   * @throws {@link IconifyError} when the request fails.
   */
  async getInfos(prefixes: string[]): Promise<Map<string, IconifyInfo>> {
    const result = new Map<string, IconifyInfo>();
    const missing: string[] = [];
    for (const prefix of [...new Set(prefixes)]) {
      const cached = this.infos.get(prefix);
      if (cached !== undefined) {
        if (cached) result.set(prefix, cached);
        continue;
      }
      missing.push(prefix);
    }
    if (missing.length === 0) return result;

    const data = await this.getJson<Record<string, IconifyInfo>>(
      `/collections?prefixes=${encodeURIComponent(missing.join(","))}`,
      this.ttl.collections,
    );
    for (const prefix of missing) {
      const info = data[prefix];
      if (isInfo(info)) {
        this.infos.set(prefix, info, this.ttl.collections);
        result.set(prefix, info);
      } else {
        this.infos.set(prefix, null, Math.min(this.ttl.collections || 0, 5 * 60_000) || 0);
      }
    }
    return result;
  }

  /**
   * Loads one collection, including category names and license info.
   *
   * @param prefix - Collection prefix.
   * @returns The collection payload.
   * @throws {@link IconifyError} with code `not_found` when Iconify has no
   * browsable collection under that prefix. Other failures keep their original code.
   */
  async getCollection(prefix: string): Promise<IconifyCollection> {
    const params = new URLSearchParams({ prefix, info: "true" });
    try {
      return await this.getJson<IconifyCollection>(`/collection?${params}`, this.ttl.collection);
    } catch (error) {
      if (error instanceof IconifyError && error.code === "not_found") {
        throw new IconifyError(
          `Iconify has no browsable collection "${prefix}". Check the prefix with list_collections.`,
          "not_found",
          404,
        );
      }
      throw error;
    }
  }

  /**
   * Searches icon names and keywords.
   *
   * @param params - Query, page size, offset, and optional collection filters.
   * @returns One search page. The requested `limit` is preserved when the API accepts it.
   * @throws {@link IconifyError} when the request fails for a reason other than a
   * too-small page size.
   *
   * @remarks
   * Some Iconify deployments reject `limit` below 32. A bad request in that
   * case is retried once with `limit=32`, and the caller slices the page.
   */
  async search(params: SearchParams): Promise<IconifySearchResponse> {
    const limit = params.limit ?? 32;
    try {
      return await this.getJson<IconifySearchResponse>(searchPath(params, limit), this.ttl.search);
    } catch (error) {
      // Some Iconify deployments reject limit below 32. Retry once at 32.
      if (error instanceof IconifyError && error.code === "bad_request" && limit < 32) {
        return this.getJson<IconifySearchResponse>(searchPath(params, 32), this.ttl.search);
      }
      throw error;
    }
  }

  /**
   * Resolves icon bodies for a list of ids.
   *
   * Cached hits are returned immediately. The rest are fetched per prefix, 40
   * names at a time, via `GET /{prefix}.json?icons=...`. Missing ids are
   * remembered for a short TTL so a contact sheet does not refetch them.
   *
   * @param ids - Iconify ids in `prefix:name` form. Order is preserved in `found`.
   * @returns The ids that resolved, in input order, and the ids that did not.
   * @throws {@link IconifyError} when a request fails for a reason other than
   * not-found. A 404 for a whole prefix marks that chunk as missing.
   */
  async getIcons(ids: readonly string[]): Promise<{ found: ResolvedIcon[]; missing: string[] }> {
    const found = new Map<string, ResolvedIcon>();
    const missing: string[] = [];
    const pending = new Map<string, string[]>();

    for (const id of ids) {
      const cached = this.icons.get(id);
      if (cached !== undefined) {
        if (cached) found.set(id, cached);
        else missing.push(id);
        continue;
      }
      const colon = id.indexOf(":");
      const prefix = id.slice(0, colon);
      const name = id.slice(colon + 1);
      const names = pending.get(prefix) ?? [];
      names.push(name);
      pending.set(prefix, names);
    }

    for (const [prefix, names] of pending) {
      for (const chunkNames of chunk([...new Set(names)], 40)) {
        let iconSet: IconifyJSONWithMissing;
        try {
          const query = new URLSearchParams({ icons: chunkNames.join(",") });
          iconSet = await this.getJson<IconifyJSONWithMissing>(
            `/${encodeURIComponent(prefix)}.json?${query}`,
            this.ttl.icon,
          );
        } catch (error) {
          if (error instanceof IconifyError && error.code === "not_found") {
            for (const name of chunkNames) {
              const id = `${prefix}:${name}`;
              this.icons.set(id, MISSING, shortTtl(this.ttl.icon));
              missing.push(id);
            }
            continue;
          }
          throw error;
        }

        for (const name of chunkNames) {
          const id = `${prefix}:${name}`;
          const resolved = resolveIcon(iconSet, prefix, name);
          this.icons.set(id, resolved, resolved ? this.ttl.icon : shortTtl(this.ttl.icon));
          if (resolved) found.set(id, resolved);
          else missing.push(id);
        }
      }
    }

    return {
      found: ids.flatMap((id) => {
        const icon = found.get(id);
        return icon ? [icon] : [];
      }),
      missing,
    };
  }

  /**
   * Returns cached JSON or fetches it and stores the response.
   *
   * @typeParam T - Expected JSON shape. The cache does not validate it.
   * @param path - Path and query beginning with `/`, appended to {@link IconifyClient.baseUrl}.
   * @param ttlMs - Lifetime for a fresh response. Zero skips the store.
   * @returns The parsed JSON value.
   * @throws {@link IconifyError} when {@link IconifyClient.requestJson} fails.
   */
  private async getJson<T>(path: string, ttlMs: number): Promise<T> {
    const key = `${this.baseUrl}${path}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached as T;
    const json = await this.requestJson(path);
    this.cache.set(key, json, ttlMs);
    return json as T;
  }

  /**
   * Performs one JSON GET, retrying rate limits, 5xx responses, and network errors.
   *
   * @param path - Path and query beginning with `/`.
   * @returns The parsed JSON body.
   * @throws {@link IconifyError} with code `not_found` on HTTP 404, `bad_request`
   * on HTTP 400, `rate_limited` when a 429 survives the retries, and `upstream`
   * for other failures and non-JSON bodies.
   */
  private async requestJson(path: string): Promise<unknown> {
    const url = new URL(path, `${this.baseUrl}/`);
    let lastStatus: number | undefined;
    let lastSnippet = "";

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.gate.acquire();
      try {
        const response = await this.fetchImpl(url, {
          headers: {
            accept: "application/json",
            "user-agent": this.userAgent,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        lastStatus = response.status;
        if (response.status === 404) {
          throw new IconifyError(
            `Iconify returned 404 for ${url.pathname}. That collection or icon was not found.`,
            "not_found",
            404,
          );
        }
        if (response.status === 400) {
          lastSnippet = await snippet(response);
          throw new IconifyError(
            `Iconify rejected the request (${url.pathname}): ${lastSnippet || "bad request"}`,
            "bad_request",
            400,
          );
        }
        if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
          await this.sleep(retryDelay(response, attempt));
          continue;
        }
        if (!response.ok) {
          lastSnippet = await snippet(response);
          throw new IconifyError(
            `Iconify request failed (${response.status}) for ${url.pathname}. ${lastSnippet}`.trim(),
            response.status === 429 ? "rate_limited" : "upstream",
            response.status,
          );
        }
        const text = await response.text();
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new IconifyError(
            `Iconify returned a non-JSON response for ${url.pathname}.`,
            "upstream",
            response.status,
          );
        }
      } catch (error) {
        if (error instanceof IconifyError) {
          if (error.code === "not_found" || error.code === "bad_request") throw error;
          if (attempt >= this.maxRetries) throw error;
          await this.sleep(200 * 2 ** attempt);
          continue;
        }
        if (attempt >= this.maxRetries) {
          const reason = error instanceof Error ? error.message : "network error";
          throw new IconifyError(
            `Could not reach Iconify at ${this.baseUrl} (${reason}).`,
            lastStatus === 429 ? "rate_limited" : "upstream",
            lastStatus,
          );
        }
        await this.sleep(200 * 2 ** attempt);
      }
    }

    throw new IconifyError(
      `Iconify request failed for ${path}. ${lastSnippet}`.trim(),
      lastStatus === 429 ? "rate_limited" : "upstream",
      lastStatus,
    );
  }
}

/**
 * Builds the path and query for `GET /search`.
 *
 * @param params - Search arguments. Empty prefix lists are omitted.
 * @param limit - Page size written into the query. May differ from `params.limit`
 * when {@link IconifyClient.search} retries at 32.
 * @returns A path beginning with `/search`.
 */
function searchPath(params: SearchParams, limit: number): string {
  const search = new URLSearchParams({
    query: params.query,
    limit: String(limit),
  });
  if (params.start) search.set("start", String(params.start));
  if (params.prefix) search.set("prefix", params.prefix);
  if (params.prefixes && params.prefixes.length > 0) {
    search.set("prefixes", params.prefixes.join(","));
  }
  if (params.category) search.set("category", params.category);
  return `/search?${search}`;
}

/**
 * Turns one name from an icon-set payload into a {@link ResolvedIcon}.
 *
 * @param iconSet - JSON from `GET /{prefix}.json`, including `not_found`.
 * @param prefix - Collection prefix.
 * @param name - Icon or alias name that was requested.
 * @returns The resolved icon, or `null` when the name is listed in `not_found`
 * or `\@iconify/utils` cannot find a body. Alias parents are recorded on `aliasOf`.
 * Width and height default to 16 when the payload omits them.
 */
function resolveIcon(iconSet: IconifyJSONWithMissing, prefix: string, name: string): ResolvedIcon | null {
  if (iconSet.not_found?.includes(name)) return null;
  const data = getIconData(iconSet, name);
  if (!data?.body) return null;
  const alias = iconSet.aliases?.[name]?.parent;
  return {
    prefix,
    name,
    id: `${prefix}:${name}`,
    ...(alias ? { aliasOf: alias } : {}),
    width: data.width ?? 16,
    height: data.height ?? 16,
    left: data.left ?? 0,
    top: data.top ?? 0,
    body: data.body,
    monotone: data.body.includes("currentColor"),
  };
}

/**
 * Narrows an unknown JSON value to collection metadata.
 *
 * @param value - One entry from a collections response.
 * @returns Whether `value` has a name, an author name, and a license title.
 */
function isInfo(value: unknown): value is IconifyInfo {
  if (!value || typeof value !== "object") return false;
  const info = value as Partial<IconifyInfo>;
  return (
    typeof info.name === "string" &&
    typeof info.author?.name === "string" &&
    typeof info.license?.title === "string"
  );
}

/**
 * Checks an API origin and strips a trailing slash.
 *
 * @param value - Candidate base URL.
 * @returns The origin and path, without a trailing slash.
 * @throws {@link IconifyError} with code `invalid` when `value` is not a URL
 * or the protocol is not `http:` or `https:`.
 */
function normalizeBase(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IconifyError(`Iconify API URL "${value}" is not a valid URL.`, "invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new IconifyError("Iconify API URL must use http or https.", "invalid");
  }
  return url.href.replace(/\/$/, "");
}

/**
 * Splits a list into contiguous groups.
 *
 * @typeParam T - Element type.
 * @param values - Items to split. The input array is not mutated.
 * @param size - Maximum group length.
 * @returns Groups in the original order. The last group may be shorter.
 */
function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

/**
 * Caps a negative-cache lifetime at five minutes.
 *
 * @param ttlMs - The positive TTL that would have been used for a hit.
 * @returns `0` when `ttlMs` is not positive, otherwise the smaller of `ttlMs`
 * and five minutes.
 */
function shortTtl(ttlMs: number): number {
  if (ttlMs <= 0) return 0;
  return Math.min(ttlMs, 5 * 60_000);
}

/**
 * Chooses how long to wait before retrying a failed response.
 *
 * @param response - Response that triggered the retry. A numeric `retry-after`
 * header is honored, capped at five seconds.
 * @param attempt - Zero-based attempt index, used for exponential backoff when
 * the header is missing.
 * @returns Delay in milliseconds.
 */
function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header && /^\d+$/.test(header)) return Math.min(Number(header) * 1000, 5_000);
  return 200 * 2 ** attempt;
}

/**
 * Reads a short, single-line excerpt of an error body.
 *
 * @param response - Failed response. The body is consumed.
 * @returns Up to 180 characters, or an empty string when the body cannot be read.
 */
async function snippet(response: Response): Promise<string> {
  try {
    const text = (await response.text()).replace(/\s+/g, " ").trim();
    return text.slice(0, 180);
  } catch {
    return "";
  }
}
