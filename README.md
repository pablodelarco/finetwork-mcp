# finetwork-mcp

MCP (Model Context Protocol) server for [Finetwork](https://finetwork.com), a Spanish telecom provider. Lets any MCP-compatible AI assistant query your Finetwork account: invoices, services, profile, and billing summaries.

Built with TypeScript + Bun. No browser, no scraping — pure HTTP calls against Finetwork's internal REST API.

> **Disclaimer.** This project is **not affiliated with, endorsed by, or sponsored by Finetwork**. It uses undocumented endpoints reverse-engineered from Finetwork's public Flutter Web portal. You are responsible for compliance with Finetwork's Terms of Service when using this software. Provided "as is" under the MIT License — see [`LICENSE`](LICENSE).

## Tools

| Tool | Description |
|---|---|
| `get_profile` | Account profile: name, DNI, IBAN, billing address |
| `get_invoices` | Invoice history with pagination |
| `get_latest_invoice` | Most recent invoice (quick check) |
| `get_services` | Services on the account (phone lines, data plans) |
| `get_yearly_summary` | Annual billing summary |
| `get_debt_summary` | Outstanding debt check |

All tools are **read-only**. The MCP cannot modify anything on your Finetwork account.

## Setup

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Clone and install

```bash
git clone https://github.com/pablodelarco/finetwork-mcp.git
cd finetwork-mcp
bun install
```

### 3. Provide your Finetwork credentials

You have two options. Pick one.

**Option A — Environment variables (recommended).** No file on disk.

```bash
export FINETWORK_EMAIL="your@email.com"
export FINETWORK_PASSWORD="your-password"
```

**Option B — Credentials file.** For MCP clients that don't pass env vars cleanly.

```bash
echo '{"email":"your@email.com","password":"your-password"}' > credentials.json
chmod 600 credentials.json
```

These are your Finetwork account credentials — the same you use at [mi.finetwork.com](https://mi.finetwork.com). They are sent only to `https://mi.finetwork.com` over HTTPS and never logged. See [SECURITY.md](SECURITY.md) for the full credential-handling model.

### 4. Add to Claude Code (or any MCP client)

Edit your `.mcp.json`:

```json
{
  "mcpServers": {
    "finetwork": {
      "command": "bun",
      "args": ["run", "/path/to/finetwork-mcp/src/index.ts"],
      "env": {
        "FINETWORK_EMAIL": "your@email.com",
        "FINETWORK_PASSWORD": "your-password"
      },
      "timeout": 30
    }
  }
}
```

Or, using the file-based path:

```json
{
  "mcpServers": {
    "finetwork": {
      "command": "bun",
      "args": ["run", "/path/to/finetwork-mcp/src/index.ts"],
      "env": {
        "FINETWORK_CREDS_PATH": "/path/to/credentials.json"
      },
      "timeout": 30
    }
  }
}
```

The server communicates via stdio (JSON-RPC).

## Configuration reference

| Env var | Required | Description |
|---|---|---|
| `FINETWORK_EMAIL` | one of | Account email. Used together with `FINETWORK_PASSWORD`. |
| `FINETWORK_PASSWORD` | one of | Account password. |
| `FINETWORK_CREDS_PATH` | one of | Absolute path to a JSON file with `{"email","password"}`. |
| `FINETWORK_CLIENT_ID` | optional | Override the bundled OAuth2 client_id (in case Finetwork rotates it). |
| `FINETWORK_CLIENT_SECRET` | optional | Override the bundled OAuth2 client_secret. |

You must provide *either* (`FINETWORK_EMAIL` + `FINETWORK_PASSWORD`) *or* `FINETWORK_CREDS_PATH`. Env vars take precedence.

## How it works

- **Auth.** OAuth2 password grant against `https://mi.finetwork.com/pe/user/access_token`. The MCP caches the access token in memory and refreshes it when it expires (default 1 hour).
- **Client credentials.** The OAuth2 `client_id` / `client_secret` are bundled in Finetwork's public Flutter Web app and are extracted from there. They are not user-specific and can be overridden via env vars if Finetwork rotates them.
- **Transport.** Requests go to `https://mi.finetwork.com/pe/api/v1/*`. No browser, no Playwright, no scraping.

## Development

```bash
bun install
bun run typecheck   # tsc --noEmit
bun run start       # run the MCP server on stdio
```

## Limitations

- Finetwork does not offer a public, supported API. If they change their internal endpoints or rotate the bundled OAuth2 client, the corresponding tool may break until this project is updated.
- Localized for Finetwork's Spanish portal (`/pe` path).
- Read-only. No mutation tools.

## License

MIT — see [LICENSE](LICENSE).
