# @sohampatwardhan/iconify-mcp

[![npm version](https://img.shields.io/npm/v/@sohampatwardhan/iconify-mcp)](https://www.npmjs.com/package/@sohampatwardhan/iconify-mcp)

Unofficial community MCP server for [Iconify](https://iconify.design). It searches the public Iconify catalog, returns each collection's license, and sends PNG previews back as MCP image content so a model can see the icons.

Icon pages link to [Icônes](https://icones.js.org), Anthony Fu's icon browser, which is a front end over the same catalog.

![Contact sheet of twelve Lucide icons rendered by iconify-mcp](docs/contact-sheet.png)

## Tools

| Tool | What you get |
| --- | --- |
| `list_collections` | Filter the catalog by name, prefix, or category. Each hit includes author, license, icon count, and sample ids. |
| `get_collection` | One collection: license, categories, a page of icon names, and a PNG of its sample icons. |
| `search_icons` | Keyword search (`query`, optional `prefix` / `prefixes` / `category`, `limit`, `start`). Results include Iconify ids, licenses, and Icônes links, plus a contact-sheet PNG. |
| `get_icon` | One icon (`prefix:name`): SVG, dimensions, collection, license, alias parent, Icônes URL, and a PNG. Snippets cover SVG, data URL, Vue, React, Svelte, UnoCSS, Tailwind, and the Iconify name. |
| `preview_icons` | One labeled contact sheet for a list of ids, or for the top search matches. `size`, `color`, `background`, and `columns` are configurable. |

`search_icons` and `get_collection` include a preview image by default. Pass `preview: false` when you only want the JSON.

Iconify search matches names and keywords. It does not search by visual similarity. Use the contact sheet to compare candidates.

### Code snippets

`get_icon` returns the formats Icônes offers:

- **Iconify name:** `lucide:house`
- **SVG** and a **data URL**
- **Iconify SVG URL:** `https://api.iconify.design/lucide/house.svg`
- **Vue, React, and Svelte** components
- **UnoCSS:** `<div class="i-lucide-house"></div>`
- **Tailwind** (Iconify plugin): `<span class="icon-[lucide--house]"></span>`

Snippet SVGs keep `currentColor` so they inherit text color. Pass `color` (for example `#b45309`) when the SVG and the PNG should use a fixed color. PNGs default to `#1c1917` on white. Palette icons that do not use `currentColor` keep their original colors.

### Resources

| URI | Body |
| --- | --- |
| `iconify://collections` | Collection list with licenses |
| `iconify://collection/{prefix}` | One collection, including up to 200 icon names |
| `iconify://icon/{prefix}/{name}.svg` | SVG |
| `iconify://icon/{prefix}/{name}.png` | 128px PNG on white |
| `iconify://icon/{prefix}/{name}.json` | Metadata and snippets |

`iconify://` is the scheme to use. The same resources are also registered on `icones://` so older URIs keep working.

Icônes links look like `https://icones.js.org/collection/lucide?icon=lucide:house`.

## Setup

Requires Node.js 20 or newer.

```bash
npx -y @sohampatwardhan/iconify-mcp@latest
```

The published bin is `iconify-mcp`. `icones-mcp` is a compatibility alias for the same program. Stdio is the default. Logs go to stderr so they stay off the JSON-RPC stream. The MCP server name is `iconify-mcp`.

### Cursor

Add this to `~/.cursor/mcp.json` or the project's `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "iconify": {
      "command": "npx",
      "args": ["-y", "@sohampatwardhan/iconify-mcp@latest"]
    }
  }
}
```

### Claude Desktop

The same `mcpServers` block goes in the desktop config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Restart Claude Desktop after saving.

### Claude Code

```bash
claude mcp add iconify -- npx -y @sohampatwardhan/iconify-mcp@latest
```

### VS Code

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "iconify": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@sohampatwardhan/iconify-mcp@latest"]
    }
  }
}
```

### Streamable HTTP

HTTP mode is stateless and has no authentication. Bind it to localhost.

```bash
npx -y @sohampatwardhan/iconify-mcp@latest --http --port 3333
```

The MCP endpoint is `http://127.0.0.1:3333/mcp`. A client config looks like:

```json
{
  "mcpServers": {
    "iconify": {
      "url": "http://127.0.0.1:3333/mcp"
    }
  }
}
```

`GET /health` returns `ok`.

### MCP Inspector

The web UI:

```bash
npm install
npm run build
npx @modelcontextprotocol/inspector node dist/cli.js
```

A non-interactive check of the stdio server:

```bash
npx @modelcontextprotocol/inspector --cli --method tools/list node dist/cli.js
npx @modelcontextprotocol/inspector --cli --method tools/call \
  --tool-name get_icon \
  --tool-args-json '{"icon":"lucide:house","size":64}' \
  node dist/cli.js
```

## Examples

Search and look at the sheet:

```json
{
  "name": "search_icons",
  "arguments": { "query": "arrow", "prefix": "lucide", "limit": 8 }
}
```

Fetch one icon as a React component and a 128px PNG:

```json
{
  "name": "get_icon",
  "arguments": { "icon": "lucide:house", "formats": ["react", "svg", "iconify"] }
}
```

Compare a hand-picked set. This is the call that produced the image at the top of the README:

```json
{
  "name": "preview_icons",
  "arguments": {
    "title": "Lucide",
    "columns": 4,
    "size": 72,
    "icons": [
      "lucide:house", "lucide:search", "lucide:heart", "lucide:star",
      "lucide:sun", "lucide:moon", "lucide:cloud", "lucide:camera",
      "lucide:bell", "lucide:settings", "lucide:user", "lucide:mail"
    ]
  }
}
```

Prompts that work well once the server is connected:

- "Search Lucide for a house icon and show me the candidates."
- "Get the SVG and a Svelte component for `tabler:brand-github`."
- "Make a contact sheet of weather icons from Phosphor."

## Licenses

This server is MIT. See [LICENSE](LICENSE).

Icon artwork is not relicensed. Every collection on Iconify has its own license (MIT, Apache-2.0, ISC, CC BY 4.0, and others). `list_collections`, `get_collection`, `search_icons`, `get_icon`, and `preview_icons` return that license's title, SPDX id, and URL. SVG snippets include a comment with the collection, author, and license. Read that license before shipping an icon.

Contact-sheet labels are set in [Inter](https://github.com/rsms/inter), which is bundled under the SIL Open Font License. The license text is in [assets/fonts/OFL.txt](assets/fonts/OFL.txt). Rasterized labels in a PNG are pixels. The font file itself stays under the OFL.

## Data source

This server calls the public Iconify API at `https://api.iconify.design`. Icônes (icones.js.org) is the browsing UI those icon links open. The client uses:

- `GET /collections` and `GET /collection`
- `GET /search`
- `GET /{prefix}.json?icons=...`

SVGs are built locally with `@iconify/utils` and rasterized with `@resvg/resvg-js`. The client keeps at least 100ms between requests, caches collection metadata, search results, and icon bodies in memory, and retries 429 and 5xx responses.

The public API is a shared service. Point `ICONIFY_API_URL` at your own [Iconify API](https://iconify.design/docs/api/) instance if you need higher volume.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ICONIFY_API_URL` | `https://api.iconify.design` | API origin |
| `ICONES_MIN_INTERVAL_MS` | `100` | Minimum gap between API calls |
| `ICONES_CACHE` | enabled | Set to `0` to disable the memory cache |

## Development

```bash
npm install
npm run lint
npm test
npm run typecheck
npm run build
node dist/cli.js --help
npm run smoke
```

`npm run lint` checks TSDoc comments with `eslint-plugin-tsdoc` (`tsdoc/syntax`). `npm test` includes rendering tests and a live call against the public API. `npm run smoke` starts the built stdio server, calls `preview_icons`, and writes `docs/contact-sheet.png`. CI runs `npm ci`, then lint, typecheck, test, build, and smoke.

`prepublishOnly` compiles TypeScript into `dist/` before the package is packed.

## Releasing

The package on npm is `@sohampatwardhan/iconify-mcp`. Version `0.2.0` is the first version of that scoped package. The old unscoped name `icones-mcp` stays on the registry as a deprecated package.

Trusted publishing can be attached only after the package exists. Publish `0.2.0` once from a maintainer machine, then add the GitHub Actions publisher, then let tags publish later versions.

```bash
npm login
npm ci
npm publish --access public
```

Leave `--provenance` off for that local publish. Provenance is added by the GitHub Actions workflow, which has the OIDC token. Do not push a `v0.2.0` tag for this bootstrap. The workflow would try to publish `0.2.0` again.

On npmjs.com, open `@sohampatwardhan/iconify-mcp` → Settings → Trusted publishing (the section is also labeled Trusted Publisher). Choose GitHub Actions and enter:

| Field | Value |
| --- | --- |
| Organization or user | `sohampatwardhan` |
| Repository | `iconify-mcp` |
| Workflow filename | `release.yml` |
| Environment name | empty |

The filename is `release.yml` only, not `.github/workflows/release.yml`. Allow direct `npm publish`. A publisher created after 3 September 2026 starts with `npm stage publish` allowed and does not allow `npm publish` until that action is selected. Leave dist-tag management off. The same link can be created with npm CLI 11.15.0 or newer:

```bash
npm trust github @sohampatwardhan/iconify-mcp \
  --repo sohampatwardhan/iconify-mcp \
  --file release.yml \
  --allow-publish
```

The first successful publish from that workflow has to happen within two days of saving the publisher, or the configuration expires. Cut the next version for that check:

```bash
npm version patch   # or minor, or major
git push --follow-tags
```

`npm version` writes the version and a `vX.Y.Z` tag. `.github/workflows/release.yml` runs on that tag. It refuses the job when the tag is not `v` plus `package.json` `"version"`, then runs `npm ci`, lint, typecheck, test, build, and smoke, publishes with `npm publish --provenance --access public`, and opens a GitHub Release with generated notes.

Deprecate the old package name after the scoped package is on the registry:

```bash
npm deprecate icones-mcp "Renamed to @sohampatwardhan/iconify-mcp"
```
