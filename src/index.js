#!/usr/bin/env node
// AIOps Field Notes MCP server.
// Everything here runs locally on plain arithmetic and rules — no account, no
// telemetry, and no filesystem access. The one exception is latest_field_note,
// which fetches a public RSS feed.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { estimate, renderEstimate } from "./lib/cost.js";
import { fit, renderFit } from "./lib/vram.js";
import { auditConfig, renderAudit, lookup, renderLookup } from "./lib/mcpaudit.js";
import { structuredDiff, renderDiff, detectVendor, compliance, renderCompliance } from "./lib/netdiff.js";

const num = (v, fallback) => (typeof v === "number" && isFinite(v) ? v : fallback);
const str = (v, fallback = "") => (typeof v === "string" ? v : fallback);

const TOOLS = [
  {
    name: "estimate_llm_cost",
    description:
      "Price a workload across current frontier and open-weights models. Give tokens per request and monthly " +
      "request volume; returns cost per request and per month for every model, cheapest first, with the caveats " +
      "that move the number (batch discounts, prompt caching, intro pricing that expires).",
    inputSchema: {
      type: "object",
      properties: {
        input_tokens: { type: "number", description: "Input tokens per request (a typical chat turn is 1000-3000 with context)." },
        output_tokens: { type: "number", description: "Output tokens per request (typically 200-800)." },
        requests_per_month: { type: "number", description: "Requests per month." },
        filter: { type: "string", description: "Optional substring to limit the table, e.g. 'claude' or 'gemini'." },
      },
      required: ["input_tokens", "output_tokens", "requests_per_month"],
    },
    run: (a) => {
      const args = {
        input_tokens: num(a.input_tokens, 0), output_tokens: num(a.output_tokens, 0),
        requests_per_month: num(a.requests_per_month, 0), filter: str(a.filter),
      };
      return renderEstimate(args, estimate(args));
    },
  },
  {
    name: "check_vram_fit",
    description:
      "Work out whether an open-weights model fits on a given GPU. Takes parameter count in billions, quantisation " +
      "bit width and context length; returns weights + KV cache + overhead in GB and which common cards (and Macs) " +
      "have room.",
    inputSchema: {
      type: "object",
      properties: {
        params_b: { type: "number", description: "Parameter count in billions, e.g. 70 for a 70B model." },
        quant_bits: { type: "number", description: "Bits per weight: 16 (fp16), 8 (int8/fp8), 5, 4 (Q4) are typical." },
        context_tokens: { type: "number", description: "Context window you intend to use, in tokens." },
      },
      required: ["params_b"],
    },
    run: (a) => {
      const args = {
        params_b: num(a.params_b, 0), quant_bits: num(a.quant_bits, 4),
        context_tokens: num(a.context_tokens, 8192),
      };
      if (args.params_b <= 0) return "params_b must be a positive number of billions of parameters.";
      return renderFit(args, fit(args));
    },
  },
  {
    name: "audit_mcp_config",
    description:
      "Review an MCP client config before you trust it. Paste the JSON from .mcp.json, claude_desktop_config.json " +
      "or any equivalent and it flags unpinned packages that auto-update, secrets written in plaintext, filesystem " +
      "roots scoped to the whole home directory, shell entrypoints, privileged containers, credentials on the " +
      "command line, unauthenticated or plain-HTTP remote servers, and database access that is not read-only — " +
      "each with the fix. Nothing is read from disk; pass the text.",
    inputSchema: {
      type: "object",
      properties: { config: { type: "string", description: "Contents of the MCP config file, as JSON text." } },
      required: ["config"],
    },
    run: (a) => renderAudit(auditConfig(str(a.config, ""))),
  },
  {
    name: "lookup_mcp_server",
    description:
      "Look up an MCP server in the curated AIOps Field Notes directory: what it connects to, who maintains it, " +
      "and whether it is a reference, vendor or community server. Search by name, capability or category. An " +
      "unlisted server is not condemned — the answer says how to vet it yourself.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Name, capability or category, e.g. 'postgres', 'browser', 'vendor'." } },
    },
    run: (a) => {
      const q = str(a.query);
      return renderLookup(q, lookup(q));
    },
  },
  {
    name: "explain_config_diff",
    description:
      "Explain what changed between two network device config snapshots, in plain English. Works on EdgeOS, " +
      "MikroTik RouterOS, OPNsense, Cisco IOS-style and EdgeSwitch configs: strips volatile lines, groups changes " +
      "by config section, and tags each with a risk level and why it matters (security, routing, access, " +
      "connectivity). Deterministic — no model call, nothing leaves the machine.",
    inputSchema: {
      type: "object",
      properties: {
        before: { type: "string", description: "The earlier config snapshot." },
        after: { type: "string", description: "The later config snapshot." },
        device: { type: "string", description: "Optional device name, for the summary line." },
        vendor: { type: "string", description: "Optional vendor hint; detected from the config when omitted." },
      },
      required: ["before", "after"],
    },
    run: (a) => {
      const before = str(a.before), after = str(a.after);
      if (!before.trim() || !after.trim()) return "Both before and after snapshots are needed.";
      const vendor = str(a.vendor) || detectVendor(after);
      return renderDiff(structuredDiff(before, after), { device: str(a.device), vendor });
    },
  },
  {
    name: "check_config_compliance",
    description:
      "Run a CIS/PCI starter pack over one network device config: telnet disabled, SSH enabled, no default SNMP " +
      "community, remote logging, time sync, login banner, hashed credentials, a firewall or ACL, and idle " +
      "timeout. Deterministic regex checks with framework references, so two reviewers get the same result.",
    inputSchema: {
      type: "object",
      properties: {
        config: { type: "string", description: "The device config text." },
        vendor: { type: "string", description: "Optional vendor hint; detected from the config when omitted." },
      },
      required: ["config"],
    },
    run: (a) => {
      const config = str(a.config, "");
      if (!config.trim()) return "Paste the device config to check.";
      const vendor = str(a.vendor) || detectVendor(config);
      return renderCompliance(compliance(config), vendor);
    },
  },
  {
    name: "latest_field_note",
    description:
      "The most recent This Week in AIOps episodes — what shipped in models, agents and MCP, and what it means " +
      "for the systems you run. The only tool here that touches the network; it reads a public RSS feed.",
    inputSchema: {
      type: "object",
      properties: { count: { type: "number", description: "How many recent episodes to return (default 3)." } },
    },
    run: async (a) => {
      const count = Math.max(1, Math.min(10, num(a.count, 3)));
      try {
        const res = await fetch("https://aiopsfieldnotes.com/podcast/feed.xml", {
          headers: { "user-agent": "aiops-field-notes-mcp" },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`feed returned ${res.status}`);
        const xml = await res.text();
        const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, count).map((m) => {
          const unescape = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#8217;/g, "\u2019").replace(/&nbsp;/g, " ");
          const get = (tag) => {
            const t = m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
            return t ? unescape(t[1].replace(/<!\[CDATA\[|\]\]>/g, "")).trim() : "";
          };
          return { title: get("title"), date: get("pubDate").replace(/\s\d{2}:\d{2}:\d{2}.*$/, ""), summary: get("description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300) };
        });
        if (!items.length) return "No episodes found in the feed right now.";
        const body = items.map((i) => `${i.date} — ${i.title}\n  ${i.summary}`).join("\n\n");
        return `Latest from This Week in AIOps:\n\n${body}`;
      } catch (e) {
        return `Could not reach the feed (${e.message}).`;
      }
    },
  },
];

const server = new Server(
  { name: "aiops-field-notes", version: "0.1.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) return { content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }], isError: true };
  try {
    const text = await tool.run(req.params.arguments || {});
    return { content: [{ type: "text", text }] };
  } catch (e) {
    return { content: [{ type: "text", text: `${tool.name} failed: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
