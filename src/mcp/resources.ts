/**
 * MCP resources for collection metadata and single-icon SVG, PNG, and JSON.
 *
 * PNG resources are 128 pixels on white. SVG resources keep `currentColor`.
 * JSON resources include the same snippets as `get_icon`.
 */

import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IconifyClient } from "../iconify/client.js";
import { IconifyError } from "../iconify/errors.js";
import { rasterInk } from "../icons/color.js";
import { assertPrefix, parseIconId } from "../icons/names.js";
import { buildSnippets } from "../icons/snippets.js";
import {
  categoryCounts,
  filterCollections,
  licenseOf,
  summarizeInfo,
  visibleIconNames,
} from "../icons/summary.js";
import { buildSvg, iconSvgUrl, licenseComment } from "../icons/svg.js";
import { rasterizeIcon } from "../render/png.js";

/**
 * Edge length, in pixels, of icon PNG resources on `iconify://` and `icones://`.
 */
const RESOURCE_PNG_SIZE = 128;

/**
 * URI schemes that expose the same collection and icon resources.
 *
 * `iconify` is the scheme clients should use. `icones` stays registered so
 * older resource URIs keep resolving to the same bodies.
 */
const RESOURCE_SCHEMES = ["iconify", "icones"] as const;

/**
 * Registers Iconify resources on an MCP server for every entry of {@link RESOURCE_SCHEMES}.
 *
 * Each scheme exposes `collections`, `collection/{prefix}`, and `icon/{prefix}/{name}`
 * with a `.svg`, `.png`, or `.json` suffix. A missing suffix is treated as JSON.
 * PNG resources are 128 pixels on white. The collection payload includes up to 200 icon names.
 *
 * @param server - MCP server that will own the resources.
 * @param client - Iconify client shared with the tools.
 *
 * @remarks
 * Hidden collections are omitted from the list. Icon artwork keeps each
 * collection's own license. A resource suffix other than `svg`, `png`, or
 * `json` throws {@link IconifyError}. `iconify://` resource names are
 * `collections`, `collection`, and `icon`. `icones://` uses those names with
 * an `icones-` prefix so both templates can be registered together.
 */
export function registerIconesResources(server: McpServer, client: IconifyClient): void {
  for (const scheme of RESOURCE_SCHEMES) {
    registerScheme(server, client, scheme);
  }
}

/**
 * Builds the MCP resource name for one scheme.
 *
 * @param scheme - `iconify` or `icones`.
 * @param base - Shared name: `collections`, `collection`, or `icon`.
 * @returns `base` for `iconify`, and `icones-` plus `base` for the compatibility scheme.
 */
function resourceName(scheme: (typeof RESOURCE_SCHEMES)[number], base: string): string {
  return scheme === "iconify" ? base : `icones-${base}`;
}

/**
 * Registers the collection list, one collection, and one icon for a single URI scheme.
 *
 * @param server - MCP server that will own the resources.
 * @param client - Iconify client shared with the tools.
 * @param scheme - `iconify` or `icones`. Templates and example URIs use this scheme.
 */
function registerScheme(
  server: McpServer,
  client: IconifyClient,
  scheme: (typeof RESOURCE_SCHEMES)[number],
): void {
  const iconExample = `${scheme}://icon/lucide/house.svg`;
  server.registerResource(
    resourceName(scheme, "collections"),
    `${scheme}://collections`,
    {
      description:
        "Iconify collections with license, author, and icon counts. Icon artwork is licensed by each collection, not by this server. iconify:// is the primary scheme. icones:// is the same catalog.",
      mimeType: "application/json",
    },
    async (uri) => {
      const all = await client.listCollections();
      const summaries = Object.entries(all)
        .filter(([, info]) => info && !info.hidden)
        .map(([prefix, info]) => summarizeInfo(prefix, info));
      const filtered = filterCollections(summaries, { limit: summaries.length });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(filtered, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    resourceName(scheme, "collection"),
    new ResourceTemplate(`${scheme}://collection/{prefix}`, { list: undefined }),
    {
      description: `One Iconify collection: license, categories, and up to 200 icon names. Read ${scheme}://icon/{prefix}/{name}.svg for artwork.`,
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const prefix = assertPrefix(String(variables.prefix));
      const collection = await client.getCollection(prefix);
      const names = visibleIconNames(collection);
      const info = collection.info;
      const body = {
        prefix,
        name: collection.title ?? info?.name ?? prefix,
        total: collection.total,
        license: licenseOf(info),
        author: info?.author,
        categories: categoryCounts(collection),
        aliasCount: Object.keys(collection.aliases ?? {}).length,
        hidden: (collection.hidden ?? []).length,
        iconNames: names.slice(0, 200),
        truncated: names.length > 200,
      };
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(body, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    resourceName(scheme, "icon"),
    new ResourceTemplate(`${scheme}://icon/{prefix}/{icon}`, { list: undefined }),
    {
      description: `One icon. Use a .svg, .png, or .json suffix, for example ${iconExample}. PNG resources are 128px on white.`,
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const prefix = assertPrefix(String(variables.prefix));
      const file = String(variables.icon);
      const dot = file.lastIndexOf(".");
      const name = dot > 0 ? file.slice(0, dot) : file;
      const ext = (dot > 0 ? file.slice(dot + 1) : "json").toLowerCase();
      if (ext !== "svg" && ext !== "png" && ext !== "json") {
        throw new IconifyError(`Unsupported icon resource ".${ext}". Use .svg, .png, or .json.`, "invalid");
      }
      const parsed = parseIconId(`${prefix}:${name}`);
      const loaded = await client.getIcons([parsed.id]);
      const icon = loaded.found[0];
      if (!icon) {
        throw new IconifyError(`Iconify has no icon named "${parsed.id}".`, "not_found");
      }
      const infos = await client.getInfos([prefix]);
      const info = infos.get(prefix);
      const comment = licenseComment(info, icon.id);

      if (ext === "png") {
        const svg = buildSvg(icon, { height: "auto", color: rasterInk(undefined), comment });
        const png = rasterizeIcon(svg, RESOURCE_PNG_SIZE, "#ffffff");
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "image/png",
              blob: png.toString("base64"),
            },
          ],
        };
      }

      const svg = buildSvg(icon, { height: "1em", comment });
      if (ext === "svg") {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "image/svg+xml",
              text: svg,
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                id: icon.id,
                aliasOf: icon.aliasOf ?? null,
                width: icon.width,
                height: icon.height,
                monotone: icon.monotone,
                license: licenseOf(info),
                collection: info?.name ?? prefix,
                iconesUrl: `https://icones.js.org/collection/${prefix}?icon=${prefix}:${icon.name}`,
                svgUrl: iconSvgUrl(client.baseUrl, prefix, icon.name),
                snippets: buildSnippets({
                  icon,
                  svg,
                  url: iconSvgUrl(client.baseUrl, prefix, icon.name),
                }),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
