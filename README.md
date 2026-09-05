# AIOps Field Notes MCP server

Four things I kept doing by hand while running AI in production, turned into tools an agent can call:
price a model before committing a budget, size a GPU before ordering one, review an MCP config before
trusting it, and explain what changed in a network device config.

Free, MIT, no account, no telemetry.

## Install

Pin the version — see `audit_mcp_config` for why.

**Claude Code**

```
claude mcp add aiops-field-notes -- npx -y github:labaccessnow/aiops-field-notes-mcp#v0.1.1
```

**Claude Desktop, Cursor, or any client with a JSON config**

```json
{
  "mcpServers": {
    "aiops-field-notes": {
      "command": "npx",
      "args": ["-y", "github:labaccessnow/aiops-field-notes-mcp#v0.1.1"]
    }
  }
}
```

**Docker**

```json
{
  "mcpServers": {
    "aiops-field-notes": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/labaccessnow/aiops-field-notes-mcp:0.1.1"]
    }
  }
}
```

Node 18 or newer for the npx route; nothing else to configure either way. The server is also in the
official MCP registry as `io.github.labaccessnow/aiops-field-notes-mcp`.

## Tools

| Tool | What it answers |
|---|---|
| `estimate_llm_cost` | What does this workload cost per month on each model, cheapest first? |
| `check_vram_fit` | Does a 70B model at Q4 fit on my 4090 with a 32K context? |
| `audit_mcp_config` | Is this MCP config safe to trust — what can each server actually reach? |
| `lookup_mcp_server` | What is this server, who maintains it, and is it reference, vendor or community? |
| `explain_config_diff` | What changed on this router between two snapshots, and how bad is it? |
| `check_config_compliance` | Does this device config pass the CIS/PCI basics? |
| `latest_field_note` | What happened in AI ops this week? |

### audit_mcp_config

The one I use most. Paste a client config and it reads it the way a reviewer would — every server entry
is an access grant, so the questions are what it can reach, who publishes it, and what happens the next
time it auto-updates:

```
6 servers reviewed — 7 high, 6 medium, 0 low.

files
  [high] Package version is not pinned
    files runs "@modelcontextprotocol/server-filesystem" at whatever version is published when it launches.
    fix: Pin it — "@modelcontextprotocol/server-filesystem@<version>" for npm, "@modelcontextprotocol/server-filesystem==<version>" for uvx — and bump deliberately.
  [high] Filesystem root is wide open
    files is granted "/" — that is the whole home directory or the whole disk, including keys and browser profiles.
    fix: Scope the server to the project directories the agent actually works in.
  [medium] Installs without prompting
    files passes -y, so a new release installs and runs with no confirmation.
    fix: Keep the flag only alongside a pinned version, so what installs is what you reviewed.

notes
  [high] Package version is not pinned
    notes runs "some-random-notes-mcp" at whatever version is published when it launches.
    fix: Pin it — "some-random-notes-mcp@<version>" for npm, "some-random-notes-mcp==<version>" for uvx — and bump deliberately.
  [high] Secret is stored in the config file
    notes has NOTES_API_KEY written out in plaintext; config files get committed, synced and screenshared.
    fix: Reference the environment instead — "NOTES_API_KEY": "${NOTES_API_KEY}" — and keep the value in your secret store.
  [medium] Installs without prompting
    notes passes -y, so a new release installs and runs with no confirmation.
    fix: Keep the flag only alongside a pinned version, so what installs is what you reviewed.
  [medium] Publisher not in the tracked set
    "some-random-notes-mcp" is not one of the reference or vendor servers this directory tracks.
    fix: Read the source and check the publisher before wiring it into an agent that touches production.
```

It also flags shell entrypoints, privileged containers, host-root mounts, credentials on the command
line, database access that is not read-only, unauthenticated remote servers, and anything reached over
plain HTTP.

## What it does not do

- No account, no signup, no key.
- No telemetry. Nothing about your usage leaves your machine.
- No filesystem access. `audit_mcp_config` takes the config as text, so the server never reads your disk.
- One network call in the whole package: `latest_field_note` fetches a public RSS feed. Skip that tool
  and this server never opens a socket.

The cost table, GPU list and server directory match the calculators at
[aiopsfieldnotes.com/tools](https://aiopsfieldnotes.com/tools/) and get re-verified with each weekly
episode. Pricing moves — check the vendor's page before you commit a budget to it.

## Where the network tools come from

`explain_config_diff` and `check_config_compliance` are the read-only core of
[DriftWatch](https://driftwatch.labaccessnow.com/), which runs the same rules nightly across a fleet and
keeps the history. Here you get the single-shot version, on two snapshots you paste, with no storage and
no scheduler. That is deliberate: the rules are the useful part, and they work fine on their own.

## Licence

MIT. Written by James Son — network, security, and automation engineer — and tested in a live
multi-vendor lab. Contributions and corrections welcome.
