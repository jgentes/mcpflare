# Testing Guide - GitHub MCP Example

This guide walks you through testing MCP Guard with the GitHub MCP server step-by-step.

## Prerequisites Checklist

- [ ] Node.js 20+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] GitHub Personal Access Token created
- [ ] Token has `repo` scope enabled
- [ ] Project dependencies installed (`npm install`)
- [ ] Project built successfully (`npm run build`)

## Step-by-Step Testing

### 1. Set Up Environment

Create a `.env` file from the example:

**On Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**On Mac/Linux:**
```bash
cp .env.example .env
```

Then edit `.env` and replace `your_github_token_here` with your actual GitHub token:

```bash
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_actual_token_here
LOG_LEVEL=info
```

**Note**: The GitHub MCP server uses `GITHUB_PERSONAL_ACCESS_TOKEN` as the environment variable name. See the [official GitHub MCP Server documentation](https://github.com/github/github-mcp-server) for details.

**⚠️ Security Note**: Never commit your `.env` file. It's already in `.gitignore`.

### 2. Start the CLI

```bash
npm run cli
```

You should see:

```
╔═══════════════════════════════════════════════════════════╗
║              MCP Guard - Interactive CLI                  ║
╚═══════════════════════════════════════════════════════════╝

Type "help" for available commands.
Type "exit" to quit.

mcpguard>
```

### 3. Load GitHub MCP

At the prompt, type `load` and follow the prompts:

```
mcpguard> load
MCP name: github
Command (e.g., npx): npx
Args (comma-separated, or press Enter for none): -y,@modelcontextprotocol/server-github
Environment variables as JSON (or press Enter for none): {"GITHUB_PERSONAL_ACCESS_TOKEN":"ghp_your_token"}
```

**Expected Output:**

```
Loading MCP server...

⚠️  WARNING: MCP schema fetching is MOCKED. Real MCP protocol communication needs to be implemented.

✅ MCP server loaded successfully!
{
  "mcp_id": "550e8400-e29b-41d4-a716-446655440000",
  "mcp_name": "github",
  "status": "ready",
  "tools_count": 2,
  "available_tools": ["search_repositories", "create_issue"],
  "load_time_ms": 1234
}

📝 TypeScript API:
[TypeScript definitions will be shown here]
```

**Note**: The warning about mocked schema fetching is expected. The system uses predefined mock tools for now.

### 4. List Loaded MCPs

Type `list`:

```
mcpguard> list

📋 Loaded MCP Servers:
{
  "mcp_id": "550e8400-e29b-41d4-a716-446655440000",
  "mcp_name": "github",
  "status": "ready",
  "uptime_ms": 5000,
  "tools_count": 2,
  "created_at": "2025-01-15T10:30:00.000Z"
}
```

**Copy the `mcp_id`** - you'll need it for the next steps.

### 5. Get TypeScript API Schema

Type `schema`:

```
mcpguard> schema
MCP ID: 550e8400-e29b-41d4-a716-446655440000
```

You'll see the generated TypeScript API definitions that show how to use the MCP tools in code.

### 6. Execute Simple Code

Type `execute`:

```
mcpguard> execute
MCP ID: 550e8400-e29b-41d4-a716-446655440000
Enter TypeScript code (end with a blank line):
console.log('Hello from Worker isolate!');
const result = { message: 'Test successful', timestamp: Date.now() };
console.log(JSON.stringify(result));

Timeout (ms, default 30000): [Press Enter]

Executing code...

⚠️  WARNING: Worker execution is SIMULATED. Real Worker Loader API integration needed.

📊 Execution Result:
{
  "success": true,
  "output": "Hello from Worker isolate!\n{\"message\":\"Test successful\",\"timestamp\":1736946000000}",
  "execution_time_ms": 45,
  "metrics": {
    "mcp_calls_made": 1,
    "tokens_saved_estimate": 500
  }
}
```

### 7. Execute Code with MCP Tools (Mocked)

Try executing code that uses the MCP API:

```
mcpguard> execute
MCP ID: 550e8400-e29b-41d4-a716-446655440000
Enter TypeScript code (end with a blank line):
// Search for repositories
const repos = await mcp.search_repositories({ query: 'cloudflare workers' });
console.log('Found repositories:', JSON.stringify(repos, null, 2));

Timeout (ms, default 30000): [Press Enter]
```

**Note**: Since MCP calls are currently mocked, this will execute but won't make real GitHub API calls. However, you can see the execution flow and structure working.

### 8. View Metrics

Type `metrics`:

```
mcpguard> metrics

📊 Metrics:
{
  "global": {
    "total_executions": 2,
    "successful_executions": 2,
    "failed_executions": 0,
    "average_execution_time_ms": 50,
    "total_mcp_calls": 2,
    "estimated_tokens_saved": 1000
  },
  "per_mcp": [...],
  "summary": {
    "total_mcps_loaded": 1,
    "success_rate": 100,
    "average_tokens_saved_per_execution": 500
  }
}
```

### 9. Clean Up

When done testing, unload the MCP:

```
mcpguard> unload
MCP ID to unload: 550e8400-e29b-41d4-a716-446655440000

✅ MCP server 550e8400-e29b-41d4-a716-446655440000 unloaded successfully.
```

### 10. Exit

Type `exit`:

```
mcpguard> exit

👋 Goodbye!
```

## What You Should See

### ✅ Success Indicators

- MCP server loads without errors
- You can list loaded MCPs
- TypeScript API schema is generated
- Code execution completes successfully
- Metrics are collected
- No crashes or unhandled errors

### ⚠️ Expected Warnings

You'll see warnings about:
- **Mocked MCP schema fetching** - This is expected, real protocol communication needs to be implemented
- **Simulated Worker execution** - This is expected, real Worker Loader API integration needs to be completed

These warnings are informational and don't prevent testing the system structure.

## Troubleshooting

### "Failed to start MCP process" or "spawn npx ENOENT"

**Possible causes:**
- GitHub token is invalid or expired
- Token doesn't have required scopes
- Network connectivity issues
- npx command not found (installation issue)

**Solutions:**
1. Verify your GitHub token at https://github.com/settings/tokens
2. Ensure token has `repo` scope
3. Check internet connection
4. **Verify Node.js/npm/npx installation:**
   - Run `node --version`, `npm --version`, and `npx --version` - all should work
   - Make sure Node.js was installed with "Add to PATH" option
   - Restart your terminal/PowerShell after installing Node.js
   - If npx doesn't work, reinstall Node.js or add it to your PATH manually

### "MCP instance not found"

**Possible causes:**
- Wrong MCP ID entered
- MCP was already unloaded

**Solutions:**
1. Use `list` command to see current MCP IDs
2. Make sure you're using the correct ID

### "Code contains dangerous pattern"

**Possible causes:**
- Code includes blocked patterns (require, eval, process, etc.)

**Solutions:**
1. Review the code validation rules in `src/utils/validation.ts`
2. Remove dangerous patterns from your code
3. Use only allowed patterns (console.log, async/await, etc.)

## Next Steps

After successful testing:

1. **Review the Code** - Explore `src/` to understand the implementation
2. **Read Implementation Docs** - Check `README_IMPLEMENTATION.md` for details
3. **Contribute** - Help implement real MCP protocol communication
4. **Test with Real MCPs** - Once real protocol is implemented, test with actual GitHub MCP

## Additional Resources

- **README.md** - Main user guide
- **README_IMPLEMENTATION.md** - Implementation details
- **PROJECT_SPEC.md** - Full project specification
- **IMPLEMENTATION_STATUS.md** - Current status and TODOs

---

**Happy Testing!** 🚀

