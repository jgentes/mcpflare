# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.5] - 2026-01-18

### Fixed
- Put Marketplace screenshot on its own line

## [1.2.4] - 2026-01-18

### Fixed
- Used raw GitHub URL for Marketplace README screenshot

## [1.2.3] - 2026-01-18

### Fixed
- Bundled extension screenshot asset for Marketplace listing

## [1.2.2] - 2026-01-18

### Other
- Added VS Code extension README screenshot

## [1.2.1] - 2026-01-18

### Changed
- Hardened release workflow to validate extension builds and publish to Open VSX

### Fixed
- Synced VS Code extension lock file to prevent publish-time npm ci failures

## [1.2.0] - 2026-01-18

### Added
- Automated VS Code Marketplace publishing

### Changed
- Ignored packaged VS Code extension artifacts (`*.vsix`) in git

### Other
- Added troubleshooting guidance to the publish command documentation

## [1.1.1] - 2026-01-17

### Changed
- Replaced release-it with a simple tag-triggered publish workflow
- Added `/publish` command for AI-assisted releases with automatic changelog generation
- Simplified CI workflow - version bumping now happens locally, CI only publishes

### Fixed
- Fixed npm version hook to ensure git tag includes VSCode extension version sync
- Fixed pre-push hook line endings for Linux CI compatibility
- Fixed recursive npm publish issue that caused duplicate publish attempts
- Fixed release workflow to work with GitHub branch protection rules

## [1.1.0] - 2026-01-17

### Added
- Enterprise security hardening and automated release process
- Install command and MCP discovery/transparency features
- Unrestricted network mode with UI warning
- VS Code extension for MCP Guard configuration
- Token savings analysis and disk-based metrics persistence
- Per-MCP network allowlists enforcement
- Connection diagnostics and Streamable HTTP session handling
- Context window usage visualization panel

### Fixed
- Improved MCP assessment and context usage display
- Improved URL-based MCP caching and connection handling
- Prevented command injection in killProcessTree function
- Resolved various CI and test failures

## [1.0.0] - 2026-01-17

### Changed
- Renamed product from mcpguard to mcpflare
- Updated homepage URL to https://mcpflare.org

## [0.2.0] - 2024-12-13

### Added
- Initial release of MCPflare
- Zero-trust execution environment using Cloudflare Workers isolates
- Code mode execution for massive token savings (up to 98% reduction)
- Interactive CLI for testing MCP servers
- MCP server implementation with transparent proxy mode
- Automatic MCP discovery from IDE configurations (Cursor, Claude Code, GitHub Copilot)
- Security features: V8 isolate sandboxing, network isolation, code validation
- Service Bindings architecture for secure MCP tool access
- Schema caching for faster MCP loading
- Comprehensive test suite (unit, integration, security tests)
- VS Code extension for MCP management
- Documentation: README, CLAUDE.md, SECURITY_ANALYSIS.md

### Security
- Complete network isolation for sandboxed code execution
- Pre-execution code validation blocking dangerous patterns
- Disposable execution environments preventing state leakage
- Binding-based access control for explicit permissions

---

**Note**: This changelog will be automatically updated by release-it based on conventional commits.

