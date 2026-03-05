# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.6] - 2026-03-05

### Added
- 5 new compression content types: YAML/TOML, XML, git diff, stack traces, env/INI files
- Persistent stats across sessions — `report` now shows today and all-time savings (stored in `~/.ucm-stats.json`)
- Smarter code compression: short methods (≤5 lines) and bodies with TODO/FIXME/throw/catch are preserved
- `fetch_and_index` accepts optional `headers` parameter for private/authenticated URLs

### Fixed
- Lint: removed unnecessary escape `\#` in GDB stack trace regex
- Lint: removed unused `section` variable in env compressor

## [0.1.5] - 2026-03-05

### Fixed
- Session duration in `report` now measures from server start to current time, not first-to-last event (was always showing 0s when compressions happened close together)

## [0.1.4] - 2026-03-05

### Added
- `report` MCP tool — shows session savings summary (compressions, KB/tokens saved, per-tool breakdown, savings %)
- Eclipse IDE adapter via Continue.dev with embedded C++ focus:
  - Auto-detects `.cproject` (CDT) and `.project` files
  - Writes MCP entry to `~/.continue/config.json` (merges with existing)
  - Creates `.context-mode/embedded-cpp-rules.md` with usage examples for cross-compiler output, linker map files, GDB/OpenOCD logs, UART dumps, cppcheck/MISRA, and device headers
- `report` usage examples added to Copilot, Cursor, and Windsurf setup instructions

## [0.1.3] - 2026-03-04

### Fixed
- TypeScript strict null checks in `stats-tracker.ts`

## [0.1.2] - 2026-03-04

### Added
- Session stats tracking via `StatsTracker` utility
- `compress` tool now records input/output sizes per call

## [0.1.1] - 2026-03-04

### Fixed
- Minor type fixes in adapter base interface

## [0.1.0] - 2024-01-15

### Added
- Initial release
- 7 MCP tools: `execute`, `execute_file`, `index`, `search`, `fetch_and_index`, `compress`, `proxy`
- 10 language runtimes: JavaScript, TypeScript, Python, Shell, Ruby, Go, Rust, PHP, Perl, R
- Content-type detection and specialized compression for: JSON, logs, code, markdown, CSV, generic
- Intent-driven filtering using TF-IDF scoring (no LLM calls)
- SQLite FTS5 knowledge base with Porter stemming and BM25 ranking
- IDE adapters for: Claude Code, Cursor, Windsurf, GitHub Copilot (VS Code)
- CLI setup command with auto-detection: `npx universal-context-mode setup`
- Auth passthrough for: gh, aws, gcloud, kubectl, docker
- Heading-aware markdown chunking (preserves code blocks)
- Session stats tracking (bytes/tokens saved)
- Comprehensive test suite: unit, integration, benchmarks
- GitHub Actions CI/CD (test, release, weekly benchmark)
