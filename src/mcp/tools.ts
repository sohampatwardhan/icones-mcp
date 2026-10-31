/**
 * MCP tools for browsing Iconify collections and returning PNG previews.
 *
 * `search_icons` and `get_collection` include a contact sheet unless the
 * caller passes `preview: false`. Snippet SVGs keep `currentColor` unless
 * `color` is set. PNGs default to `#1c1917` on white.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IconifyClient } from "../iconify/client.js";
import { IconifyError } from "../iconify/errors.js";
import type { IconifyCollection, ResolvedIcon } from "../iconify/types.js";
import { assertBackground, assertColor, rasterInk } from "../icons/color.js";
import { assertPrefix, iconPageUrl, parseIconId, parseIconIds } from "../icons/names.js";
import { SNIPPET_FORMATS, buildSnippets, type SnippetFormat } from "../icons/snippets.js";
import {
  aliasesFor,
  categoryCounts,
  filterCollections,
  iconLink,
  licenseOf,
  summarizeInfo,
  visibleIconNames,
} from "../icons/summary.js";
import { buildSvg, iconSvgUrl, licenseComment } from "../icons/svg.js";
import { rasterizeIcon } from "../render/png.js";
import { loadInfos, renderIconSheet } from "./preview.js";
import { asToolError, toolText } from "./result.js";

/**
 * Hints advertised on every tool. The server only reads public icon data.
 */
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/**
 * Shared color argument. Omission leaves snippet SVGs on `currentColor` and
 * paints PNG ink with the default dark color.
 */
const colorSchema = z
  .string()
  .optional()
  .describe("Hex, CSS color name, or rgb()/rgba(). Omit to keep snippet SVGs on currentColor. PNGs use #1c1917 when omitted.");

/**
 * Maximum icons drawn on one `preview_icons` sheet.
 */
const PREVIEW_CAP = 24;

/**
 * Registers `list_collections`, `get_collection`, `search_icons`, `get_icon`,
 * and `preview_icons`.
 *
 * Each handler catches failures and returns them with {@link asToolError}.
 * Iconify validation errors stay in the tool result. Unexpected errors are
 * also logged to stderr.
 *
 * @param server - MCP server that will own the tools.
 * @param client - Iconify client shared with the resources.
 */
export function registerIconesTools(server: McpServer, client: IconifyClient): void {
  server.registerTool(
    "list_collections",
    {
      title: "List icon collections",
      description:
        "List Iconify collections available on Icônes, including license, author, icon count, category, and sample icon ids. Filter with query, prefix, or category. Does not return icon images; call get_collection or preview_icons to see icons. Icon sets keep their own licenses.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("Case-insensitive match against prefix, name, author, category, tags, or license."),
        prefix: z.string().optional().describe("Only collections whose prefix equals or starts with this, such as mdi."),
        category: z.string().optional().describe("Only collections whose category contains this text."),
        limit: z.number().int().min(1).max(300).optional().describe("Maximum collections to return. Default 40."),
      },
      annotations,
    },
    async (args) => {
      try {
        return await listCollections(client, args);
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "get_collection",
    {
      title: "Get an icon collection",
      description:
        "Get one Iconify collection: license, author, category counts, and a page of icon names. By default also returns a PNG contact sheet of the collection's sample icons so you can see the style. Set preview to false to skip the image. Pass category to page icons inside one category.",
      inputSchema: {
        prefix: z.string().describe("Collection prefix, such as lucide, mdi, or tabler."),
        category: z.string().optional().describe('Category title to page, or "uncategorized".'),
        offset: z.number().int().min(0).optional().describe("Offset into the icon name page. Default 0."),
        limit: z.number().int().min(1).max(300).optional().describe("Icon names per page. Default 80."),
        preview: z.boolean().optional().describe("Include a PNG of sample icons. Default true."),
      },
      annotations,
    },
    async (args) => {
      try {
        return await getCollection(client, args);
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "search_icons",
    {
      title: "Search icons",
      description:
        "Search icons across Iconify, the catalog behind Icônes (https://icones.js.org). Matches icon names and keywords, not arbitrary visual similarity. Returns icon ids, the collection license, and an Icônes URL. By default also returns one labeled PNG contact sheet of the matches so you can see and compare them. Set preview to false for text only.",
      inputSchema: {
        query: z.string().min(1).max(200).describe("Search text, for example home, arrow, or cloud."),
        prefix: z.string().optional().describe("Limit the search to one collection prefix."),
        prefixes: z.array(z.string()).max(20).optional().describe("Limit the search to these collection prefixes."),
        category: z.string().optional().describe("Limit the search to icon sets in this Iconify category."),
        limit: z.number().int().min(1).max(64).optional().describe("Maximum icons to return. Default 12."),
        start: z.number().int().min(0).max(900).optional().describe("Offset into the search results. Default 0."),
        preview: z.boolean().optional().describe("Attach a contact-sheet PNG of the returned icons. Default true."),
        size: z.number().int().min(16).max(128).optional().describe("Icon size in the contact sheet, in pixels. Default 56."),
        color: colorSchema,
        columns: z.number().int().min(1).max(8).optional().describe("Contact sheet columns. Default is up to 4."),
      },
      annotations,
    },
    async (args) => {
      try {
        return await searchIcons(client, args);
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "get_icon",
    {
      title: "Get an icon",
      description:
        "Get one icon by Iconify id (prefix:name). Returns dimensions, collection, license, alias parent when this name is an alias, the Icônes URL, code snippets, and a PNG you can see. Snippets cover raw SVG, a data URL, Vue, React, Svelte, an UnoCSS class, a Tailwind Iconify class, and the Iconify name. Snippet SVGs stay on currentColor unless color is set. Use preview_icons to compare several icons.",
      inputSchema: {
        icon: z.string().describe('Iconify id, for example "lucide:house" or "mdi:home".'),
        size: z.number().int().min(16).max(512).optional().describe("PNG size in pixels. Default 128."),
        color: colorSchema,
        background: z
          .string()
          .optional()
          .describe('PNG background. Default #ffffff. Use "transparent" for no background.'),
        formats: z
          .array(z.enum(SNIPPET_FORMATS))
          .optional()
          .describe("Snippet formats to include. Default: all of them."),
        includeImage: z.boolean().optional().describe("Include the PNG. Default true."),
        aliases: z
          .boolean()
          .optional()
          .describe("Also list other names that alias this icon. Requires the collection payload. Default false."),
      },
      annotations,
    },
    async (args) => {
      try {
        return await getIcon(client, args);
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "preview_icons",
    {
      title: "Preview icons",
      description:
        "Render a labeled PNG contact sheet of several icons so you can compare them in one image. Pass Iconify ids, or a search query plus an optional prefix, and the top matches are drawn. Supports size, color, background, and columns. Each icon's license is included in the text result. At most 24 icons.",
      inputSchema: {
        icons: z
          .array(z.string())
          .max(PREVIEW_CAP)
          .optional()
          .describe('Iconify ids to draw, such as ["lucide:house", "lucide:search"].'),
        query: z.string().min(1).max(200).optional().describe("Search text used when icons is omitted."),
        prefix: z.string().optional().describe("Collection prefix used with query."),
        limit: z.number().int().min(1).max(PREVIEW_CAP).optional().describe("How many search matches to draw. Default 12."),
        size: z.number().int().min(16).max(160).optional().describe("Icon size in pixels. Default 64."),
        color: colorSchema,
        background: z.string().optional().describe("Sheet background. Default #f7f6f3."),
        columns: z.number().int().min(1).max(8).optional().describe("Number of columns. Default up to 4."),
        labels: z.boolean().optional().describe("Draw the icon name under each glyph. Default true."),
        title: z.string().max(80).optional().describe("Optional heading drawn on the sheet."),
      },
      annotations,
    },
    async (args) => {
      try {
        return await previewIcons(client, args);
      } catch (error) {
        return asToolError(error);
      }
    },
  );
}

/**
 * Lists collections, hiding ones Iconify marked hidden.
 *
 * @param client - Iconify client.
 * @param args - Optional text, prefix, category, and page size. `limit` defaults to 40.
 * @returns A text result whose JSON is the filtered page. No image is attached.
 * @throws {@link IconifyError} when the prefix is invalid or the collections request fails.
 */
async function listCollections(
  client: IconifyClient,
  args: { query?: string; prefix?: string; category?: string; limit?: number },
) {
  const limit = args.limit ?? 40;
  const prefix = args.prefix ? assertPrefix(args.prefix) : undefined;
  const all = await client.listCollections();
  const summaries = Object.entries(all)
    .filter(([, info]) => info && !info.hidden)
    .map(([name, info]) => summarizeInfo(name, info));
  const filtered = filterCollections(summaries, {
    text: args.query,
    category: args.category,
    prefix,
    limit,
  });
  return toolText(
    `${filtered.collections.length} of ${filtered.matchCount} matching collections (${filtered.totalCollections} on Iconify). Licenses below belong to each icon set, not to this tool.`,
    filtered,
  );
}

/**
 * Returns one collection page and, by default, a sheet of its sample icons.
 *
 * @param client - Iconify client.
 * @param args - Prefix, optional category, page window, and preview flag.
 * `offset` defaults to 0, `limit` to 80, and `preview` to true. The sheet uses
 * up to 12 samples at 56 pixels.
 * @returns Text plus an optional PNG.
 * @throws {@link IconifyError} when the prefix is invalid, the collection is
 * missing, or `category` does not match a category title or `uncategorized`.
 */
async function getCollection(
  client: IconifyClient,
  args: { prefix: string; category?: string; offset?: number; limit?: number; preview?: boolean },
) {
  const prefix = assertPrefix(args.prefix);
  const offset = args.offset ?? 0;
  const limit = args.limit ?? 80;
  const collection = await client.getCollection(prefix);
  const info = collection.info;
  const summary = info ? summarizeInfo(prefix, info) : undefined;
  const counts = categoryCounts(collection);
  const names = iconNames(collection, args.category);
  const page = names.slice(offset, offset + limit);
  const payload = {
    prefix,
    name: collection.title ?? summary?.name ?? prefix,
    total: collection.total,
    license: summary?.license ?? licenseOf(info),
    author: summary?.author,
    category: summary?.category,
    palette: summary?.palette,
    iconesUrl: summary?.iconesUrl,
    samples: summary?.samples ?? [],
    categories: counts,
    uncategorized: (collection.uncategorized ?? []).length,
    hidden: (collection.hidden ?? []).length,
    aliasCount: Object.keys(collection.aliases ?? {}).length,
    icons: {
      category: args.category ?? null,
      offset,
      limit,
      returned: page.length,
      total: names.length,
      names: page,
      nextOffset: offset + page.length < names.length ? offset + page.length : null,
    },
  };

  const images: Buffer[] = [];
  let summaryLine = `${payload.name} (${prefix}): ${collection.total} icons. License: ${payload.license?.title ?? "unknown"}.`;
  if (args.preview !== false && payload.samples.length > 0) {
    const loaded = await client.getIcons(payload.samples.slice(0, 12));
    if (loaded.found.length > 0) {
      const infos = info ? new Map([[prefix, info]]) : await loadInfos(client, loaded.found);
      const sheet = renderIconSheet({
        icons: loaded.found,
        infos,
        title: payload.name,
        size: 56,
        columns: Math.min(4, loaded.found.length),
      });
      images.push(sheet.png);
      summaryLine += ` Sample icons are in the image (${sheet.width}×${sheet.height}).`;
    }
  }
  return toolText(summaryLine, payload, images);
}

/**
 * Searches icons and, by default, attaches a contact sheet of the page.
 *
 * @param client - Iconify client.
 * @param args - Query and optional prefix, prefixes, category, page, and sheet options.
 * `limit` defaults to 12 and the sheet icon size defaults to 56.
 * @returns Text plus an optional PNG. `hasMore` is true when the API page was
 * longer than the requested limit or came back full.
 * @throws {@link IconifyError} when a prefix or color is invalid or the search fails.
 */
async function searchIcons(
  client: IconifyClient,
  args: {
    query: string;
    prefix?: string;
    prefixes?: string[];
    category?: string;
    limit?: number;
    start?: number;
    preview?: boolean;
    size?: number;
    color?: string;
    columns?: number;
  },
) {
  const limit = args.limit ?? 12;
  const prefixes = normalizePrefixes(args.prefix, args.prefixes);
  const color = args.color ? assertColor(args.color, "color") : undefined;
  const page = await client.search({
    query: args.query.trim(),
    limit,
    start: args.start,
    prefix: prefixes.length === 1 ? prefixes[0] : undefined,
    prefixes: prefixes.length > 1 ? prefixes : undefined,
    category: args.category,
  });
  const ids = page.icons.slice(0, limit);
  const hasMore = page.icons.length > ids.length || (page.limit > 0 && page.icons.length === page.limit);
  const loaded = ids.length > 0 ? await client.getIcons(ids) : { found: [], missing: [] };
  const byId = new Map(loaded.found.map((icon) => [icon.id, icon]));
  const results = ids.map((id) => {
    const parsed = parseIconId(id);
    const info = page.collections?.[parsed.prefix];
    const icon = byId.get(parsed.id);
    return {
      id: parsed.id,
      prefix: parsed.prefix,
      name: parsed.name,
      ...(icon?.aliasOf ? { aliasOf: icon.aliasOf } : {}),
      collection: info?.name,
      license: licenseOf(info),
      iconesUrl: iconPageUrl(parsed.prefix, parsed.name),
      found: Boolean(icon),
    };
  });

  const images: Buffer[] = [];
  let imageNote = "Set preview to true to see a contact sheet.";
  if (args.preview !== false && loaded.found.length > 0) {
    const infos = new Map(Object.entries(page.collections ?? {}));
    const sheet = renderIconSheet({
      icons: loaded.found.slice(0, PREVIEW_CAP),
      infos,
      title: args.query.trim(),
      size: args.size ?? 56,
      color,
      columns: args.columns,
    });
    images.push(sheet.png);
    imageNote = `Contact sheet attached (${sheet.width}×${sheet.height}).`;
  }

  return toolText(
    `${results.length} icon${results.length === 1 ? "" : "s"} for "${args.query.trim()}". ${imageNote}${hasMore ? " More matches may be available; raise start or limit." : ""} Licenses are per collection.`,
    {
      query: args.query.trim(),
      start: page.start ?? args.start ?? 0,
      returned: results.length,
      hasMore,
      icons: results,
      missing: loaded.missing,
    },
    images,
  );
}

/**
 * Returns one icon's metadata, snippets, and PNG.
 *
 * @param client - Iconify client.
 * @param args - Icon id and optional size, color, background, snippet formats,
 * image flag, and alias flag. `size` defaults to 128, `background` to
 * `#ffffff`, and both the image and the full snippet list are included unless
 * disabled. `aliases` defaults to false because it loads the whole collection.
 * @returns Text plus an optional PNG. Palette icons note that `color` may not
 * recolor them.
 * @throws {@link IconifyError} when the id or color is invalid, or Iconify has
 * no such icon.
 */
async function getIcon(
  client: IconifyClient,
  args: {
    icon: string;
    size?: number;
    color?: string;
    background?: string;
    formats?: SnippetFormat[];
    includeImage?: boolean;
    aliases?: boolean;
  },
) {
  const parsed = parseIconId(args.icon);
  const size = args.size ?? 128;
  const color = args.color ? assertColor(args.color, "color") : undefined;
  const background = args.background ? assertBackground(args.background) : "#ffffff";
  const loaded = await client.getIcons([parsed.id]);
  const icon = loaded.found[0];
  if (!icon) {
    throw new IconifyError(
      `Iconify has no icon named "${parsed.id}". Search with search_icons or check the prefix with list_collections.`,
      "not_found",
    );
  }
  const infos = await client.getInfos([parsed.prefix]);
  const info = infos.get(parsed.prefix);
  const snippetSvg = buildSvg(icon, {
    height: "1em",
    color,
    comment: licenseComment(info, icon.id),
  });
  const snippets = buildSnippets({
    icon,
    svg: snippetSvg,
    url: iconSvgUrl(client.baseUrl, icon.prefix, icon.name, color),
    formats: args.formats,
  });
  let aliases: string[] | undefined;
  if (args.aliases) {
    const collection = await client.getCollection(parsed.prefix);
    const parent = icon.aliasOf ?? icon.name;
    aliases = aliasesFor(collection, parent);
  }

  const images: Buffer[] = [];
  if (args.includeImage !== false) {
    const rasterSvg = buildSvg(icon, {
      height: "auto",
      color: rasterInk(color),
      comment: licenseComment(info, icon.id),
    });
    images.push(rasterizeIcon(rasterSvg, size, background));
  }

  const license = licenseOf(info);
  const note =
    color && !icon.monotone
      ? " This icon has its own palette, so the color option may not change it."
      : "";
  return toolText(
    `${icon.id}${icon.aliasOf ? ` (alias of ${icon.aliasOf})` : ""} from ${info?.name ?? icon.prefix}. License: ${license?.title ?? "unknown"}.${note}`,
    {
      id: icon.id,
      prefix: icon.prefix,
      name: icon.name,
      ...(icon.aliasOf ? { aliasOf: icon.aliasOf } : {}),
      ...(aliases ? { aliases } : {}),
      width: icon.width,
      height: icon.height,
      monotone: icon.monotone,
      collection: info
        ? {
            name: info.name,
            category: info.category,
            author: info.author,
            total: info.total,
          }
        : { name: icon.prefix },
      license,
      iconesUrl: iconLink(icon.prefix, icon.name),
      svgUrl: iconSvgUrl(client.baseUrl, icon.prefix, icon.name, color),
      preview: { size, color: color ?? null, background },
      snippets,
    },
    images,
  );
}

/**
 * Renders a labeled sheet for explicit ids or for the top search matches.
 *
 * @param client - Iconify client.
 * @param args - Either `icons` or `query`, plus layout options. `size` defaults
 * to 64 and labels default to on. A transparent background is rejected so the
 * captions stay readable.
 * @returns Text describing the sheet and one PNG.
 * @throws {@link IconifyError} when neither ids nor a query are provided, the
 * background is transparent, none of the icons exist, or a search matches nothing.
 */
async function previewIcons(
  client: IconifyClient,
  args: {
    icons?: string[];
    query?: string;
    prefix?: string;
    limit?: number;
    size?: number;
    color?: string;
    background?: string;
    columns?: number;
    labels?: boolean;
    title?: string;
  },
) {
  const color = args.color ? assertColor(args.color, "color") : undefined;
  const background = args.background ? assertBackground(args.background) : undefined;
  if (background === "transparent") {
    throw new IconifyError("Contact sheet background needs a solid color so the labels stay readable.", "invalid");
  }
  const { ids, query } = await iconIdsForPreview(client, args);
  const loaded = await client.getIcons(ids);
  if (loaded.found.length === 0) {
    throw new IconifyError(
      `None of those icons were found${query ? ` for "${query}"` : ""}. ${loaded.missing.join(", ")}`.trim(),
      "not_found",
    );
  }
  const infos = await loadInfos(client, loaded.found);
  const title = args.title ?? query;
  const sheet = renderIconSheet({
    icons: loaded.found,
    infos,
    title,
    size: args.size ?? 64,
    color,
    background,
    columns: args.columns,
    labels: args.labels,
  });
  const legend = loaded.found.map((icon, index) => {
    const info = infos.get(icon.prefix);
    return {
      index: index + 1,
      id: icon.id,
      ...(icon.aliasOf ? { aliasOf: icon.aliasOf } : {}),
      collection: info?.name,
      license: licenseOf(info),
      iconesUrl: iconPageUrl(icon.prefix, icon.name),
    };
  });
  return toolText(
    `Contact sheet of ${loaded.found.length} icon${loaded.found.length === 1 ? "" : "s"} (${sheet.width}×${sheet.height}).${loaded.missing.length > 0 ? ` Missing: ${loaded.missing.join(", ")}.` : ""}`,
    {
      width: sheet.width,
      height: sheet.height,
      missing: loaded.missing,
      icons: legend,
    },
    [sheet.png],
  );
}

/**
 * Chooses the icon ids a preview will draw.
 *
 * @param client - Iconify client, used only when `args.icons` is empty.
 * @param args - Explicit ids, or a search query with an optional prefix and limit.
 * Explicit ids win. The search limit defaults to 12 and is capped by {@link PREVIEW_CAP}
 * through the tool schema.
 * @returns Canonical ids and the query when the ids came from search.
 * @throws {@link IconifyError} when no ids and no query were passed, an id is
 * malformed, or the search returns nothing.
 */
async function iconIdsForPreview(
  client: IconifyClient,
  args: { icons?: string[]; query?: string; prefix?: string; limit?: number },
): Promise<{ ids: string[]; query?: string }> {
  if (args.icons && args.icons.length > 0) {
    return { ids: parseIconIds(args.icons, PREVIEW_CAP), query: args.query };
  }
  const query = args.query?.trim();
  if (!query) {
    throw new IconifyError('Pass icons (["lucide:house"]) or a search query.', "invalid");
  }
  const limit = args.limit ?? 12;
  const prefix = args.prefix ? assertPrefix(args.prefix) : undefined;
  const page = await client.search({ query, limit, prefix });
  const ids = page.icons.slice(0, limit).map((id) => parseIconId(id).id);
  if (ids.length === 0) {
    throw new IconifyError(`No icons matched "${query}". Try a shorter or more specific name.`, "not_found");
  }
  return { ids, query };
}

/**
 * Selects the icon names for one collection page.
 *
 * @param collection - Collection payload.
 * @param category - Category title, `uncategorized`, or `undefined` for every visible name.
 * @returns Icon names in that slice.
 * @throws {@link IconifyError} with code `not_found` when `category` matches neither
 * `uncategorized` nor a category title. The error lists up to 12 category names.
 */
function iconNames(collection: IconifyCollection, category: string | undefined): string[] {
  if (!category) return visibleIconNames(collection);
  if (category.toLowerCase() === "uncategorized") return collection.uncategorized ?? [];
  const match = Object.entries(collection.categories ?? {}).find(
    ([name]) => name.toLowerCase() === category.toLowerCase(),
  );
  if (!match) {
    const available = Object.keys(collection.categories ?? {}).slice(0, 12).join(", ");
    throw new IconifyError(
      `Category "${category}" was not found.${available ? ` Categories include: ${available}.` : ""}`,
      "not_found",
    );
  }
  return match[1];
}

/**
 * Merges the singular and plural prefix filters into a unique list.
 *
 * @param prefix - Optional single prefix, placed first.
 * @param prefixes - Optional additional prefixes.
 * @returns Trimmed, validated prefixes with duplicates removed.
 * @throws {@link IconifyError} when any prefix fails {@link assertPrefix}.
 */
function normalizePrefixes(prefix: string | undefined, prefixes: string[] | undefined): string[] {
  const values = [...(prefixes ?? [])];
  if (prefix) values.unshift(prefix);
  return [...new Set(values.map((value) => assertPrefix(value)))];
}

export type { ResolvedIcon };
