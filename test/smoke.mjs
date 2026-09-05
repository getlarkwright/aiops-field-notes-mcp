// Spawns the server over stdio and exercises every tool the way a client would.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const BEFORE = `firewall {
    name WAN_IN {
        default-action drop
        rule 10 {
            action accept
            protocol tcp
            destination { port 443 }
        }
    }
}
service {
    ssh { port 22 }
}
system {
    host-name edgerouter
    ntp { server pool.ntp.org }
    login { user admin { authentication { encrypted-password $6$abc } } }
}`;

const AFTER = BEFORE.replace("destination { port 443 }", "destination { port 443 }\n        }\n        rule 15 {\n            action accept\n            protocol tcp\n            source { address 0.0.0.0/0 }\n            destination { port 22 }");

const MESSY_CONFIG = JSON.stringify({
  mcpServers: {
    files: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/"] },
    notes: { command: "npx", args: ["-y", "some-random-notes-mcp"], env: { NOTES_API_KEY: "sk-live-9f8a7b6c5d4e3f2a1b0c9d8e" } },
    metrics: { url: "http://metrics.internal.example/mcp" },
    db: { command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres@0.6.2", "postgresql://admin:hunter2@db.example/prod"] },
    hack: { command: "bash", args: ["-c", "./start-server.sh"] },
    clean: { command: "npx", args: ["@modelcontextprotocol/server-git@2026.1.0", "--repository", "/srv/project"] },
  },
}, null, 2);

const CASES = [
  ["estimate_llm_cost", { input_tokens: 2000, output_tokens: 600, requests_per_month: 100000 }, ["GPT-5.6 Luna", "/mo", "AIOps Field Notes"]],
  ["estimate_llm_cost", { input_tokens: 1000, output_tokens: 500, requests_per_month: 1000, filter: "claude" }, ["Claude", "Cheapest"]],
  ["check_vram_fit", { params_b: 70, quant_bits: 4, context_tokens: 32768 }, ["Total needed", "RTX 4090", "Smallest card"]],
  ["check_vram_fit", { params_b: 405, quant_bits: 16, context_tokens: 8192 }, ["Nothing in the list fits"]],
  ["audit_mcp_config", { config: MESSY_CONFIG }, ["6 servers reviewed", "not pinned", "plaintext", "whole home directory", "plain HTTP", "shell", "Credentials sit in the command line"]],
  ["audit_mcp_config", { config: "not json" }, ["not valid JSON"]],
  ["lookup_mcp_server", { query: "browser" }, ["Playwright"]],
  ["lookup_mcp_server", { query: "zzzznope" }, ["not a verdict"]],
  ["explain_config_diff", { before: BEFORE, after: AFTER, device: "edgerouter" }, ["edgerouter", "high", "rule 15", "firewall"]],
  ["check_config_compliance", { config: "ip telnet server enable\nsnmp-server community public RO\n" }, ["FAIL", "Telnet", "SNMP"]],
  ["check_config_compliance", { config: BEFORE }, ["pass", "checks pass"]],
  ["latest_field_note", { count: 2 }, ["AIOps"]],
];

const client = new Client({ name: "smoke-test", version: "0.0.0" }, { capabilities: {} });
await client.connect(new StdioClientTransport({ command: "node", args: [new URL("../src/index.js", import.meta.url).pathname] }));

const { tools } = await client.listTools();
console.log(`tools advertised: ${tools.length} — ${tools.map((t) => t.name).join(", ")}\n`);

let failed = 0;
for (const [name, args, expect] of CASES) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content || []).map((c) => c.text || "").join("\n");
  const missing = expect.filter((e) => !text.toLowerCase().includes(e.toLowerCase()));
  const label = `${name}(${Object.keys(args).join(",")})`;
  if (missing.length) {
    failed++;
    console.log(`FAIL ${label}\n  missing: ${missing.join(" | ")}\n  got:\n${text.split("\n").map((l) => "    " + l).join("\n")}\n`);
  } else {
    console.log(`pass ${label}`);
  }
}

await client.close();
console.log(failed ? `\n${failed} case(s) failed` : "\nall cases passed");
process.exit(failed ? 1 : 0);
