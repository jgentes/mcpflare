# 🛡️ How It Works: A Simple Example

**Scenario:** You ask your AI assistant: *"Find a bug in this repo and file an issue"*

## ❌ Traditional MCP (Without MCP Guard)

```mermaid
flowchart LR
    User["👤 User"] -->|"&nbsp;&nbsp;prompt&nbsp;&nbsp;"| LLM["🤖 LLM"]

    LLM -->|"&nbsp;&nbsp;generates code&nbsp;&nbsp;"| Danger

    subgraph Danger["⚠️ YOUR MACHINE - No Isolation<br/><br/>AI Code Executes<br/>WITH FULL ACCESS TO:<br/><br/>⚠️ Filesystem<br/>⚠️ Env Variables<br/>⚠️ Network<br/>⚠️ System"]
    end

    Danger -.->|"&nbsp;&nbsp;calls&nbsp;&nbsp;"| MCP["GitHub MCP<br/>Tools"]

    style Danger fill:#ffffff,stroke:#dd0000,stroke-width:4px
    style MCP fill:#ffffff,stroke:#888888,stroke-width:2px
```

**⚠️ The Problem:** AI-generated code runs with full access to your system:

| Risk | Access Level | Danger |
|------|-------------|--------|
| 🗂️ **Filesystem** | ✅ Full read/write | Can read SSH keys, modify code, delete files |
| 🔑 **Environment Variables** | ✅ Full access | Can steal `GITHUB_TOKEN`, API keys, secrets |
| 🌐 **Network** | ✅ Unrestricted | Can exfiltrate data, make unauthorized requests |
| ⚙️ **System** | ✅ Process-level | Can execute shell commands, spawn processes |

## ✅ With MCP Guard

```mermaid
flowchart LR
    User["👤 User"] -->|"&nbsp;&nbsp;prompt&nbsp;&nbsp;"| LLM["🤖 LLM"]

    LLM -->|"&nbsp;&nbsp;generates code&nbsp;&nbsp;"| Safe

    subgraph Safe["✅ ISOLATED SANDBOX - Protected<br/><br/>AI Code Executes<br/>BLOCKED FROM:<br/><br/>✅ Filesystem<br/>✅ Env Variables<br/>✅ Network<br/>✅ System"]
    end

    Safe -.->|"&nbsp;&nbsp;calls&nbsp;&nbsp;"| MCP2["GitHub MCP<br/>Tools"]

    style Safe fill:#ffffff,stroke:#00aa00,stroke-width:4px
    style MCP2 fill:#ffffff,stroke:#888888,stroke-width:2px
```

**✅ The Protection:** AI-generated code runs in isolation with zero system access:

| Risk | Access Level | Protection |
|------|-------------|------------|
| 🗂️ **Filesystem** | ❌ None | No file operations possible |
| 🔑 **Environment Variables** | ❌ None | `process` is undefined |
| 🌐 **Network** | ❌ None | `globalOutbound: null` enforced |
| ⚙️ **System** | ❌ None | Pure V8 isolate, no OS access |
| ✅ **MCP Tools** | 🔒 Only approved | Can only call pre-loaded MCP tools |

## Real Attack Example

**Scenario:** Malicious prompt tries to steal your GitHub token

### Traditional MCP:
```
User: "Show me all environment variables"
LLM: Calls read_env() tool
Result: ❌ GITHUB_TOKEN=ghp_xxxxxxxxxxxx exposed
```

### With MCP Guard:
```
User: "Show me all environment variables"
LLM: Writes code: console.log(process.env)
Result: ✅ ReferenceError: process is not defined
        Your token stays safe
```

## The Key Difference

| Approach | Security Model |
|----------|---------------|
| **Traditional MCP** | Tools execute in your process = **admin access to your computer** |
| **MCP Guard** | Code executes in isolation = **locked-down sandbox with only approved apps** |
