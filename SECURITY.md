# Security Policy

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public GitHub issue.

Instead, report it privately via [GitHub Security Advisories](https://github.com/pablodelarco/finetwork-mcp/security/advisories/new) on this repository. You should expect an acknowledgement within a few days.

## Credential handling

This MCP server authenticates to Finetwork using your account email and password via the OAuth2 password grant. Be aware:

- **Your password is sent to Finetwork's servers over HTTPS** at every token refresh. Nothing else stores it.
- **The MCP itself never logs, transmits, or persists your password** beyond the in-memory `loadCredentials()` call. The only token surface is an in-process `cachedToken` that lives for the server's lifetime.
- **`credentials.json` is plaintext.** If you use the file-based credentials path, set restrictive permissions:
  ```bash
  chmod 600 credentials.json
  ```
- **Prefer env vars** (`FINETWORK_EMAIL`, `FINETWORK_PASSWORD`) over the credentials file when running in environments that support secret managers (1Password CLI, macOS Keychain via shell helpers, Docker secrets, etc.).
- **Never commit `credentials.json`** — it's already in `.gitignore`, but double-check before pushing.
- **Tokens are cached in memory only**, expire automatically after 1 hour, and are refreshed on the next call.

## Supply chain

- Pinned, narrow dependency tree: `@modelcontextprotocol/sdk`, `zod`. Both are widely used, audited packages.
- No native modules, no postinstall scripts.
- All HTTP traffic targets `https://mi.finetwork.com` exclusively.

## Scope

This is a **read-only** MCP. It exposes no write tools (no payment changes, no plan changes, no profile edits). A compromised MCP client can read your billing data but cannot mutate your Finetwork account through this server.
