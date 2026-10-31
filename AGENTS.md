# AGENTS.md

Notes for coding agents working in this repository. The server is MIT-licensed. Icon artwork stays under each Iconify collection's own license.

## Overview

`icones-mcp` is an MCP server for [Icônes](https://icones.js.org). Icônes is a front end over the public [Iconify](https://iconify.design) API at `https://api.iconify.design`. The server searches that catalog, returns each collection's license, and sends PNG previews back as MCP image content.

Node.js 20 or newer. The package is ESM (`"type": "module"`). The published bin is `icones-mcp` (`dist/cli.js`). Logs go to stderr so they stay off the JSON-RPC stream.

## Architecture

```
src/cli.ts            stdio by default; --http starts Streamable HTTP
src/http.ts           stateless HTTP transport, /mcp and /health
src/server.ts         createIconesServer, clientFromEnv
src/index.ts          public exports (@packageDocumentation)
src/version.ts        VERSION from package.json, USER_AGENT, SERVER_NAME
src/iconify/          HTTP client, TTL cache, request gate, errors, API types
src/icons/            ids, colors, SVG, snippets, collection summaries
src/mcp/              tool registration, resources, contact-sheet requests, tool results
src/render/           contact-sheet SVG, resvg PNG, bundled Inter font
scripts/smoke.ts      stdio client against dist/cli.js
test/                 vitest, including one live Iconify call
assets/fonts/         Inter Regular (SIL OFL). License text is assets/fonts/OFL.txt
```

`createIconesServer` builds an `McpServer`, then registers tools and resources on one shared `IconifyClient`. `clientFromEnv` reads:

| Variable | Default | Effect |
| --- | --- | --- |
| `ICONIFY_API_URL` | `https://api.iconify.design` | API origin. `http:` and `https:` only. |
| `ICONES_MIN_INTERVAL_MS` | `100` | Minimum gap between API calls. A non-numeric value is ignored. |
| `ICONES_CACHE` | enabled | `0` disables the memory cache. |

The client keeps collection metadata, search pages, and icon bodies in memory (`src/iconify/cache.ts`), spaces calls with `RequestGate`, and retries HTTP 429 and 5xx (`maxRetries` defaults to 2). Search with `limit` below 32 is retried once at 32 when Iconify returns a bad request. Icon bodies are resolved with `@iconify/utils` (`getIconData`), 40 names per prefix request.

### Tools

| Tool | Behavior |
| --- | --- |
| `list_collections` | Filter by `query`, `prefix`, or `category`. License, author, count, samples. No image. Default `limit` 40. |
| `get_collection` | One collection, a page of names, and a sample-icon PNG unless `preview` is `false`. |
| `search_icons` | Name and keyword search. Ids, licenses, Icônes URLs, and a contact-sheet PNG unless `preview` is `false`. |
| `get_icon` | One `prefix:name`: SVG snippets, license, alias parent, and a PNG unless `includeImage` is `false`. |
| `preview_icons` | One labeled sheet for explicit ids or for the top search matches. At most 24 icons. |

`search_icons` matches names and keywords. It does not search by visual similarity.

### Resources

| URI | Body |
| --- | --- |
| `icones://collections` | Collection list with licenses. Hidden collections are omitted. |
| `icones://collection/{prefix}` | One collection, including up to 200 icon names. |
| `icones://icon/{prefix}/{name}.svg` | SVG. `currentColor` is left in place. |
| `icones://icon/{prefix}/{name}.png` | 128px PNG on white, ink `#1c1917`. |
| `icones://icon/{prefix}/{name}.json` | Metadata and snippets. A missing suffix is treated as JSON. |

### Transports

Stdio is the default (`StdioServerTransport` in `src/cli.ts`).

`--http` (or any `--port` / `--host`) starts stateless Streamable HTTP. Default bind is `127.0.0.1:3333`. The MCP endpoint is `/mcp`. `GET /health` returns `ok`. Each request gets a new server and transport (`sessionIdGenerator: undefined`). There is no authentication. Keep HTTP on localhost.

```bash
node dist/cli.js
node dist/cli.js --http --port 3333 --host 127.0.0.1
node dist/cli.js --help
```

## How PNG content is produced

1. `buildSvg` (`src/icons/svg.ts`) turns a resolved icon into an SVG with `@iconify/utils` (`iconToSVG`, `replaceIDs`, `iconToHTML`). A license comment is inserted inside the root element. Double hyphens in that comment are rewritten so the XML stays well-formed.
2. Snippet SVGs keep `currentColor` unless the caller sets `color`.
3. PNGs cannot paint `currentColor`. `rasterInk` uses `#1c1917` (`DEFAULT_INK`) when `color` is omitted. `frameIconSvg` centers one icon in a square. `renderContactSheet` composes a labeled grid (default page `#f7f6f3`, cards white, captions in Inter).
4. `@resvg/resvg-js` rasterizes the SVG. `loadSystemFonts` is false. The only font file is bundled Inter (`src/render/font.ts` looks next to both `src/render` and `dist/render`). The PNG signature is checked before the buffer is returned.
5. Tool results append `image/png` content, base64, via `toolText`. Resource PNGs use a base64 `blob` on the resource content.

`IconifyError` becomes an MCP tool error and is not logged. Any other thrown value is logged to stderr and still returned as a tool error.

## Setup and commands

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
node dist/cli.js --help
CONTACT_SHEET_OUT=/tmp/icones-contact-sheet.png npm run smoke
```

| Script | What it runs |
| --- | --- |
| `lint` | `eslint-plugin-tsdoc` rule `tsdoc/syntax` on `src/`, `scripts/`, `test/`, and `vitest.config.ts` |
| `typecheck` | `tsc -p tsconfig.json --noEmit` (includes tests and scripts) |
| `test` | `vitest run` |
| `build` | `tsc -p tsconfig.build.json` into `dist/` with declarations |
| `smoke` | stdio client against `dist/cli.js`, calls `preview_icons`, writes `docs/contact-sheet.png` unless `CONTACT_SHEET_OUT` is set |
| `start` | `node dist/cli.js` |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, build, and smoke on Node 22. Smoke writes to `/tmp` so it does not touch `docs/contact-sheet.png`.

MCP Inspector, after a build:

```bash
npx @modelcontextprotocol/inspector node dist/cli.js
npx @modelcontextprotocol/inspector --cli --method tools/list node dist/cli.js
```

### TypeScript 7 and the TSDoc parser

`npm run build` and `npm run typecheck` call `tsc`, which is TypeScript 7 from the `@typescript/native` package (`npm:typescript@^7.0.2`).

The npm package named `typescript` is `@typescript/typescript6`. `eslint-plugin-tsdoc` parses with typescript-eslint, and that parser imports the `typescript` package. TypeScript 7.0 does not ship the compiler API, so the TypeScript 6 API package sits beside the TypeScript 7 binary. `tsc6` is the TypeScript 6 compiler and is not used for the build. Application code does not import `typescript`.

## Loading this server from an agent

Build first. `dist/` is gitignored, so a fresh checkout has no `dist/cli.js` until `npm ci && npm run build`.

### In the same session, over stdio

A running agent cannot grow a new MCP namespace until its client restarts. After the build, drive the server with the same stdio client the smoke script uses (`@modelcontextprotocol/sdk` `Client` and `StdioClientTransport`):

- command: the current Node binary
- args: absolute path to `dist/cli.js`
- cwd: repository root
- stderr: inherit or pipe, so logs stay off the JSON-RPC stdout

Call `search_icons`, `get_icon`, and `preview_icons`. Each of those returns an `image` content block with `mimeType: "image/png"` and base64 data when previews are left on. Decode the base64 and check the PNG signature (`89 50 4e 47 0d 0a 1a 0a`) plus a non-zero width and height. `get_icon` defaults to 128×128. `search_icons` and `preview_icons` return a contact sheet.

`scripts/smoke.ts` is the checked-in version of this loop for `preview_icons` only. `npm test` covers the tools with a mocked Iconify fetch (`test/helpers.ts`) and one live `get_icon` (`test/live.test.ts`).

### Cursor IDE

Put this in the project `.cursor/mcp.json` or the personal `~/.cursor/mcp.json`, then restart the client so it loads the server. `${workspaceFolder}` is the directory that contains `.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "icones": {
      "command": "node",
      "args": ["${workspaceFolder}/dist/cli.js"]
    }
  }
}
```

Do not commit a personal MCP config. `~/.cursor/mcp.json` stays on the machine. A project `.cursor/mcp.json` is shared config; add one only when the change is meant for every checkout, and do not put secrets in it. This repo does not ship one. The published install (`npx -y icones-mcp`) is documented in the README and is a different command from the local `dist/cli.js` build.

### Cloud agents

Cloud agents load MCP servers from the MCP dropdown at [cursor.com/agents](https://cursor.com/agents), or from team servers under Dashboard → Plugins & MCPs. They do not read `~/.cursor/mcp.json`.

A stdio entry runs inside the agent VM, so `dist/cli.js` has to exist before that process starts. Prefer the in-session stdio client above when you are already on a branch and have just built. For a dashboard stdio server, the environment install needs to have produced `dist/cli.js`, and the command needs to run with the repo as the working directory:

```json
{
  "command": "node",
  "args": ["dist/cli.js"]
}
```

HTTP is the transport Cursor recommends for cloud agents, because the config stays out of the VM. This server's HTTP mode is unauthenticated, so bind localhost and point the client at `http://127.0.0.1:3333/mcp`:

```bash
node dist/cli.js --http --host 127.0.0.1 --port 3333
```

SSE and `mcp-remote` are not supported by Cloud Agents.

## Coding conventions

- TypeScript strict, `NodeNext` module resolution, `verbatimModuleSyntax`. Import emitted files with `.js` suffixes, including type-only imports.
- ESM only. `src/version.ts` reads `package.json` through `createRequire` because JSON module imports are not enabled.
- Tool inputs are Zod schemas on `registerTool`. Keep `readOnlyHint`, `idempotentHint`, and `openWorldHint` set the way `src/mcp/tools.ts` sets them.
- TSDoc on every exported declaration and on non-trivial internal functions, classes, methods, types, and module-level constants. File-level `/** */` blocks on modules. `src/index.ts` and `src/cli.ts` carry `@packageDocumentation`.
- Parameter docs use `@param name - description`. Also use `@returns`, `@throws` when the function throws, `@example` when a call is easier to show than to describe, `@remarks` for behavior that does not belong in the summary, and `@defaultValue` on config and options fields.
- `tsdoc.json` keeps the standard TSDoc tags. `npm run lint` fails on JSDoc-only forms such as `@param {type}`, `@return`, and `@function`, and on an `@` that is not a tag (write `\@iconify/utils` inside a comment).
- Short `//` comments belong inside function bodies, on the line they explain. The search retry in `IconifyClient.search` is one of these.
- Colors that reach SVG attributes go through `assertColor` / `assertBackground`. Do not interpolate raw user strings into markup.
- Palette icons (`monotone: false`) may ignore `color`. `get_icon` already says so in its summary line.

## Testing expectations

- `test/**/*.test.ts` is the vitest set. Default timeout is 20 seconds. `test/live.test.ts` allows 60 seconds and calls the public API (`lucide:home`).
- `test/helpers.ts` stubs `fetch`. Pass that client into `createIconesServer({ client })` or `startHttpServer({ client })`.
- Rendering tests decode PNG bytes with `pngjs` and look for expected colors.
- Behavior changes need a test that fails before the change. Doc-only edits still have to leave `lint`, `typecheck`, `test`, `build`, and `smoke` green.
- After a change that touches tools, SVG, or raster output, call the built server over stdio and confirm `search_icons`, `get_icon`, and `preview_icons` still return real PNG payloads.
- Set `CONTACT_SHEET_OUT` when running smoke locally if you are not intentionally refreshing `docs/contact-sheet.png`.

## Pull requests

- Branch from `main`. Keep the diff limited to the task.
- Commit messages describe the change in a full sentence.
- Update `README.md` when a user-facing command, tool, resource, or environment variable changes. `AGENTS.md` follows the code when an agent workflow changes.
- Do not commit `dist/`, `node_modules/`, personal MCP config, or secrets.
- CI must pass: lint, typecheck, test, build, smoke. Do not merge a red check.
