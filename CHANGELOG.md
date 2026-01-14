# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

