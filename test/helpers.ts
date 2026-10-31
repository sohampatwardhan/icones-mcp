import { PNG } from "pngjs";
import type { IconifyInfo } from "@iconify/types";
import { IconifyClient } from "../src/iconify/client.js";

export const homeBody = '<path fill="currentColor" d="M2 2h20v20H2z"/>';
export const starBody =
  '<path fill="currentColor" d="M12 2l2.4 7.2H22l-6 4.4 2.3 7.2L12 16.8 5.7 20.8 8 13.6 2 9.2h7.6z"/>';

export const testInfo: IconifyInfo = {
  name: "Test Icons",
  total: 2,
  author: { name: "Test Author", url: "https://example.com/author" },
  license: { title: "MIT", spdx: "MIT", url: "https://example.com/license" },
  samples: ["home", "star"],
  category: "UI",
  tags: ["Test"],
  palette: false,
};

export const iconSet = {
  prefix: "test",
  width: 24,
  height: 24,
  icons: {
    home: { body: homeBody },
    star: { body: starBody },
  },
  aliases: {
    house: { parent: "home" },
  },
};

export interface MockFetch {
  fetch: typeof fetch;
  calls: () => number;
}

export function createMockFetch(options?: { failuresBeforeSuccess?: number }): MockFetch {
  let calls = 0;
  let failures = 0;
  const fetchImpl: typeof fetch = async (input) => {
    calls += 1;
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith(".json") && failures < (options?.failuresBeforeSuccess ?? 0)) {
      failures += 1;
      return new Response("busy", { status: 429, headers: { "retry-after": "0" } });
    }
    if (url.pathname === "/missing.json") {
      return new Response("missing", { status: 404 });
    }
    if (url.pathname === "/collections") {
      const prefix = url.searchParams.get("prefix");
      const prefixes = url.searchParams.get("prefixes")?.split(",") ?? (prefix ? [prefix] : undefined);
      const all: Record<string, IconifyInfo> = { test: testInfo };
      if (!prefixes) return Response.json(all);
      const picked: Record<string, IconifyInfo> = {};
      for (const name of prefixes) {
        if (all[name]) picked[name] = all[name];
      }
      return Response.json(picked);
    }
    if (url.pathname === "/collection") {
      if (url.searchParams.get("prefix") !== "test") return new Response("no", { status: 404 });
      return Response.json({
        prefix: "test",
        total: 2,
        title: "Test Icons",
        info: testInfo,
        uncategorized: ["star"],
        categories: { Places: ["home"] },
        aliases: { house: "home" },
        hidden: ["old"],
      });
    }
    if (url.pathname === "/search") {
      const query = url.searchParams.get("query") ?? "";
      const icons = query === "none" ? [] : ["test:home", "test:star"];
      return Response.json({
        icons,
        total: icons.length,
        limit: Number(url.searchParams.get("limit") ?? 32),
        start: Number(url.searchParams.get("start") ?? 0),
        collections: icons.length > 0 ? { test: testInfo } : {},
      });
    }
    if (url.pathname === "/test.json") {
      const requested = url.searchParams.get("icons")?.split(",") ?? [];
      const icons: Record<string, { body: string }> = {};
      const aliases: Record<string, { parent: string }> = {};
      const notFound: string[] = [];
      for (const name of requested) {
        if (name === "house") {
          aliases.house = { parent: "home" };
          icons.home = iconSet.icons.home;
        } else if (name in iconSet.icons) {
          icons[name] = iconSet.icons[name as keyof typeof iconSet.icons];
        } else {
          notFound.push(name);
        }
      }
      return Response.json({ prefix: "test", width: 24, height: 24, icons, aliases, not_found: notFound });
    }
    return new Response("no", { status: 404 });
  };
  return { fetch: fetchImpl, calls: () => calls };
}

export function testClient(options?: { failuresBeforeSuccess?: number; cache?: boolean | number }): {
  client: IconifyClient;
  calls: () => number;
} {
  const mock = createMockFetch(options);
  const client = new IconifyClient({
    fetch: mock.fetch,
    minIntervalMs: 0,
    cache: options?.cache ?? true,
    sleep: async () => undefined,
    maxRetries: 2,
  });
  return { client, calls: mock.calls };
}

export function decodePng(png: Buffer): PNG {
  return PNG.sync.read(png);
}

export function hasColor(png: PNG, red: number, green: number, blue: number, tolerance = 12): boolean {
  for (let index = 0; index < png.data.length; index += 4) {
    const alpha = png.data[index + 3] ?? 0;
    if (alpha < 200) continue;
    const r = png.data[index] ?? 0;
    const g = png.data[index + 1] ?? 0;
    const b = png.data[index + 2] ?? 0;
    if (Math.abs(r - red) <= tolerance && Math.abs(g - green) <= tolerance && Math.abs(b - blue) <= tolerance) {
      return true;
    }
  }
  return false;
}
