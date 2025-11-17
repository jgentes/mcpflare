# Environment Variable Setup Guide

This document explains how the improved environment variable setup process works in mcpguard.

## Overview

The setup process now includes:
1. **Interactive Environment Variable Selector** - Select env vars from `.env` file with typeahead/search
2. **IDE MCP Conflict Detection** - Warnings when MCPs are configured in both IDE and mcpguard

## Interactive Environment Variable Selection

When loading a new MCP, instead of manually typing JSON, you can now:

1. **See available env vars** from your `.env` file (with masked values)
2. **Use typeahead/search** to find env vars by typing part of the name
3. **Select by number** or by name
4. **Automatic `${VAR_NAME}` syntax** - Selected vars are stored as references to `.env` file

### Example Flow

```
MCP name: github
Command (e.g., npx): npx
Args (comma-separated, or press Enter for none): -y,@modelcontextprotocol/server-github

📋 Available environment variables from .env file:
  1. GITHUB_PERSONAL_ACCESS_TOKEN = ghp_...xxxx
  2. LOG_LEVEL = info

💡 Options:
  - Enter env var name or number to add (supports typeahead/search)
  - Enter "done" when finished
  - Enter "skip" to skip env vars
  - Enter "manual" to enter env vars as JSON
  - Use ${VAR_NAME} syntax to reference .env variables

Add env var (name/number, "done", "skip", or "manual"): 1
✅ Added: GITHUB_PERSONAL_ACCESS_TOKEN = ${GITHUB_PERSONAL_ACCESS_TOKEN}
Add env var (name/number, "done", "skip", or "manual"): done
```

## Design Philosophy

**No Hardcoded MCP Registry**: We intentionally don't maintain a hardcoded list of known MCPs because:
- MCPs can change their requirements over time
- Maintaining a registry would require constant updates
- Assumptions about how MCPs work could lead to errors
- Users should refer to their MCP's official documentation for env var requirements

Instead, the system:
- Shows you what env vars are available in your `.env` file
- Lets you select which ones to use
- Detects conflicts with IDE configurations (which are based on actual config files, not assumptions)

## IDE MCP Conflict Detection

When you load an MCP that's already configured in your IDE (Cursor, Claude Code, etc.), you'll see a warning:

```
⚠️  Warning: An MCP named "github" already exists in your Cursor configuration.
   If you're using mcpguard, consider disabling "github" in your IDE's MCP settings
   to avoid confusion. The IDE will use the real MCP, while mcpguard uses the sandboxed version.
```

### Why This Matters

- **IDE MCPs** run directly in your IDE and have full access to your system
- **mcpguard MCPs** run in isolated Cloudflare Workers with no network access
- Having both can be confusing - the LLM might not know which one to use

### Checking for Conflicts

Use the `conflicts` command to check for potential conflicts:

```
mcpguard> conflicts

🔍 Checking for potential IDE MCP conflicts (Cursor):

⚠️  "github" is configured in both your IDE and mcpguard
   Recommendation: Disable "github" in your IDE's MCP settings
   to avoid confusion. The IDE will use the real MCP, while mcpguard
   uses the sandboxed version.

💡 Tip: To disable an MCP in your IDE:
   1. Open your Cursor MCP configuration file
   2. Comment out or remove the "github" entry
   3. Restart your IDE
```

### Recommended Approach

1. **For development/testing**: Use mcpguard (sandboxed, safe)
2. **For production IDE use**: Use direct IDE MCP configuration
3. **Avoid both**: Disable the MCP in your IDE when using mcpguard

## Environment Variable Syntax

### Using `${VAR_NAME}` Syntax

When you select env vars from `.env` file, they're automatically stored as:

```json
{
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
  }
}
```

This means:
- The config file stores a **reference** to the env var
- The actual value is resolved from `.env` file at runtime
- **Never commit secrets** - they stay in `.env` file (which is in `.gitignore`)

### Manual JSON Input

You can still enter env vars manually as JSON:

```
Add env var (name/number, "done", "skip", or "manual"): manual
Environment variables as JSON (or press Enter for none): {"GITHUB_PERSONAL_ACCESS_TOKEN":"ghp_xxx"}
```

If the key exists in `.env`, it will be converted to `${VAR_NAME}` syntax automatically.

## Benefits

1. **Better UX**: No need to manually type JSON or remember env var names
2. **Typeahead**: Quick search/filter of available env vars
3. **Safety**: Values are masked when displayed
4. **Conflict Detection**: Warnings about IDE MCP conflicts (based on actual config files)
5. **Flexibility**: Can still use manual JSON input if needed
6. **No Assumptions**: Doesn't make assumptions about MCP requirements that could become outdated

## Future Enhancements

Potential improvements:
- **MCP Inspection**: Dynamically detect required env vars from MCP server (may be error-prone, requires careful implementation)
- **Auto-complete**: Better typeahead with fuzzy matching
- **Validation**: Check if required env vars are set before loading MCP (would need to be opt-in or based on actual MCP responses)

