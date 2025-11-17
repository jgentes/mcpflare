# MCP Guard - Project Specification

## Executive Summary

MCP Guard is an enterprise-grade MCP server that provides secure, isolated execution of other MCP servers using Cloudflare Workers' isolate technology and code mode execution. This solution addresses critical security and efficiency challenges in AI agent workflows.

## Problem Statement

Current MCP implementations face several challenges:

1. **Security Concerns**: MCP servers run with full network access and limited sandboxing
2. **Inefficiency**: Traditional tool-calling requires round-trips through the LLM for each operation
3. **Context Window Waste**: Each tool call result must pass through the neural network
4. **Limited Composition**: Chaining multiple MCP calls is token-intensive and slow
5. **No Isolation**: MCP servers can interfere with each other or access unauthorized resources

## Solution Overview

MCP Guard is a meta-MCP server that:

- Loads target MCP servers into disposable Cloudflare Workers isolates
- Converts MCP tool schemas to TypeScript APIs for code mode execution
- Enables AI agents to write code that efficiently chains multiple MCP operations
- Provides enterprise-grade security through network isolation and binding-based access control
- Delivers measurable improvements in context window usage and execution speed

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        AI Agent (Cursor, etc.)               │
└───────────────────────────┬─────────────────────────────────┘
                            │ MCP Protocol
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              MCP Guard (Meta-MCP Server)            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  MCP Protocol Handler                                │   │
│  │  - load_mcp_server                                   │   │
│  │  - execute_code                                      │   │
│  │  - list_available_mcps                               │   │
│  │  - get_mcp_schema                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  TypeScript API Generator                            │   │
│  │  - Converts MCP schemas to TypeScript definitions    │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Wrangler Integration Layer                          │   │
│  │  - Worker lifecycle management                       │   │
│  │  - Local development server                          │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │ Worker Loader API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│         Cloudflare Workers Runtime (workerd/Wrangler)        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Worker Isolate (Sandboxed Environment)        │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Generated TypeScript Code                      │  │  │
│  │  │  - AI-authored execution logic                  │  │  │
│  │  │  - Calls target MCP via bindings                │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Security Configuration                         │  │  │
│  │  │  - globalOutbound: null (no network access)     │  │  │
│  │  │  - Binding-based MCP access only                │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  MCP Server Bindings                            │  │  │
│  │  │  - RPC interfaces to target MCPs                │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │ RPC Callbacks
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Target MCP Servers                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   GitHub     │  │   Weather    │  │   Database   │ ... │
│  │     MCP      │  │     MCP      │  │     MCP      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Meta-MCP Server (Node.js/TypeScript)

**Responsibilities:**
- Implement MCP protocol server
- Manage Worker lifecycle via Wrangler API
- Convert MCP schemas to TypeScript definitions
- Handle execution requests and return results
- Collect metrics and telemetry

**Key Modules:**
- `src/server/mcp-handler.ts` - MCP protocol implementation
- `src/server/worker-manager.ts` - Worker Loader integration
- `src/server/schema-converter.ts` - MCP to TypeScript conversion
- `src/server/metrics-collector.ts` - Performance tracking

#### 2. Worker Isolate Environment

**Responsibilities:**
- Execute AI-generated TypeScript code
- Provide sandboxed runtime
- Enforce security policies
- Proxy MCP calls via RPC bindings

**Key Features:**
- No direct network access (`globalOutbound: null`)
- Binding-based MCP access
- Disposable per-execution
- Millisecond startup time

#### 3. CLI Interface (Optional)

**Responsibilities:**
- Configuration management
- Development server
- Deployment automation
- Testing utilities

## Core MCP Tools

### 1. `load_mcp_server`

**Purpose**: Initialize an MCP server in an isolated Worker environment

**Input Schema**:
```json
{
  "name": "load_mcp_server",
  "description": "Load an MCP server into a secure isolated Worker environment",
  "inputSchema": {
    "type": "object",
    "properties": {
      "mcp_name": {
        "type": "string",
        "description": "Unique identifier for this MCP instance"
      },
      "mcp_config": {
        "type": "object",
        "description": "MCP server connection configuration",
        "properties": {
          "command": {
            "type": "string",
            "description": "Command to launch the MCP server"
          },
          "args": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Arguments for the MCP server command"
          },
          "env": {
            "type": "object",
            "description": "Environment variables"
          }
        },
        "required": ["command"]
      }
    },
    "required": ["mcp_name", "mcp_config"]
  }
}
```

**Output**:
```json
{
  "success": true,
  "mcp_id": "unique-worker-id",
  "typescript_api": "... generated TypeScript definitions ...",
  "available_tools": ["tool1", "tool2", "..."]
}
```

### 2. `execute_code`

**Purpose**: Execute TypeScript code against loaded MCP servers

**Input Schema**:
```json
{
  "name": "execute_code",
  "description": "Execute TypeScript code in a sandboxed Worker with access to loaded MCP servers",
  "inputSchema": {
    "type": "object",
    "properties": {
      "mcp_id": {
        "type": "string",
        "description": "ID of the loaded MCP server returned from load_mcp_server"
      },
      "code": {
        "type": "string",
        "description": "TypeScript code to execute. Use console.log() to return results."
      },
      "timeout_ms": {
        "type": "number",
        "description": "Execution timeout in milliseconds (default: 30000)",
        "default": 30000
      }
    },
    "required": ["mcp_id", "code"]
  }
}
```

**Output**:
```json
{
  "success": true,
  "output": "... console.log output ...",
  "execution_time_ms": 145,
  "metrics": {
    "mcp_calls_made": 3,
    "tokens_saved_estimate": 1250
  }
}
```

### 3. `list_available_mcps`

**Purpose**: List all currently loaded MCP servers

**Input Schema**:
```json
{
  "name": "list_available_mcps",
  "description": "List all MCP servers currently loaded in Worker isolates",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

**Output**:
```json
{
  "mcps": [
    {
      "mcp_id": "github-abc123",
      "mcp_name": "github",
      "status": "ready",
      "uptime_ms": 15000,
      "tools_count": 8
    }
  ]
}
```

### 4. `get_mcp_schema`

**Purpose**: Retrieve the TypeScript API definition for a loaded MCP

**Input Schema**:
```json
{
  "name": "get_mcp_schema",
  "description": "Get the TypeScript API definition for a loaded MCP server",
  "inputSchema": {
    "type": "object",
    "properties": {
      "mcp_id": {
        "type": "string",
        "description": "ID of the loaded MCP server"
      }
    },
    "required": ["mcp_id"]
  }
}
```

**Output**:
```json
{
  "mcp_id": "github-abc123",
  "typescript_api": "... TypeScript definitions ...",
  "tools": ["create_issue", "search_code", "..."]
}
```

### 5. `unload_mcp_server`

**Purpose**: Clean up and remove a loaded MCP server

**Input Schema**:
```json
{
  "name": "unload_mcp_server",
  "description": "Unload an MCP server and clean up its Worker isolate",
  "inputSchema": {
    "type": "object",
    "properties": {
      "mcp_id": {
        "type": "string",
        "description": "ID of the loaded MCP server to unload"
      }
    },
    "required": ["mcp_id"]
  }
}
```

## Security Requirements

### Isolation

1. **Network Isolation**: All Worker isolates must have `globalOutbound: null`
2. **Binding-Only Access**: MCP servers accessible only through RPC bindings
3. **No Cross-Contamination**: Each MCP runs in its own disposable isolate
4. **API Key Hiding**: All credentials managed by meta-MCP, never exposed to isolates

### Authentication & Authorization

1. **MCP Server Auth**: Meta-MCP handles all target MCP authentication
2. **Client Auth**: Support for API key and OAuth for meta-MCP access
3. **Audit Logging**: All MCP interactions logged with timestamps and user context

### Input Validation

1. **Schema Validation**: All inputs validated against JSON schemas
2. **Code Sanitization**: TypeScript code analyzed for dangerous patterns
3. **Resource Limits**: CPU time, memory, and execution timeout limits enforced

### Secrets Management

1. **Environment Variables**: Secure storage of MCP credentials
2. **No Hardcoding**: Zero credentials in code or configuration files
3. **Rotation Support**: Ability to update credentials without restart

## Performance Requirements

### Metrics to Track

1. **Context Window Savings**:
   - Baseline: Direct MCP tool calling token usage
   - Code Mode: Token usage with code execution
   - Target: >50% reduction in context window usage

2. **Execution Speed**:
   - Isolate startup time: <10ms
   - Code execution overhead: <50ms
   - End-to-end latency: <500ms for simple operations

3. **Resource Usage**:
   - Memory per isolate: <50MB
   - CPU utilization: <30% during normal operation
   - Concurrent isolates: Support 100+ simultaneous

### Benchmarking Plan

**Test Case: GitHub MCP Search & File Operations**

*Scenario*: Search for a code pattern, read 3 files, create an issue

*Traditional Tool Calling*:
1. Call `search_code` tool → LLM processes result
2. Call `read_file` tool (3x) → LLM processes results
3. Call `create_issue` tool → LLM processes result
- **Total**: 5 LLM round-trips, ~8,000 tokens

*Code Mode Execution*:
1. Generate TypeScript code that chains all operations
2. Execute code in isolate → Returns final result only
- **Total**: 1 code generation, 1 execution, ~2,000 tokens
- **Savings**: 75% token reduction, 5x faster

## Technology Stack

### Core Dependencies

- **Runtime**: Node.js 20+ / Bun
- **Language**: TypeScript 5+
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Wrangler**: `wrangler` (Cloudflare CLI)
- **Testing**: Vitest, Playwright
- **Linting**: ESLint, Prettier
- **CI/CD**: GitHub Actions

### Key Libraries

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `zod` - Schema validation
- `tsx` - TypeScript execution
- `pino` - Structured logging
- `dotenv` - Environment configuration

## Development Phases

### Phase 1: Core Implementation (Week 1-2)

- [ ] Set up TypeScript project structure
- [ ] Implement basic MCP server
- [ ] Integrate Worker Loader API via Wrangler
- [ ] Create MCP schema to TypeScript converter
- [ ] Implement `load_mcp_server` tool
- [ ] Implement `execute_code` tool
- [ ] Basic error handling and logging

### Phase 2: Security Hardening (Week 2-3)

- [ ] Implement network isolation (`globalOutbound: null`)
- [ ] Add RPC binding architecture
- [ ] Secrets management system
- [ ] Input validation and sanitization
- [ ] Audit logging
- [ ] Security testing suite

### Phase 3: Testing & Benchmarking (Week 3-4)

- [ ] Integration with GitHub MCP
- [ ] Benchmark traditional vs code mode
- [ ] Load testing (concurrent isolates)
- [ ] Security penetration testing
- [ ] Documentation of results

### Phase 4: Production Readiness (Week 4-5)

- [ ] CLI interface (optional)
- [ ] Comprehensive documentation
- [ ] Example configurations
- [ ] Docker container
- [ ] GitHub Actions workflows
- [ ] Security audit

### Phase 5: Release (Week 5-6)

- [ ] Open source repository setup
- [ ] README and contribution guidelines
- [ ] Website/landing page
- [ ] Blog post with benchmarks
- [ ] Community announcement

## Success Criteria

1. **Functionality**: Successfully load and execute GitHub MCP in isolated Worker
2. **Security**: Pass security audit with zero critical vulnerabilities
3. **Performance**: Demonstrate >50% context window reduction vs traditional tool calling
4. **Reliability**: 99.9% success rate in test suite
5. **Documentation**: Complete API documentation and usage examples
6. **Adoption**: 100+ GitHub stars within first month

## Open Source Strategy

### Repository Structure

```
mcpguard/
├── src/
│   ├── server/          # Meta-MCP server implementation
│   ├── worker/          # Worker isolate runtime
│   ├── cli/             # CLI interface (optional)
│   └── types/           # TypeScript definitions
├── tests/
│   ├── unit/
│   ├── integration/
│   └── security/
├── examples/
│   ├── github-mcp/
│   ├── weather-mcp/
│   └── compose-multiple/
├── docs/
│   ├── architecture.md
│   ├── security.md
│   ├── benchmarks.md
│   └── api-reference.md
├── benchmarks/          # Performance test results
└── .github/
    └── workflows/       # CI/CD
```

### License

MIT License (maximum adoption and corporate-friendly)

### Community Guidelines

- Clear contribution process
- Code of conduct
- Issue templates
- PR templates
- Security disclosure policy

## Risk Mitigation

### Technical Risks

| Risk | Mitigation |
|------|-----------|
| Worker Loader API instability (beta) | Extensive testing, fallback mechanisms, version pinning |
| Performance degradation at scale | Load testing, performance monitoring, resource limits |
| Security vulnerabilities | Security audit, automated scanning, bug bounty program |
| MCP protocol changes | Version compatibility layer, automated migration tools |

### Adoption Risks

| Risk | Mitigation |
|------|-----------|
| Complex setup process | Clear documentation, automated setup scripts, Docker images |
| Limited MCP ecosystem | Start with popular MCPs (GitHub, Slack), expand gradually |
| Competition from alternatives | Focus on unique value: security + efficiency |

## Next Steps

1. Review and approve this specification
2. Set up development environment
3. Initialize TypeScript project with required dependencies
4. Begin Phase 1 implementation
5. Establish testing infrastructure

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-15  
**Status**: Awaiting Approval
