#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ── Config ────────────────────────────────────────────────────────────────

const BASE = "https://mi.finetwork.com/pe";
const HEADERS = {
  "Content-Type": "application/json",
  "fi-content-type": "application/json",
  "fi-version": "7.4.3",
  "fi-engine": "web",
  "fi-platform": "linux",
};

// OAuth2 client credentials extracted from Finetwork's public Flutter Web bundle.
// Overridable via env in case Finetwork rotates them upstream.
const CLIENT_ID = process.env.FINETWORK_CLIENT_ID
  || "345_2fbchgzjjds08s0kw84gwos8sgsck4884sc00cg00o8owk8cwg";
const CLIENT_SECRET = process.env.FINETWORK_CLIENT_SECRET
  || "49bwfqb7d1wk4ocsk0kggck4ogw8c8g4c8ok8k08ccgk4kc40s";

// ── Auth ──────────────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

function log(msg: string) {
  process.stderr.write(`[finetwork-mcp] ${msg}\n`);
}

function loadCredentials(): { email: string; password: string } {
  const envEmail = process.env.FINETWORK_EMAIL;
  const envPassword = process.env.FINETWORK_PASSWORD;
  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword };
  }

  const credsPath = process.env.FINETWORK_CREDS_PATH
    || fileURLToPath(new URL("../credentials.json", import.meta.url));

  let raw: string;
  try {
    raw = readFileSync(credsPath, "utf8");
  } catch (e: any) {
    throw new Error(
      `Could not read Finetwork credentials. Set FINETWORK_EMAIL + FINETWORK_PASSWORD env vars, ` +
      `or create credentials.json (see README) and set FINETWORK_CREDS_PATH. ` +
      `Tried: ${credsPath} (${e.code || e.message})`,
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    throw new Error(`credentials.json at ${credsPath} is not valid JSON: ${e.message}`);
  }

  if (!parsed.email || !parsed.password) {
    throw new Error(`credentials.json at ${credsPath} must contain "email" and "password" fields.`);
  }

  return { email: String(parsed.email), password: String(parsed.password) };
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const creds = loadCredentials();
  log("Authenticating...");

  const res = await fetch(`${BASE}/user/access_token`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      username: creds.email,
      password: creds.password,
      grant_type: "password",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth failed (${res.status}): ${body}`);
  }

  const data: any = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };

  log("Authenticated OK");
  return cachedToken.token;
}

async function api(path: string): Promise<any> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...HEADERS, Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${body}`);
  }
  return res.json();
}

// ── MCP Server ────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "finetwork-mcp",
  version: "1.0.0",
});

server.tool(
  "get_profile",
  "Get Finetwork account profile: name, email, DNI, IBAN, billing address.",
  {},
  async () => {
    try {
      const profile = await api("/api/v1/user/private_profile");
      return {
        content: [{ type: "text" as const, text: JSON.stringify(profile, null, 2) }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "get_invoices",
  "Get Finetwork invoices (billing history). Returns issued date, amount with tax, period, payment status.",
  {
    limit: z.number().optional().default(10).describe("Number of invoices to fetch (default 10)"),
    start: z.number().optional().default(0).describe("Offset for pagination (default 0)"),
  },
  async ({ limit, start }) => {
    try {
      const profile = await api("/api/v1/user/private_profile");
      const clientId = profile.id;
      const billing = await api(`/api/v1/clients/${clientId}/billing/new?start=${start}&length=${limit}`);

      const invoices = (billing.data || []).map((inv: any) => ({
        id: inv.id,
        number: inv.number,
        issuedAt: inv.issuedAt,
        period: `${inv.startAt?.split(" ")[0]} → ${inv.endAt?.split(" ")[0]}`,
        total: inv.total,
        totalWithTax: inv.totalWithTax,
        tax: inv.totalTax,
        taxPercent: inv.tax?.percentage,
        status: inv.status?.name,
        isPaid: inv.isPaid,
        payMode: inv.payMode,
      }));

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            clientId,
            totalRecords: billing.recordsFiltered,
            invoices,
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "get_latest_invoice",
  "Get only the most recent Finetwork invoice. Shortcut for billing checks.",
  {},
  async () => {
    try {
      const profile = await api("/api/v1/user/private_profile");
      const clientId = profile.id;
      const billing = await api(`/api/v1/clients/${clientId}/billing/new?start=0&length=1`);
      const inv = billing.data?.[0];

      if (!inv) {
        return { content: [{ type: "text" as const, text: "No invoices found" }] };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            number: inv.number,
            issuedAt: inv.issuedAt,
            period: `${inv.startAt?.split(" ")[0]} → ${inv.endAt?.split(" ")[0]}`,
            total: inv.total,
            totalWithTax: inv.totalWithTax,
            status: inv.status?.name,
            payMode: inv.payMode,
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "get_services",
  "Get Finetwork services on the account (phone lines, data plans, etc.).",
  {},
  async () => {
    try {
      const services = await api(`/api/v1/services/summary/pagination?start=0&limit=50`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(services, null, 2) }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "get_yearly_summary",
  "Get yearly billing summary for the account. Useful for annual expense tracking.",
  {},
  async () => {
    try {
      const profile = await api("/api/v1/user/private_profile");
      const clientId = profile.id;
      const summary = await api(`/api/v1/billing/yearly/summary?clientId=${clientId}`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "get_debt_summary",
  "Check if there is any outstanding debt on the account.",
  {},
  async () => {
    try {
      const profile = await api("/api/v1/user/private_profile");
      const clientId = profile.id;
      const debt = await api(`/api/v1/billing/debt/${clientId}/summary`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(debt, null, 2) }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ── Start ─────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
