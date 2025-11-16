# Troubleshooting Guide

## Understanding Error Phases

The execution flow has three phases:
1. **Our MCP** - Generate worker code and write files
2. **Wrangler** - Build and start the dev server (includes TypeScript compilation)
3. **Target MCP** - Execute code in the worker and call the actual MCP

### Build Errors vs Runtime Errors

**Build Errors** (TypeScript compilation failures):
- Occur during the **Wrangler** phase
- Examples: syntax errors, type errors, missing declarations
- Error messages include: "Build failed", "compilation failed", "must be initialized"
- These happen **before** the worker starts executing

**Runtime Errors** (execution failures):
- Occur during the **Target MCP** phase
- Examples: MCP call failures, timeout errors, logic errors
- These happen **after** the worker starts executing

## Testing MCP Directly

To isolate whether an issue is with your implementation or the MCP itself, you can test the MCP directly:

### Method 1: Test MCP via MCP SDK Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testMCPDirectly() {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'your-token-here'
    }
  });

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  
  // List tools
  const tools = await client.listTools();
  console.log('Available tools:', tools.tools.map(t => t.name));
  
  // Call a tool directly
  const result = await client.callTool({
    name: 'search_repositories',
    arguments: { query: 'cloudflare workers' }
  });
  
  console.log('Result:', result);
  
  await transport.close();
}
```

### Method 2: Test with Wrangler Directly

Create a test worker file to see if the issue is with how we wrap user code:

```typescript
// test-worker.ts
export default {
  async fetch(request: Request) {
    // Your user code here - test if it compiles
    const code = `
      console.log('Hello from Worker isolate!');
      const result = { message: 'Test successful', timestamp: Date.now() };
      console.log(JSON.stringify(result));
    `;
    
    // Wrap in function like we do
    const wrapped = `
      export default async function execute(mcp: any, env: any) {
        ${code}
      }
    `;
    
    // This should fail with the same error if it's a syntax issue
    return new Response('OK');
  }
};
```

Then test with:
```bash
npx wrangler dev test-worker.ts
```

## Common Issues

### Issue: Build errors showing in wrong phase

**Symptom**: Error shows "Our MCP" phase failed instead of "Wrangler" phase

**Cause**: Error detection logic not recognizing build errors

**Fix**: The error detection now checks for:
- "Build failed" in stderr
- "TypeScript compilation failed" in error message
- `error.isBuildError === true`

### Issue: Syntax errors in user code

**Symptom**: "The constant X must be initialized" or similar TypeScript errors

**Cause**: User code has syntax errors (e.g., split variable declarations)

**Solution**: 
1. Check the error message - it will show the file and line number
2. Verify your code syntax is correct
3. Common issues:
   - Missing `const`/`let`/`var` declarations
   - Split declarations (e.g., `esult = ... const r` should be `const result = ...`)
   - Unclosed brackets/braces/parentheses
   - Missing semicolons

### Issue: Code works in Node.js but fails in Worker

**Cause**: Cloudflare Workers have different APIs and limitations

**Differences**:
- No `process`, `Buffer`, `fs`, etc.
- Must use `fetch` for HTTP requests
- No `new Function()` or `eval()` (blocked)
- Module imports must be static (we work around this with separate files)

**Solution**: Ensure code uses Worker-compatible APIs

## Cloudflare Worker Loader API

### Current Implementation

We're using Wrangler's dev server to:
1. Compile TypeScript to JavaScript (via esbuild)
2. Start a local worker server
3. Execute code via HTTP requests

### Worker Loader API (Beta)

The Worker Loader API allows dynamic code loading at runtime, but:
- **Status**: Closed beta (requires signup)
- **Local**: Available with `wrangler dev` and `workerd`
- **Production**: Requires beta access

**Documentation**: https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/

### Our Approach

We use a workaround:
1. Write user code to a separate TypeScript file (`user-code.ts`)
2. Import it as a module in the worker (`import('./user-code.js')`)
3. This avoids `new Function()` which is blocked in Workers

**Why this works**:
- TypeScript files are compiled by Wrangler/esbuild
- Module imports are allowed (unlike dynamic code execution)
- Each execution gets a fresh isolate

## Debugging Tips

### 1. Enable Verbose Logging

```bash
npm run dev -- --verbose
# or
CLI_MODE=true LOG_LEVEL=debug npm run dev
```

### 2. Check Wrangler Output

The error formatter shows Wrangler's stderr. Look for:
- Build errors (syntax, type errors)
- Runtime errors (execution failures)
- Process exit codes

### 3. Test Code Isolation

Try the same code:
- In Node.js directly
- In a simple Wrangler worker
- Through our system

This helps identify if the issue is:
- Code syntax (fails everywhere)
- Worker environment (fails in Workers)
- Our implementation (only fails in our system)

### 4. Check File Generation

The system creates temporary files in:
- `%TEMP%\mcp-worker-*` (Windows)
- `/tmp/mcp-worker-*` (Unix)

You can inspect these to see:
- Generated worker code
- User code wrapper
- Wrangler configuration

## Getting Help

If issues persist:

1. **Check logs**: Enable verbose mode and review full error output
2. **Test MCP directly**: Use Method 1 above to verify MCP works
3. **Test code directly**: Use Method 2 above to verify code compiles
4. **Review Cloudflare docs**: Check for API changes or limitations
5. **Check Worker Loader API status**: Verify if beta access is needed

