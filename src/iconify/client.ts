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

export interface IconifyClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  minIntervalMs?: number;
  /** Set false to bypass the response cache. A number replaces every TTL. */
  cache?: boolean | number;
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const MISSING = null;

export class IconifyClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly gate: RequestGate;
  private readonly cache: TtlCache<unknown>;
  private readonly icons = new TtlCache<ResolvedIcon | null>(1_000);
  private readonly infos = new TtlCache<IconifyInfo | null>(500);
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly ttl: typeof TTL;

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

  async listCollections(): Promise<Record<string, IconifyInfo>> {
    const data = await this.getJson<Record<string, IconifyInfo>>("/collections", this.ttl.collections);
    for (const [prefix, info] of Object.entries(data)) {
      if (isInfo(info)) this.infos.set(prefix, info, this.ttl.collections);
    }
    return data;
  }

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

  async search(params: SearchParams): Promise<IconifySearchResponse> {
    const limit = params.limit ?? 32;
    try {
      return await this.getJson<IconifySearchResponse>(searchPath(params, limit), this.ttl.search);
    } catch (error) {
      // Older API docs require limit >= 32. Retry once inside that window.
      if (error instanceof IconifyError && error.code === "bad_request" && limit < 32) {
        return this.getJson<IconifySearchResponse>(searchPath(params, 32), this.ttl.search);
      }
      throw error;
    }
  }

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

  private async getJson<T>(path: string, ttlMs: number): Promise<T> {
    const key = `${this.baseUrl}${path}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached as T;
    const json = await this.requestJson(path);
    this.cache.set(key, json, ttlMs);
    return json as T;
  }

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

function isInfo(value: unknown): value is IconifyInfo {
  if (!value || typeof value !== "object") return false;
  const info = value as Partial<IconifyInfo>;
  return (
    typeof info.name === "string" &&
    typeof info.author?.name === "string" &&
    typeof info.license?.title === "string"
  );
}

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

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function shortTtl(ttlMs: number): number {
  if (ttlMs <= 0) return 0;
  return Math.min(ttlMs, 5 * 60_000);
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header && /^\d+$/.test(header)) return Math.min(Number(header) * 1000, 5_000);
  return 200 * 2 ** attempt;
}

async function snippet(response: Response): Promise<string> {
  try {
    const text = (await response.text()).replace(/\s+/g, " ").trim();
    return text.slice(0, 180);
  } catch {
    return "";
  }
}
