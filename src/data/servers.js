// Generated from the calculators on aiopsfieldnotes.com — keep in step with the site.
export default [
  {
    "name": "Filesystem",
    "maintainer": "Anthropic (reference)",
    "connects": "Files",
    "what": "Read/write/search files under allowed roots — the workhorse for local-file agents.",
    "tier": "official"
  },
  {
    "name": "Fetch",
    "maintainer": "Anthropic (reference)",
    "connects": "Web",
    "what": "Fetch a URL and return page content converted for model consumption.",
    "tier": "official"
  },
  {
    "name": "Git",
    "maintainer": "Anthropic (reference)",
    "connects": "Dev",
    "what": "Read, search and diff local git repositories.",
    "tier": "official"
  },
  {
    "name": "Memory",
    "maintainer": "Anthropic (reference)",
    "connects": "State",
    "what": "Knowledge-graph style persistent memory across sessions.",
    "tier": "official"
  },
  {
    "name": "Sequential Thinking",
    "maintainer": "Anthropic (reference)",
    "connects": "Reasoning",
    "what": "Structured step-by-step problem decomposition for agents.",
    "tier": "official"
  },
  {
    "name": "Everything",
    "maintainer": "Anthropic (reference)",
    "connects": "Testing",
    "what": "Exercises every MCP feature — the server you point clients at to test integrations.",
    "tier": "official"
  },
  {
    "name": "GitHub",
    "maintainer": "GitHub (official)",
    "connects": "Dev",
    "what": "Repos, issues, PRs, reviews, code search — the full GitHub API surface for agents.",
    "tier": "vendor"
  },
  {
    "name": "Playwright MCP",
    "maintainer": "Microsoft (official)",
    "connects": "Browser",
    "what": "Drive a real browser: navigate, click, type, screenshot — built on Playwright.",
    "tier": "vendor"
  },
  {
    "name": "Puppeteer",
    "maintainer": "community/reference",
    "connects": "Browser",
    "what": "Headless-Chrome automation server; lighter alternative to Playwright.",
    "tier": "community"
  },
  {
    "name": "Safari MCP",
    "maintainer": "Apple",
    "connects": "Browser",
    "what": "Safari Technology Preview ships a built-in MCP server — the OS browser as an agent surface.",
    "tier": "vendor"
  },
  {
    "name": "PostgreSQL",
    "maintainer": "reference/community",
    "connects": "Database",
    "what": "Schema-aware read (and optionally write) access to Postgres databases.",
    "tier": "community"
  },
  {
    "name": "SQLite",
    "maintainer": "reference/community",
    "connects": "Database",
    "what": "Query and update local SQLite files — great for small agent state stores.",
    "tier": "community"
  },
  {
    "name": "Slack",
    "maintainer": "community",
    "connects": "Comms",
    "what": "Read channels, post messages, search history from agents.",
    "tier": "community"
  },
  {
    "name": "Google Drive",
    "maintainer": "community",
    "connects": "Files",
    "what": "Search and read Drive documents with OAuth-scoped access.",
    "tier": "community"
  },
  {
    "name": "Brave Search",
    "maintainer": "Brave / community",
    "connects": "Web",
    "what": "Web search API as an MCP tool — a common default for agent web search.",
    "tier": "community"
  },
  {
    "name": "Sentry",
    "maintainer": "Sentry (official)",
    "connects": "Ops",
    "what": "Query errors and issues — lets agents triage production exceptions.",
    "tier": "vendor"
  },
  {
    "name": "JetBrains IDE",
    "maintainer": "JetBrains (official)",
    "connects": "Dev",
    "what": "Bundled MCP server in IntelliJ-family IDEs (2025.2+): project, files, run configs.",
    "tier": "vendor"
  },
  {
    "name": "Oracle DB MCP",
    "maintainer": "Oracle (official)",
    "connects": "Database",
    "what": "Context-aware access to Oracle enterprise data for agents.",
    "tier": "vendor"
  },
  {
    "name": "ElevenLabs",
    "maintainer": "ElevenLabs (official)",
    "connects": "Media",
    "what": "TTS, voice and audio generation as agent tools.",
    "tier": "vendor"
  },
  {
    "name": "Context7",
    "maintainer": "Upstash (official)",
    "connects": "Docs",
    "what": "Current library/framework documentation lookup for coding agents.",
    "tier": "vendor"
  }
];
