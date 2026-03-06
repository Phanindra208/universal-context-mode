# universal-context-mode

> **315 KB becomes 5.4 KB. 98% reduction. Works in every AI IDE.**

An open-source MCP server that compresses tool outputs before they enter the AI context window.
Built for **Claude Code, Cursor, Windsurf, GitHub Copilot, Eclipse, and any MCP-compatible host.**

[![npm version](https://img.shields.io/npm/v/universal-context-mode?color=crimson)](https://www.npmjs.com/package/universal-context-mode)
[![npm downloads](https://img.shields.io/npm/dm/universal-context-mode)](https://www.npmjs.com/package/universal-context-mode)
[![CI](https://github.com/phanindra208/universal-context-mode/actions/workflows/ci.yml/badge.svg)](https://github.com/phanindra208/universal-context-mode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## Install in your IDE

Pick your IDE. One command. Done.

### Claude Code

```bash
claude mcp add context-mode -- npx -y universal-context-mode
```

Verify:
```bash
claude mcp list
```

---

### Cursor

```bash
npx -y universal-context-mode setup cursor
```

This creates:
- `.cursor/mcp.json` — registers the MCP server
- `.cursor/rules/context-mode.mdc` — rules that instruct the agent to use context-mode automatically

Then **restart Cursor** → open the MCP panel (`Ctrl+Shift+P` → `MCP: Show Panel`) to confirm it's connected.

---

### Windsurf

```bash
npx -y universal-context-mode setup windsurf
```

This creates:
- `.windsurf/mcp.json` — registers the MCP server
- `.windsurf/cascade-rules.md` — Cascade rules for automatic routing

Then **restart Windsurf** → Settings → MCP to verify `context-mode` appears.

---

### GitHub Copilot (VS Code)

```bash
npx -y universal-context-mode setup copilot
```

This updates:
- `.vscode/settings.json` — adds the MCP server entry
- `.github/copilot-instructions.md` — custom instructions that guide Copilot to use context-mode

Then **reload VS Code** (`Ctrl+Shift+P` → `Developer: Reload Window`).

> Requires VS Code 1.99+ and an active GitHub Copilot subscription.

---

### Eclipse (Embedded C++)

```bash
npx -y universal-context-mode setup eclipse
```

This updates:
- `~/.continue/config.json` — registers the MCP server for Continue.dev
- `.context-mode/embedded-cpp-rules.md` — usage examples for cross-compiler output, linker maps, GDB/OpenOCD, UART logs, and static analysis

> Requires [Continue.dev](https://plugins.continuedev.org) plugin and Eclipse 2023-03+ with Java 17+.
> Install via: **Help → Eclipse Marketplace → search "Continue"**

---

### Any MCP host

Add this to your MCP configuration file:

```json
{
  "mcpServers": {
    "context-mode": {
      "command": "npx",
      "args": ["-y", "universal-context-mode"]
    }
  }
}
```

---

### Auto-detect your IDE

Run from your project root — it detects the IDE automatically:

```bash
npx -y universal-context-mode setup
```

---

## What it does

Every AI coding session silently burns context:

```
You: "Show me recent git commits"
AI:  runs git log  →  150 lines  →  3K tokens gone
You: "Now explain what changed in auth"
AI:  "I've lost context of the earlier conversation..."
```

context-mode intercepts large outputs and compresses them algorithmically — no LLM calls, no API keys, works offline.

```
git log (500 commits)   315 KB  →  5.4 KB   (98% saved)
JSON API (500 records)   95 KB  →  0.8 KB   (99% saved)
App logs (1000 lines)    62 KB  →  3.0 KB   (95% saved)
npm list (300 packages)  12 KB  →  1.2 KB   (90% saved)
```

Your context window stays clean for the entire session instead of exhausting in 30 minutes.

---

## How Much Money This Saves You

Every token wasted on bloated tool output is a token you pay for — and a token that pushes useful context out of the window.

### API users (pay-per-token)

| Model | Input price | 1M tokens/day wasted | Monthly waste |
|---|---|---|---|
| Claude Sonnet | $3 / 1M tokens | ~$3/day | **~$90/month** |
| GPT-4o | $2.50 / 1M tokens | ~$2.50/day | **~$75/month** |
| Claude Opus | $15 / 1M tokens | ~$15/day | **~$450/month** |

context-mode cuts token consumption by **90–99%** on large outputs. A team running 10 AI sessions a day can recover hundreds of dollars per month — just from compression.

### Subscription users (Claude Code, Copilot, Cursor)

You pay a flat monthly fee, but hitting the context limit means:
- The session resets — **you lose all prior context**
- The AI starts making mistakes from missing information
- You spend time re-explaining what was already said

With context-mode, sessions run **3–5× longer** before hitting limits. That's 3–5× more productive work per subscription dollar.

### Example: a single debugging session

```
Without context-mode:
  docker logs  →  500 lines  →  62 KB  →  ~15K tokens burned
  git log      →  200 commits →  28 KB  →  ~7K tokens burned
  npm list     →  300 pkgs   →  12 KB  →  ~3K tokens burned
  ─────────────────────────────────────────────────────
  Total wasted: ~25K tokens  ≈  $0.075 per session (Sonnet)
                              ≈  $0.375 per session (Opus)

With context-mode:
  Same 3 commands  →  ~2KB each  →  ~1.5K tokens total
  Savings: 94% — and the full session context stays intact
```

At 20 debugging sessions per developer per month, that's **$1.50–$7.50 saved per developer per month** on API costs alone — plus the productivity gain from never losing context mid-session.

**Free to use. Zero API calls. Works offline. Pays for itself immediately.**

---

## Tools

### `execute` — Run code, get compressed output

```javascript
execute({
  language: "shell",  // js, ts, python, shell, ruby, go, php, perl, r
  code: "git log --oneline -200",
  intent: "commits related to authentication"  // optional — filters output
})
```

Supports **10 runtimes**. Bun auto-detected for 3–5× faster JS/TS execution. Output is compressed before entering context.

---

### `execute_file` — Process large files without loading them

```javascript
execute_file({
  file_path: "/path/to/package-lock.json",
  code: `
    const d = JSON.parse(process.env.FILE_CONTENT);
    console.log('Packages:', Object.keys(d.dependencies ?? {}).length);
  `
})
```

File content injected via `FILE_CONTENT` env var. Only your summary enters context.

---

### `index` — Index content into searchable knowledge base

```javascript
index({
  content: largeDocumentation,
  source: "api-reference.md",
  kb_name: "project-docs"
})
```

SQLite with BM25 ranking + Porter stemming. Heading-aware chunking. Code blocks preserved.

---

### `search` — Query indexed content

```javascript
search({
  query: "authentication middleware configuration",
  kb_name: "project-docs",
  top_k: 5
})
```

Returns relevant snippets with heading context — never full documents.

---

### `fetch_and_index` — Fetch a URL and index it

```javascript
fetch_and_index({ url: "https://angular.io/guide/signals", kb_name: "angular" })
search({ query: "computed signals", kb_name: "angular" })
```

Private/authenticated URLs supported via `headers`:

```javascript
fetch_and_index({
  url: "https://api.github.com/repos/org/repo/readme",
  kb_name: "project-docs",
  headers: { "Authorization": "Bearer ghp_xxx" }
})
```

HTML → Markdown conversion. Raw content never enters context.

---

### `compress` — Compress any large text

```javascript
compress({
  content: anyLargeText,
  intent: "find error messages and stack traces",
  strategy: "auto"  // auto | truncate | summarize | filter
})
```

Auto-detects content type and applies the best strategy:

| Type | Examples |
|---|---|
| JSON | API responses, config files |
| Logs | app logs, docker logs, syslog |
| Code | JS/TS/Python/Go/Rust/C++ source |
| Markdown | docs, READMEs, wikis |
| CSV | exports, reports |
| YAML/TOML | docker-compose, Cargo.toml, CI configs |
| XML | pom.xml, AndroidManifest, .cproject |
| Diff | git diff output — shows files + context, strips line noise |
| Stack trace | JS/Python/Rust/C++ crashes — extracts root cause, collapses frames |
| Env/INI | `.env`, `.ini` files — shows keys, **masks secrets automatically** |

---

### `proxy` — Wrap any tool call and compress its output

```javascript
proxy({
  tool: "bash",
  args: { command: "docker logs my-container --tail 500" },
  intent: "connection errors"
})
```

The key differentiator for IDEs without `PreToolUse` hooks.

---

### `report` — Show how much context was saved this session

```javascript
report()
```

Returns a per-request token tracking summary (input tokens seen, output before→after compression) plus persistent today/all-time totals. Use it to verify context-mode is working.

```
=== context-mode Session Report ===

Session: 23m | 12 requests | 5 compressions

PER-REQUEST TOKEN TRACKING
  Total requests:  12
  Input tokens:       148 tokens  (512 B sent to tools)
  Output tokens:   11.3K tokens → 2.0K tokens (compressed)
  Net tokens saved: 9.3K tokens

COMPRESSION SAVINGS
  Before:       45.2 KB  (~11.3K tokens)
  After:         8.1 KB  (~2.0K tokens)
  Saved:        37.1 KB  (~9.3K tokens)
  Ratio:        82.1% reduction

BY TOOL
  compress         3x    28.4 KB saved  (~7.1K tokens)
  fetch_and_index  2x     8.7 KB saved  (~2.2K tokens)


HISTORICAL
  Today      112.3 KB  (~28.1K tokens)  across 4 sessions
  All time   843.1 KB  (~210.8K tokens) across 23 sessions

STATUS: ✓ Working — saved 37.1 KB from context window this session
```

Historical stats persist across server restarts in `~/.ucm-stats.json`.

---

## Benchmarks

| Content | Input | Output | Saved |
|---|---|---|---|
| git log — 500 commits | 28 KB | 4 KB | **86%** |
| JSON API — 500 records | 95 KB | 0.8 KB | **99%** |
| App logs — 1000 lines | 62 KB | 3 KB | **95%** |
| Markdown docs — 15 sections | 48 KB | 2 KB | **96%** |
| CSV export — 500 rows | 22 KB | 0.6 KB | **97%** |
| npm list — 300 packages | 12 KB | 1.2 KB | **90%** |
| TypeScript — 30 methods | 18 KB | 3 KB | **83%** |
| YAML — docker-compose (200 lines) | 8 KB | 1.5 KB | **81%** |
| git diff — 50 files changed | 42 KB | 13 KB | **69%** |
| Stack trace — Java exception | 6 KB | 0.5 KB | **91%** |
| `.env` — 80 keys (secrets masked) | 4 KB | 1.2 KB | **70%** |

All algorithmic. No LLM. No API key. Works offline. See [BENCHMARK.md](BENCHMARK.md).

---

## Configuration

Set via environment variables — no config file needed:

| Variable | Default | Description |
|---|---|---|
| `UCM_THRESHOLD_BYTES` | `5120` | Skip compression below this size |
| `UCM_MAX_OUTPUT_BYTES` | `8192` | Target max output size |
| `UCM_TIMEOUT_MS` | `30000` | Sandbox execution timeout (ms) |
| `UCM_DB_PATH` | OS temp dir | SQLite database path |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

Example — lower the output target to 4 KB:
```bash
UCM_MAX_OUTPUT_BYTES=4096 npx -y universal-context-mode
```

---

## Requirements

- **Node.js 18+** (LTS or current)
- **No Python, no build tools** — pure JS/WASM stack, installs in seconds
- Bun optional — auto-detected, gives 3–5× faster JS/TS execution

---

## Contributing

### Local dev setup

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/phanindra208/universal-context-mode.git
cd universal-context-mode

# 2. Install (no native compilation — pure JS/WASM)
npm install

# 3. Build TypeScript
npm run build

# 4. Run tests
npm test

# 5. Watch mode while developing
npm run test:watch
```

### Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
# Opens browser UI at http://localhost:5173
# Call any of the 8 tools interactively
```

### Point your IDE at your local build

Instead of the published npm package, use your local dist:

```json
{
  "mcpServers": {
    "context-mode": {
      "command": "node",
      "args": ["/absolute/path/to/universal-context-mode/dist/index.js"]
    }
  }
}
```

For Claude Code:
```bash
claude mcp add context-mode -- node /absolute/path/to/universal-context-mode/dist/index.js
```

### Useful commands

```bash
npm run lint          # ESLint
npm run lint:fix      # Auto-fix
npm run format        # Prettier
npm run build         # tsc compile
npm test              # vitest (unit + integration, 75+ tests)
npm run test:watch    # Watch mode
npm run benchmark     # Regenerate BENCHMARK.md
```

### Project layout

```
src/
├── compression/      ← Add new content-type strategies here
│   ├── strategies.ts    detectContentType() + compress() pipeline
│   ├── intent-filter.ts TF-IDF relevance scoring
│   └── chunker.ts       Markdown-aware splitter
├── knowledge-base/   ← SQLite BM25 (sql.js, pure WASM — no node-gyp)
├── sandbox/          ← Subprocess execution + 10 runtime detectors
├── adapters/         ← Add a new IDE adapter here
├── tools/            ← 8 MCP tool implementations
└── utils/

tests/
├── unit/             one file per module
├── integration/      full MCP protocol round-trips
└── benchmarks/       compression ratio assertions
```

### Adding a new compression strategy

1. Add your function to `src/compression/strategies.ts`
2. Register in `detectContentType()` and the `compress()` switch
3. Write tests in `tests/unit/compression.test.ts`
4. Add a benchmark in `tests/benchmarks/compression-ratio.test.ts`

### Adding a new IDE adapter

1. Create `src/adapters/your-ide.ts` implementing `BaseAdapter`
2. Register in `src/adapters/generic.ts`
3. Add templates under `templates/your-ide/`
4. Add a script `scripts/setup-your-ide.sh`

See [CONTRIBUTING.md](CONTRIBUTING.md) for the PR process and TDD guide.

---

## Publishing (maintainers)

```bash
npm version patch   # or minor / major
git push --tags     # triggers CI → auto-publishes to npm
```

The release workflow (`.github/workflows/release.yml`) handles `npm publish` on every `v*.*.*` tag.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Inspired by

[mksglu/claude-context-mode](https://github.com/mksglu/claude-context-mode) — the original Claude Code-specific implementation that inspired this universal version.
