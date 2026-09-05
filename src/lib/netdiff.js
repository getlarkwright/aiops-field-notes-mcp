// Network config drift: what changed between two snapshots, why it matters, and
// how bad it would be if nobody meant it. Deterministic — same rules the
// DriftWatch pipeline runs nightly, so two people reviewing get the same answer.
import { diffArrays } from "diff";

// Lines that change on their own and mean nothing. Dropped before diffing so the
// output is real drift, not timestamps. Deliberately conservative: nothing here
// touches firewall, interface or routing config.
const VOLATILE = [
  /vyatta-config-version/, /Release version/, /Last configuration change/, /^! Last config/i,
  /ntp clock-period/, /^#\s*\w+ \d+ \d{2}:\d{2}:\d{2}/, /uptime/i, /\b\d+ packets, \d+ bytes\b/,
  // OPNsense config.xml save bookkeeping. On a real fleet these three produced
  // two thirds of one firewall's drift events, and most were rated high risk —
  // alarming noise that buries the change you actually care about.
  /^\s*<time>\d{9,}(?:\.\d+)?<\/time>\s*$/,
  /^\s*<description>\/api\/[^<]*made changes<\/description>\s*$/,
];

// Volatile values inside a line that is otherwise real config: dropping the line
// would look like the element was deleted, so mask the value and diff the rest.
const VOLATILE_VALUES = [
  [/(persisted_at=")[^"]*(")/g, "$1*$2"],
];

const VENDOR_HINTS = [
  [/^\s*set (interfaces|firewall|protocols|service|system) /m, "edgeos"],
  [/^(firewall|interfaces|protocols|service|system)\s*\{/m, "edgeos"],
  [/^\/(interface|ip|system|routing) /m, "mikrotik"],
  [/<opnsense>|<pfsense>/, "opnsense"],
  [/^(interface|router bgp|ip route|line vty)\b/m, "cisco-ios"],
  [/^\s*(vlan database|network parms)/m, "edgeswitch"],
];

export function detectVendor(text) {
  for (const [re, v] of VENDOR_HINTS) if (re.test(text)) return v;
  return "unknown";
}

const sanitize = (text) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => !VOLATILE.some((p) => p.test(l)))
    .map((l) => VOLATILE_VALUES.reduce((acc, [pat, repl]) => acc.replace(pat, repl), l));

// Enclosing block for a changed line, for brace formats like EdgeOS config.boot.
function sectionPath(lines, idx) {
  let depth = 0;
  const path = [];
  for (let i = Math.min(idx, lines.length - 1); i >= 0 && path.length < 3; i--) {
    const ln = lines[i] ?? "";
    depth += (ln.split("}").length - 1) - (ln.split("{").length - 1);
    if (ln.trim().endsWith("{") && depth < 0) { path.push(ln.trim().slice(0, -1).trim()); depth = 0; }
  }
  if (path.length) return path.reverse().join(" > ");
  for (let i = Math.min(idx, lines.length - 1); i >= 0; i--) {
    const s = (lines[i] ?? "").trim();
    if (s.startsWith("/") || s.startsWith("interface ") || (s.startsWith("!") && s.length > 1)) return s;
  }
  return "(top level)";
}

export function structuredDiff(before, after) {
  const oldLines = sanitize(before), newLines = sanitize(after);
  const parts = diffArrays(oldLines, newLines);
  const hunks = [];
  let oi = 0, ni = 0, pending = null;

  const flush = () => {
    if (pending && (pending.added.length || pending.removed.length)) hunks.push(pending);
    pending = null;
  };

  for (const part of parts) {
    if (!part.added && !part.removed) { flush(); oi += part.count; ni += part.count; continue; }
    if (!pending) pending = { op: "change", section: "", added: [], removed: [], at_old: oi, at_new: ni };
    if (part.added) { pending.added.push(...part.value.filter((l) => l.trim())); ni += part.count; }
    else { pending.removed.push(...part.value.filter((l) => l.trim())); oi += part.count; }
  }
  flush();

  return hunks.map((h) => ({
    ...h,
    op: h.added.length && h.removed.length ? "changed" : h.added.length ? "added" : "removed",
    section: h.added.length ? sectionPath(newLines, h.at_new) : sectionPath(oldLines, h.at_old),
  }));
}

const CATEGORIES = [
  ["security", "high", /\b(firewall|rule|acl|access-list|deny|permit|nat|policy|zone)\b/i,
   "Firewall, ACL and NAT changes alter what traffic is allowed — confirm this was intended and did not quietly open or close access."],
  ["access/mgmt", "high", /\b(snmp|aaa|tacacs|radius|user|password|secret|ssh|telnet|login|community)\b/i,
   "Authentication and management changes decide who can reach the device — the blast radius is the device itself."],
  ["routing", "high", /\b(route|bgp|ospf|protocols|next-hop|prefix|neighbor|redistribute)\b/i,
   "Routing changes can black-hole or reroute traffic well beyond this device."],
  ["connectivity", "medium", /\b(interface|address|vlan|bridge|ethernet|wireguard|peer|vif)\b/i,
   "Interface and addressing changes drop links or move subnets."],
  ["services", "medium", /\b(dns|dhcp|forwarding|service|listen)\b/i,
   "Service changes propagate to every client that depends on them."],
  ["mgmt/time", "low", /\b(ntp|clock|timezone|log|syslog|hostname|description|banner)\b/i,
   "Operational change, low risk."],
];

export function explainHunk(hunk) {
  const blob = [...hunk.added, ...hunk.removed].join(" ");
  const hit = CATEGORIES.find(([, , re]) => re.test(blob));
  const [category, risk, , why] = hit || ["cosmetic", "low", null, "No functional impact."];
  const n = hunk.added.length + hunk.removed.length;
  return {
    ...hunk, category, risk,
    summary: `${n} line${n === 1 ? "" : "s"} ${hunk.op} under "${hunk.section}" (${category}).`,
    why,
  };
}

export function renderDiff(hunks, { device, vendor }) {
  if (!hunks.length) {
    return `No drift: the two snapshots are identical once volatile lines (timestamps, counters, uptime) are removed.`;
  }
  const explained = hunks.map(explainHunk);
  const rank = { high: 0, medium: 1, low: 2 };
  explained.sort((a, b) => rank[a.risk] - rank[b.risk]);

  const counts = explained.reduce((a, h) => ((a[h.risk] = (a[h.risk] || 0) + 1), a), {});
  const head = `${explained.length} change${explained.length === 1 ? "" : "s"} on ${device || "this device"} (${vendor}) — ` +
    `${counts.high || 0} high, ${counts.medium || 0} medium, ${counts.low || 0} low risk.`;

  const body = explained.map((h) => {
    const shown = [...h.removed.slice(0, 6).map((l) => "    - " + l.trim()), ...h.added.slice(0, 6).map((l) => "    + " + l.trim())];
    const more = h.added.length + h.removed.length - shown.length;
    return [`  [${h.risk}] ${h.summary}`, `    ${h.why}`, ...shown, more > 0 ? `    ... ${more} more line${more === 1 ? "" : "s"}` : ""]
      .filter(Boolean).join("\n");
  }).join("\n\n");

  const tail = "\nTo revert, restore the affected block from the previous snapshot rather than retyping it, and\n" +
    "check the change record before assuming any of this was deliberate.";

  return [head, "", body, tail].join("\n");
}

// --- CIS/PCI starter pack: deterministic, so an auditor gets the same result twice.
const CHECKS = [
  { id: "telnet-off", fw: "CIS", ref: "CIS NDM 1.1.1", sev: "high", kind: "absent_pass", title: "Telnet management not enabled",
    pat: /service\s+telnet|\/ip service[^\n]*\btelnet\b(?![^\n]*disabled)|ip telnet server enable/i },
  { id: "ssh-on", fw: "CIS", ref: "CIS NDM 1.1.2", sev: "medium", kind: "present_pass", title: "SSH management enabled",
    pat: /service\s*\{[^}]*\bssh\b|\/ip service[^\n]*\bssh\b|\bssh\s*\{|ip ssh/i },
  { id: "snmp-default", fw: "PCI", ref: "PCI-DSS 2.1", sev: "high", kind: "absent_pass", title: "No default SNMP community",
    pat: /community\s*['"]?(public|private)\b/i },
  { id: "logging", fw: "CIS", ref: "CIS NDM 8.1", sev: "medium", kind: "present_pass", title: "Remote logging configured",
    pat: /syslog|logging\s+host|\/system logging[^\n]*remote|remote-host|set system syslog/i },
  { id: "ntp", fw: "CIS", ref: "CIS NDM 8.5", sev: "low", kind: "present_pass", title: "Time sync configured",
    pat: /\bntp\b|sntp|time-server|\/system ntp/i },
  { id: "banner", fw: "CIS", ref: "CIS NDM 1.2", sev: "low", kind: "present_pass", title: "Login banner present",
    pat: /banner|motd|login-banner|pre-login/i },
  { id: "pw-hash", fw: "PCI", ref: "PCI-DSS 8.3.1", sev: "high", kind: "present_pass", title: "Credentials stored hashed",
    pat: /encrypted-password|password-encryption|\$1\$|\$5\$|\$6\$|secret 5|argon2|bcrypt/i },
  { id: "mgmt-fw", fw: "CIS", ref: "CIS NDM 3.1", sev: "medium", kind: "present_pass", title: "Firewall or access-list present",
    pat: /firewall|access-list|\/ip firewall|filter rule|zone-policy/i },
  { id: "timeout", fw: "CIS", ref: "CIS NDM 1.3", sev: "low", kind: "present_pass", title: "Idle timeout set",
    pat: /idle-timeout|exec-timeout|session-timeout|\/system.*keepalive/i },
];

export function compliance(text) {
  return CHECKS.map((c) => {
    const found = c.pat.test(text);
    const status = c.kind === "present_pass" ? (found ? "pass" : "fail") : (found ? "fail" : "pass");
    return { id: c.id, framework: c.fw, ref: c.ref, title: c.title, severity: c.sev, status };
  });
}

export function renderCompliance(rows, vendor) {
  const failed = rows.filter((r) => r.status === "fail");
  const w = Math.max(...rows.map((r) => r.title.length));
  const body = rows.map((r) => `  ${r.status === "pass" ? "pass" : "FAIL"}  ${r.title.padEnd(w)}  ${r.ref} (${r.severity})`).join("\n");
  const head = `${rows.length - failed.length}/${rows.length} checks pass on this ${vendor} config.`;
  const tail = failed.length
    ? `\nStart with the high-severity failures: ${failed.filter((f) => f.severity === "high").map((f) => f.title).join("; ") || "none"}.\n` +
      "These are regex checks over one config file — good for catching the obvious, not a substitute for a full CIS benchmark run."
    : "\nEvery check passed. These are regex checks over one config file, so treat it as a floor, not a certification.";
  return [head, "", body, tail].join("\n");
}
