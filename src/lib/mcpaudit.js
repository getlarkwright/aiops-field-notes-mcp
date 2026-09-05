// Reads an MCP client config the way an ops reviewer would: every server entry is
// an access grant, so the questions are what it can reach, who publishes it, and
// what happens the next time it auto-updates.
import SERVERS from "../data/servers.js";

// Publishers the directory tracks as vendor or reference servers. Anything else
// is not "bad" — it just hasn't been vouched for by anyone here.
const KNOWN_PUBLISHERS = [
  "@modelcontextprotocol/", "@playwright/", "@microsoft/", "@github/", "@sentry/",
  "@upstash/", "@elevenlabs/", "@jetbrains/", "@brave/", "@oracle/", "@anthropic-ai/",
  "mcp-server-git", "mcp-server-fetch", "mcp-server-time", "mcp-server-sqlite",
];

const SECRET_VALUE = [
  /^sk-[A-Za-z0-9_-]{16,}/, /^ghp_[A-Za-z0-9]{20,}/, /^gho_[A-Za-z0-9]{20,}/,
  /^xox[baprs]-[A-Za-z0-9-]{10,}/, /^AKIA[0-9A-Z]{12,}/, /^AIza[0-9A-Za-z_-]{20,}/,
  /^[A-Fa-f0-9]{32,}$/, /^ey[A-Za-z0-9_-]{20,}\./,
];
const SECRET_NAME = /(token|secret|password|passwd|api[_-]?key|credential|private[_-]?key)/i;
const PLACEHOLDER = /^\s*(\$\{[^}]+\}|\$[A-Z_][A-Z0-9_]*|<[^>]+>|your[_-]|xxx|changeme|\.\.\.)/i;

const HOME_ROOTS = [/^~\/?$/, /^\$HOME\/?$/, /^\/$/, /^\/(Users|home)\/[^/]+\/?$/, /^[A-Za-z]:\\?$/];
const RUNNERS = /^(npx|bunx|pnpm|yarn|uvx|pipx|deno)$/;
const SHELLS = /^(bash|sh|zsh|dash|cmd|cmd\.exe|powershell|pwsh)$/;

const F = (severity, id, title, detail, fix) => ({ severity, id, title, detail, fix });

function packageFromArgs(command, args) {
  if (!RUNNERS.test(command)) return null;
  for (const a of args) {
    if (typeof a !== "string" || a.startsWith("-")) continue;
    if (["dlx", "exec", "run"].includes(a)) continue;
    return a;
  }
  return null;
}

function auditServer(name, spec) {
  const findings = [];
  const command = typeof spec.command === "string" ? spec.command.split(/[\\/]/).pop() : "";
  const args = Array.isArray(spec.args) ? spec.args.filter((a) => typeof a === "string") : [];
  const env = spec.env && typeof spec.env === "object" ? spec.env : {};
  const url = spec.url || spec.serverUrl || "";

  // --- what it runs -------------------------------------------------------
  const pkg = packageFromArgs(command, args);
  if (pkg) {
    const pinned = /@[\w.-]+$/.test(pkg.replace(/^@[^/]+\//, "x/")) || /[=@]=?\d/.test(pkg);
    if (!pinned) {
      findings.push(F("high", "unpinned-package", "Package version is not pinned",
        `${name} runs "${pkg}" at whatever version is published when it launches.`,
        `Pin it — "${pkg}@<version>" for npm, "${pkg}==<version>" for uvx — and bump deliberately.`));
    }
    if (args.some((a) => a === "-y" || a === "--yes")) {
      findings.push(F("medium", "auto-install", "Installs without prompting",
        `${name} passes ${args.includes("-y") ? "-y" : "--yes"}, so a new release installs and runs with no confirmation.`,
        "Keep the flag only alongside a pinned version, so what installs is what you reviewed."));
    }
    if (!KNOWN_PUBLISHERS.some((p) => pkg.startsWith(p))) {
      findings.push(F("medium", "unverified-publisher", "Publisher not in the tracked set",
        `"${pkg}" is not one of the reference or vendor servers this directory tracks.`,
        "Read the source and check the publisher before wiring it into an agent that touches production."));
    }
  }
  if (SHELLS.test(command)) {
    findings.push(F("high", "shell-entrypoint", "Server is a shell command",
      `${name} launches ${command}, so the config itself is an arbitrary-command surface.`,
      "Run the server binary directly instead of wrapping it in a shell."));
  }
  if (command === "docker") {
    if (args.includes("--privileged")) {
      findings.push(F("high", "docker-privileged", "Container runs privileged",
        `${name} starts a privileged container — that is host-level access.`, "Drop --privileged and grant only the capabilities the server needs."));
    }
    if (args.some((a) => /^--net(work)?=host$/.test(a))) {
      findings.push(F("medium", "docker-host-network", "Container shares the host network",
        `${name} runs with host networking, so it reaches everything the host can.`, "Use a bridge network and publish only the ports required."));
    }
    if (args.some((a) => /^-v$/.test(a)) && args.some((a) => /^\/:/.test(a))) {
      findings.push(F("high", "docker-root-mount", "Host root is mounted into the container",
        `${name} mounts / into the container.`, "Mount only the project directory the server needs."));
    }
    const image = args.find((a) => !a.startsWith("-") && a.includes("/")) || "";
    if (image && (!image.includes(":") || image.endsWith(":latest"))) {
      findings.push(F("medium", "unpinned-image", "Container image is not pinned",
        `${name} runs "${image || "an untagged image"}" — :latest moves under you.`, "Pin the image to a digest or a released tag."));
    }
  }

  // --- what it can reach --------------------------------------------------
  const fsish = /file|filesystem|fs/i.test(name) || (pkg || "").includes("filesystem");
  for (const a of args) {
    if (HOME_ROOTS.some((r) => r.test(a))) {
      findings.push(F("high", "broad-filesystem-root", "Filesystem root is wide open",
        `${name} is granted "${a}" — that is the whole home directory or the whole disk, including keys and browser profiles.`,
        "Scope the server to the project directories the agent actually works in."));
      break;
    }
  }
  if (fsish && !args.length) {
    findings.push(F("medium", "no-root-scope", "No directory scope given",
      `${name} looks like a filesystem server but no allowed root is listed; many default to the working directory or wider.`,
      "Pass explicit allowed directories."));
  }
  for (const a of args) {
    if (/[a-z+]+:\/\/[^/\s:]+:[^@\s]+@/i.test(a)) {
      findings.push(F("high", "credentials-in-args", "Credentials sit in the command line",
        `${name} carries a connection string with an embedded password — command lines land in process lists, shell history and logs.`,
        "Move the credential to an environment variable or a secret manager reference."));
      break;
    }
  }
  if (/postgres|mysql|mongo|sqlite|mssql|oracle/i.test(name + " " + (pkg || "")) &&
      !args.some((a) => /read.?only/i.test(a)) && !Object.keys(env).some((k) => /read.?only/i.test(k))) {
    findings.push(F("medium", "database-write-access", "Database access is not read-only",
      `${name} connects to a database with no read-only flag in sight — an agent mistake can write or drop.`,
      "Connect with a read-only role, and add a separate write server only if you truly need one."));
  }

  // --- how it authenticates ----------------------------------------------
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== "string" || !v || PLACEHOLDER.test(v)) continue;
    if (SECRET_VALUE.some((r) => r.test(v)) || (SECRET_NAME.test(k) && v.length > 8)) {
      findings.push(F("high", "plaintext-secret", "Secret is stored in the config file",
        `${name} has ${k} written out in plaintext; config files get committed, synced and screenshared.`,
        `Reference the environment instead — "${k}": "\${${k}}" — and keep the value in your secret store.`));
    }
  }
  if (url) {
    if (/^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(url)) {
      findings.push(F("high", "plaintext-transport", "Remote server is reached over plain HTTP",
        `${name} talks to ${url} unencrypted — anything in those calls, tokens included, is readable in transit.`,
        "Use https, or run the server locally."));
    } else if (/^https:\/\//i.test(url)) {
      findings.push(F("low", "third-party-remote", "Remote server run by someone else",
        `${name} is hosted at ${url}; whoever operates it sees every call the agent makes to it.`,
        "Confirm who runs it and what they log before sending it work data."));
    }
    if (!spec.headers && !Object.keys(env).length) {
      findings.push(F("medium", "no-auth-configured", "No authentication configured",
        `${name} is remote but no auth header or token is set — if the endpoint accepts that, so does everyone else who finds it.`,
        "Put the server behind OAuth or a token, and confirm it rejects unauthenticated calls."));
    }
  }

  return { name, findings, disabled: spec.disabled === true };
}

export function auditConfig(text) {
  let cfg;
  try { cfg = JSON.parse(text); }
  catch (e) { return { error: `That is not valid JSON (${e.message}). Paste the contents of the MCP config file.` }; }

  const map = cfg.mcpServers || cfg.servers || cfg;
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return { error: 'No server map found. Expected {"mcpServers": {...}} or {"servers": {...}}.' };
  }

  const results = Object.entries(map)
    .filter(([, v]) => v && typeof v === "object")
    .map(([name, spec]) => auditServer(name, spec));

  if (!results.length) return { error: "No server entries found in that config." };
  return { results };
}

const ORDER = { high: 0, medium: 1, low: 2 };

export function renderAudit({ results, error }) {
  if (error) return error;

  const all = results.flatMap((r) => r.findings);
  const counts = { high: 0, medium: 0, low: 0 };
  all.forEach((f) => counts[f.severity]++);

  const head = `${results.length} server${results.length === 1 ? "" : "s"} reviewed — ` +
    `${counts.high} high, ${counts.medium} medium, ${counts.low} low.`;

  const blocks = results.map((r) => {
    if (!r.findings.length) return `${r.name}${r.disabled ? " (disabled)" : ""}\n  nothing to flag.`;
    const lines = r.findings
      .sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
      .map((f) => `  [${f.severity}] ${f.title}\n    ${f.detail}\n    fix: ${f.fix}`)
      .join("\n");
    return `${r.name}${r.disabled ? " (disabled)" : ""}\n${lines}`;
  });

  const tail = all.length
    ? "\nAn MCP server is an access grant, not a plugin: scope filesystem roots, database credentials and API\ntokens to exactly what the agent needs, and re-read this config whenever you add one."
    : "\nNothing flagged. Re-run this whenever you add a server — the risk arrives with the next entry.";

  return [head, "", blocks.join("\n\n"), tail].join("\n");
}

export function lookup(query) {
  const q = (query || "").trim().toLowerCase();
  const rows = q
    ? SERVERS.filter((s) => `${s.name} ${s.maintainer} ${s.connects} ${s.what} ${s.tier}`.toLowerCase().includes(q))
    : SERVERS;
  return rows;
}

export function renderLookup(query, rows) {
  if (!rows.length) {
    return `Nothing in the directory matches "${query}".\n\n` +
      "That is not a verdict — the directory tracks reference and vendor servers, not everything published.\n" +
      "Before installing an unlisted server: read its source, check who publishes it, pin the version, scope\n" +
      "what it can reach, and run audit_mcp_config on the entry you are about to add.";
  }
  const w = Math.max(...rows.map((r) => r.name.length));
  const body = rows.map((r) => `  ${r.name.padEnd(w)}  ${r.tier.padEnd(9)} ${r.connects.padEnd(9)} ${r.maintainer}\n${" ".repeat(w + 4)}${r.what}`).join("\n");
  return `${rows.length} of ${SERVERS.length} tracked servers${query ? ` matching "${query}"` : ""}:\n\n${body}`;
}
