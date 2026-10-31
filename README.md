# webofmike MCP server v1

Read-only [Model Context Protocol](https://modelcontextprotocol.io) server for [Mike Moore](https://webofmike.com/about/)'s blog at [webofmike.com](https://webofmike.com) (Hugo on Netlify).

It indexes **live** public pages on each refresh — RSS, `llms.txt`, sitemap, and per-post markdown. There is no content dump in this repo and no secrets.

## Tools

| Tool | Input | Output |
| --- | --- | --- |
| `search_posts` | `query` (string), optional `limit` (1–25) | `{ title, slug, url, summary, date }[]` |
| `get_post` | `slug` (or a canonical URL) | markdown `body`, canonical `url`, `title`, `date`, `tags`, `series` when present |

Empty `query` returns the newest posts. `get_post` prefers `https://webofmike.com/<slug>/index.md` (the site also honors `Accept: text/markdown`).

## How the index is built

On first tool call (and again every 10 minutes) the server fetches, in parallel:

1. [https://webofmike.com/index.xml](https://webofmike.com/index.xml) — RSS 2.0 (title, URL, date, summary, tags)
2. [https://webofmike.com/llms.txt](https://webofmike.com/llms.txt) — curated index plus series headings
3. [https://webofmike.com/sitemap.xml](https://webofmike.com/sitemap.xml) — canonical slugs
4. [https://webofmike.com/index.md](https://webofmike.com/index.md) — homepage markdown fallback

`get_post` then loads that slug's live markdown. If one feed is down, the others still build a catalog.

The site is public. `robots.txt` and [auth.md](https://webofmike.com/auth.md) say there is no login. This server never asks for credentials.

## Requirements

- Node.js 20 or later
- Network access to `webofmike.com`

```bash
npm install
```

## Run locally

Stdio (what Cursor, Claude Desktop, and Claude Code spawn):

```bash
npx tsx src/index.ts
```

The process waits on stdin. Logs go to **stderr** only — stdout is the JSON-RPC channel.

Streamable HTTP (small Node service, default `http://127.0.0.1:43147`):

```bash
npm run start:http
```

| Env | Default | Meaning |
| --- | --- | --- |
| `PORT` | `43147` | Listen port |
| `HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` behind a reverse proxy |
| `MCP_PATH` | `/mcp` | MCP endpoint path |

`GET /` is a short status page. `GET /health` returns JSON. `POST /mcp` is the MCP endpoint.

## Smoke test

Calls both tools over stdio against **live** webofmike.com:

```bash
npm run smoke
```

Expect `search_posts` hits for `agentgateway` and a `get_post` body of a few thousand characters.

## Register as MCP

### Cursor

Add to `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "webofmike": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/webofmike-mcp/src/index.ts"]
    }
  }
}
```

From this repo you can also use `"command": "npm"` with `"args": ["start"]` and `"cwd"` set to the clone.

Remote HTTP (after you deploy):

```json
{
  "mcpServers": {
    "webofmike": {
      "url": "https://mcp.example.com/mcp"
    }
  }
}
```

### Claude Desktop / Claude Code

Same stdio shape in Claude Desktop's MCP config, or:

```bash
claude mcp add webofmike -- npx tsx /absolute/path/to/webofmike-mcp/src/index.ts
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

## Google Connected Apps Store / Gemini

This v1 is stdio-first and also speaks **Streamable HTTP** so it can be hosted later as a Connected App. Notes that will matter then:

1. Deploy this process on a **public HTTPS** URL (Cloud Run, Fly, Railway, a Netlify/Cloudflare function in front of Node, etc.). Example endpoint: `https://mcp.webofmike.com/mcp`.
2. Keep auth off. Both tools are `readOnlyHint: true` and the catalog is public. In Google Connected Console choose **No** when asked whether the server requires authorization.
3. Create a connected app in [Google Connected Console](https://developers.google.com/connected-apps/gpc), connection type **MCP server**, and paste the HTTPS `/mcp` URL.
4. Verify the host with `https://<your-domain>/.well-known/google-connected-apps` as described in [Register, test, and publish](https://developers.google.com/connected-apps/gpc/perform-the-steps).
5. Follow the [MCP server developer guide](https://developers.google.com/connected-apps/mcp): Inspector locally, then Gemini Developer Mode against the public URL, then submit for review.
6. Personal Gemini Apps can add a custom MCP URL under Settings → Connected Apps without a store listing. That still needs HTTPS Streamable HTTP.

This repo does not ship OAuth, API keys, or a Google verification file. Add those only when you publish a hosted endpoint you control.

## Deploy

Any Node 20+ host that can reach webofmike.com:

```bash
npm install --omit=dev
HOST=0.0.0.0 PORT=8080 npm run start:http
```

Put TLS in front. Do not expose an unauthenticated write surface — this server has none.

## Project layout

```
src/index.ts     stdio entry
src/http.ts      Streamable HTTP + status page
src/server.ts    tool registration
src/catalog.ts   live fetch + 10-minute cache
src/parse.ts     RSS / llms.txt / sitemap / markdown
scripts/smoke.ts live MCP client check
```

## License

The server code in this repository is ISC. Posts fetched from webofmike.com remain Mike Moore's writing — cite the canonical URL when you quote them.
