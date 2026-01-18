# MCPflare - Zero-Trust MCP Security

[**Documentation**](https://mcpflare.org/) | [**GitHub**](https://github.com/jgentes/mcpflare) | [**VS Code Extension**](https://marketplace.visualstudio.com/items?itemName=forgedapps.mcpflare)

Secure your local MCP servers with zero-trust isolation while reducing context window token usage by up to **98%**. Protect against data exfiltration, credential theft, and more.

## Quick Start

1.  **Click the shield icon** 🛡️ in the activity bar (left sidebar).
2.  Your MCP servers are **auto-discovered** from Claude, Cursor, and Copilot.
3.  **Toggle protection** on for any MCP you want to secure.

> **Tip:** Open the settings panel anytime with `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS) → **MCPflare: Open Settings**.

## How It Works: Defense in Depth

Traditional MCP tool calling is risky. MCPflare provides multiple layers of protection to keep your system safe from malicious code:

### 🛡️ V8 Isolate Sandboxing
Complete process isolation using Cloudflare Workers. Each execution runs in a fresh, disposable environment with no access to the host system unless explicitly permitted.

### 🌐 Network Isolation
Zero outbound network access by default (`globalOutbound: null`). Code cannot exfiltrate data, steal credentials, or make unauthorized requests to external APIs.

### 🔍 Code Validation
Pre-execution security checks block dangerous patterns like `eval()`, `require()`, `process`, and `import()`. All code is validated before it ever reaches the isolate.

### ⚡ 98% Token Reduction
Code mode execution dramatically reduces context window usage. Process data in the sandbox and return only results, instead of passing massive amounts of tool data back and forth to the LLM.

## Configuration

MCPflare provides granular control for each MCP server. For detailed configuration options, please refer to the [official documentation](https://mcpflare.org/docs).

### 🌐 Network Access
Control which hosts each MCP can access.
- **Allowed Hosts**: Specific domains that can be accessed (e.g., `api.github.com`).
- **Allow Localhost**: Permit or block requests to localhost/127.0.0.1.

### 📂 File System Access
Restrict read and write access to specific workspace directories.
- **Read Paths**: Directories the MCP is allowed to read from.
- **Write Paths**: Directories the MCP is allowed to write to.

### 🔐 Guard Protection
Easily toggle isolation on or off for any individual MCP server.

## Features

- **Auto-Discovery**: Automatically detects MCP servers from Claude Code, Cursor, and GitHub Copilot.
- **Transparent Proxy**: All MCP tool calls automatically route through secure isolation with no config changes needed.
- **Security Testing**: Built-in environment for testing network isolation and code injection prevention.
- **Token Savings**: Real-time visualization of context window savings and performance metrics.

---
[Documentation](https://mcpflare.org/) | [Report Issues](https://github.com/jgentes/mcpflare/issues) | [Changelog](https://github.com/jgentes/mcpflare/blob/main/CHANGELOG.md)
