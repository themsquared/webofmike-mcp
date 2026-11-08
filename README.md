# webofmike MCP server v1

Read-only [Model Context Protocol](https://modelcontextprotocol.io) server for [Mike Moore](https://webofmike.com/about/)'s blog at [webofmike.com](https://webofmike.com) (Hugo on Netlify).

It indexes **live** public pages on each refresh — RSS, `llms.txt`, sitemap, and per-post markdown. There is no content dump in this repo and no secrets.

**Remote Streamable HTTP** (stateless Netlify Function, no auth):

- Primary: [https://mcp.webofmike.com/mcp](https://mcp.webofmike.com/mcp)
- Fallback: [https://webofmike-mcp.netlify.app/mcp](https://webofmike-mcp.netlify.app/mcp)

Stdio still works for local clients that spawn a process.

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

Stdio (what Cursor, Claude Desktop, and Claude Code can spawn):

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

## Tests

Anonymous Streamable HTTP handshake (no `Authorization` header). `POST initialize` and `POST tools/list` must both succeed:

```bash
npm test
```

These hit the same handler the Netlify Function exports; they do not need the live site.

Live tool check over stdio against **webofmike.com**:

```bash
npm run smoke
```

Expect `search_posts` hits for `agentgateway` and a `get_post` body of a few thousand characters.

```bash
npm run typecheck
```

## Register as MCP

Use the hosted URL unless you are developing this repo. No API key, bearer token, or OAuth.

### Cursor

Add to `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "webofmike": {
      "url": "https://mcp.webofmike.com/mcp"
    }
  }
}
```

If the custom domain is not live yet:

```json
{
  "mcpServers": {
    "webofmike": {
      "url": "https://webofmike-mcp.netlify.app/mcp"
    }
  }
}
```

Local stdio from a clone:

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

### Claude Code / Claude Desktop

Remote (Claude Code):

```bash
claude mcp add --transport http webofmike https://mcp.webofmike.com/mcp
```

Fallback:

```bash
claude mcp add --transport http webofmike https://webofmike-mcp.netlify.app/mcp
```

Claude Desktop / claude.ai: **Settings → Connectors → Add custom connector**, paste `https://mcp.webofmike.com/mcp`, and skip auth (this server does not use OAuth).

Local stdio:

```bash
claude mcp add webofmike -- npx tsx /absolute/path/to/webofmike-mcp/src/index.ts
```

### Hermes

Remote HTTP (no credentials):

```bash
hermes mcp add webofmike --url "https://mcp.webofmike.com/mcp"
```

Or in `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  webofmike:
    url: "https://mcp.webofmike.com/mcp"
```

Fallback URL: `https://webofmike-mcp.netlify.app/mcp`.

A draft Nous catalog entry (HTTP transport, `auth: none`) lives at [`docs/optional-mcps/webofmike/manifest.yaml`](docs/optional-mcps/webofmike/manifest.yaml). Copy it into [hermes-agent](https://github.com/NousResearch/hermes-agent) as `optional-mcps/webofmike/manifest.yaml` after the remote URL is live, then `hermes mcp install webofmike`.

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector --transport http --server-url https://mcp.webofmike.com/mcp
```

Local stdio:

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

## Google Connected Apps Store / Gemini

This server speaks **Streamable HTTP** and is hosted at `https://mcp.webofmike.com/mcp`. Notes for Connected Apps:

1. Keep auth off. Both tools are `readOnlyHint: true` and the catalog is public. In Google Connected Console choose **No** when asked whether the server requires authorization.
2. Create a connected app in [Google Connected Console](https://developers.google.com/connected-apps/gpc), connection type **MCP server**, and paste the HTTPS `/mcp` URL.
3. Verify the host with `https://<your-domain>/.well-known/google-connected-apps` as described in [Register, test, and publish](https://developers.google.com/connected-apps/gpc/perform-the-steps).
4. Follow the [MCP server developer guide](https://developers.google.com/connected-apps/mcp): Inspector locally, then Gemini Developer Mode against the public URL, then submit for review.
5. Personal Gemini Apps can add a custom MCP URL under Settings → Connected Apps without a store listing.

This repo does not ship OAuth, API keys, or a Google verification file. Add those only if you publish a store listing that requires them.

## Deploy on Netlify

This is a **separate** Netlify site from the Hugo blog on webofmike.com. Same account is fine; do not attach this repo to the blog site.

1. In [Netlify](https://app.netlify.com), **Add new site → Import an existing project** and select GitHub repo `themsquared/webofmike-mcp` (production branch `main` once this lands).
2. Suggested site name: `webofmike-mcp` so the default hostname is `https://webofmike-mcp.netlify.app`.
3. Build settings are in `netlify.toml` (`publish = public`, functions in `netlify/functions`, Node 20). Leave the UI fields empty so the file wins.
4. Deploy. Confirm:
   - `GET https://webofmike-mcp.netlify.app/` — landing page
   - `POST https://webofmike-mcp.netlify.app/mcp` — MCP (anonymous `initialize` / `tools/list`)
5. **Domain management → Add custom domain** → `mcp.webofmike.com`.
6. Create the DNS record below. Wait for Netlify to issue HTTPS, then prefer the custom domain in client configs.

`netlify.toml` rewrites `/mcp` (and `/mcp/*`) to `/.netlify/functions/mcp`. The function is POST-only, stateless (`createMcpHandler` + `legacy: 'stateless'`, no session store), and has no bearer check.

Local function preview (optional): `npx netlify-cli dev`, then POST `http://localhost:8888/mcp`.

## DNS for mcp.webofmike.com

**webofmike.com DNS is hosted on Cloudflare**, not Netlify DNS. Authoritative nameservers:

- `abby.ns.cloudflare.com`
- `fred.ns.cloudflare.com`

The apex blog already sits on Netlify behind Cloudflare (`cf-ray` plus `x-nf-request-id` on `https://webofmike.com`). Email MX points at Google. Add the MCP hostname in that same Cloudflare zone; do not change nameservers.

1. Cloudflare dashboard → domain **webofmike.com** → **DNS**.
2. **Add record**:
   - Type: `CNAME`
   - Name: `mcp`
   - Target: `webofmike-mcp.netlify.app` (or the hostname Netlify shows under Domain management)
   - Proxy: **DNS only** (grey cloud) until Netlify has provisioned the certificate. HTTP-01 for Let's Encrypt must reach Netlify. After HTTPS is green you can orange-cloud to match the apex, but then Cloudflare SSL/TLS must be **Full (strict)** or you will get redirect loops.
3. Back in Netlify, wait until `mcp.webofmike.com` shows as verified with a certificate.
4. Check: `dig CNAME mcp.webofmike.com +short` should print the `*.netlify.app` hostname (when DNS-only).

Do not put an A record on `mcp` pointing at Cloudflare IPs, and do not add `mcp.webofmike.com` to the Hugo blog site.

## Project layout

```
src/index.ts                 stdio entry
src/http.ts                  local Streamable HTTP + status page
src/handler.ts               shared createMcpHandler (stateless JSON/SSE)
src/server.ts                tool registration
src/catalog.ts               live fetch + 10-minute cache
src/parse.ts                 RSS / llms.txt / sitemap / markdown
netlify/functions/mcp.ts     Netlify Function (POST /mcp)
netlify.toml                 /mcp → function rewrite
public/index.html            landing page on the Netlify site
tests/anonymous-http.test.ts anonymous initialize + tools/list
docs/optional-mcps/webofmike/manifest.yaml
                             Hermes catalog draft (http, auth none)
scripts/smoke.ts             live MCP client check (stdio)
```

## License

The server code in this repository is ISC. Posts fetched from webofmike.com remain Mike Moore's writing — cite the canonical URL when you quote them.
