# CURSOR AI AGENT IMPLEMENTATION PROMPT

## Project Overview

You are tasked with implementing **MCP Isolate Runner**, an enterprise-grade meta-MCP server that provides secure, isolated execution of other MCP servers using Cloudflare Workers isolates and code mode execution.

## What You're Building

A TypeScript/Node.js application that:

1. **Acts as an MCP Server** - Implements the Model Context Protocol to be used by AI agents
2. **Loads Other MCPs** - Spawns and manages external MCP server processes
3. **Creates Worker Isolates** - Uses Cloudflare's Worker Loader API to run code in sandboxed environments
4. **Converts MCPs to TypeScript** - Transforms MCP tool schemas into TypeScript API definitions
5. **Executes AI-Generated Code** - Runs TypeScript code in isolated Workers with binding-based MCP access
6. **Provides Security** - Enforces network isolation, validates code, and hides credentials
7. **Tracks Metrics** - Measures performance improvements vs traditional tool calling

## Implementation Documents

I've prepared 4 comprehensive implementation guides:

### 📄 Part 1: Project Setup & Core Types
- `IMPLEMENTATION_GUIDE_PART1.md`
- Package configuration
- TypeScript setup
- Type definitions
- Utilities (logger, errors, validation)
- Schema converter

### 📄 Part 2: MCP Handler & Server
- `IMPLEMENTATION_GUIDE_PART2.md`
- Worker Manager (core orchestration logic)
- MCP Protocol Handler
- Metrics Collector
- Server entry point
- Worker runtime code

### 📄 Part 3: Testing & Security
- `IMPLEMENTATION_GUIDE_PART3.md`
- Unit tests
- Integration tests
- Security tests
- Benchmark implementation

### 📄 Part 4: Documentation & CI/CD
- `IMPLEMENTATION_GUIDE_PART4.md`
- README.md
- Security documentation
- GitHub Actions workflows

### 📋 Project Specification
- `PROJECT_SPEC.md`
- Complete architecture
- Security requirements
- Performance targets
- Development phases

## Step-by-Step Implementation Instructions

### Phase 1: Initial Setup (Start Here)

1. **Read the Project Specification**
   - Open and review `PROJECT_SPEC.md`
   - Understand the architecture diagram
   - Review security requirements
   - Note the success criteria

2. **Create Project Structure**
   - Follow Step 1 in `IMPLEMENTATION_GUIDE_PART1.md`
   - Create all directories listed
   - This provides the scaffold for everything else

3. **Initialize Package**
   - Follow Steps 2-5 in `IMPLEMENTATION_GUIDE_PART1.md`
   - Set up `package.json`, `tsconfig.json`, `wrangler.toml`
   - Create `.env.example`
   - Install all dependencies

4. **Verify Setup**
   ```bash
   npm install
   npx tsc --noEmit  # Should compile with no errors
   ```

### Phase 2: Core Implementation

5. **Implement Type Definitions**
   - Follow Step 6 in `IMPLEMENTATION_GUIDE_PART1.md`
   - Create `src/types/mcp.ts`
   - Create `src/types/worker.ts`
   - Create `src/types/index.ts` to export all types

6. **Implement Utilities**
   - Follow Steps 7-9 in `IMPLEMENTATION_GUIDE_PART1.md`
   - Create logger (`src/utils/logger.ts`)
   - Create custom errors (`src/utils/errors.ts`)
   - Create validation (`src/utils/validation.ts`)

7. **Implement Schema Converter**
   - Follow Step 10 in `IMPLEMENTATION_GUIDE_PART1.md`
   - Create `src/server/schema-converter.ts`
   - This converts MCP schemas to TypeScript APIs

8. **Implement Worker Manager** ⚠️ CRITICAL COMPONENT
   - Follow Step 11 in `IMPLEMENTATION_GUIDE_PART1.md`
   - Create `src/server/worker-manager.ts`
   - This is the heart of the system - pay special attention
   - Note: The Worker Loader API integration is currently simulated
   - Real integration requires Wrangler's `env.LOADER.get()` API

### Phase 3: MCP Server Implementation

9. **Implement MCP Handler**
   - Follow Step 12 in `IMPLEMENTATION_GUIDE_PART2.md`
   - Create `src/server/mcp-handler.ts`
   - Implements all MCP tools (load_mcp_server, execute_code, etc.)

10. **Implement Metrics Collector**
    - Follow Step 13 in `IMPLEMENTATION_GUIDE_PART2.md`
    - Create `src/server/metrics-collector.ts`
    - Tracks performance and calculates token savings

11. **Create Server Entry Point**
    - Follow Step 14 in `IMPLEMENTATION_GUIDE_PART2.md`
    - Create `src/server/index.ts`
    - This is the main executable

12. **Implement Worker Runtime**
    - Follow Step 15 in `IMPLEMENTATION_GUIDE_PART2.md`
    - Create `src/worker/runtime.ts`
    - This runs inside Cloudflare Worker isolates

13. **Create GitHub MCP Example**
    - Follow Step 16 in `IMPLEMENTATION_GUIDE_PART2.md`
    - Create `examples/github-mcp/config.json`
    - Provides working example configuration

### Phase 4: Testing

14. **Set Up Testing Framework**
    - Install Vitest: `npm install -D vitest`
    - Create test directories

15. **Implement Unit Tests**
    - Follow Step 17 in `IMPLEMENTATION_GUIDE_PART3.md`
    - Create `tests/unit/schema-converter.test.ts`
    - Create `tests/unit/validation.test.ts`

16. **Implement Integration Tests**
    - Follow Step 18 in `IMPLEMENTATION_GUIDE_PART3.md`
    - Create `tests/integration/mcp-lifecycle.test.ts`
    - Tests complete MCP loading and execution flow

17. **Implement Security Tests**
    - Follow Step 19 in `IMPLEMENTATION_GUIDE_PART3.md`
    - Create `tests/security/isolation.test.ts`
    - Verifies isolation and security measures

18. **Implement Benchmarks**
    - Follow Step 20 in `IMPLEMENTATION_GUIDE_PART3.md`
    - Create `benchmarks/github-comparison.ts`
    - Measures performance vs traditional tool calling

19. **Run All Tests**
    ```bash
    npm run test:unit
    npm run test:integration  # Requires GITHUB_TOKEN
    npm run test:security
    npm run benchmark  # Requires GITHUB_TOKEN
    ```

### Phase 5: Documentation & Deployment

20. **Create README**
    - Follow Step 21 in `IMPLEMENTATION_GUIDE_PART4.md`
    - Create comprehensive `README.md`
    - Include usage examples, benchmarks, API reference

21. **Create Security Documentation**
    - Follow Step 22 in `IMPLEMENTATION_GUIDE_PART4.md`
    - Create `docs/security.md`
    - Document security model and best practices

22. **Set Up CI/CD**
    - Follow Step 23 in `IMPLEMENTATION_GUIDE_PART4.md`
    - Create `.github/workflows/ci.yml`
    - Automates testing and security scanning

23. **Create Additional Documentation**
    - Create `CONTRIBUTING.md`
    - Create `LICENSE` (MIT)
    - Create `CODE_OF_CONDUCT.md`

### Phase 6: Testing with Real GitHub MCP

24. **Configure GitHub Token**
    ```bash
    # Add to .env
    GITHUB_TOKEN=ghp_your_actual_token_here
    ```

25. **Start the Server**
    ```bash
    npm run dev
    ```

26. **Test from AI Agent (Cursor)**
    - Configure Cursor to use this MCP server
    - Test loading GitHub MCP
    - Test executing code against GitHub MCP
    - Compare metrics vs direct GitHub MCP usage

27. **Collect Benchmark Data**
    ```bash
    npm run benchmark
    ```
    - Document results
    - Update README with real numbers
    - Create charts/graphs

## Critical Implementation Notes

### 🚨 Worker Loader API Integration

The most complex part is integrating with Cloudflare's Worker Loader API. Currently, the implementation uses a **simulated** Worker execution in `worker-manager.ts`:

```typescript
private async executeInIsolate(
  mcpId: string,
  code: string,
  timeoutMs: number
): Promise<any> {
  // TODO: Replace with actual Worker Loader API integration
  // This should use env.LOADER.get() to load the Worker
  // and execute the code in a real isolate
  
  // Current: Simulated execution
  return {
    output: 'Simulated execution result',
    metrics: {
      mcp_calls_made: 1,
      tokens_saved_estimate: 500,
    },
  };
}
```

**To fully integrate:**

1. Set up Wrangler environment with Worker Loader binding
2. Use `env.LOADER.get(workerId, () => workerCode)` to create isolate
3. Get the Worker entrypoint: `const entrypoint = worker.getEntrypoint()`
4. Execute by calling: `await entrypoint.fetch(request)`
5. Parse response and extract results

### 🔒 Security Critical Areas

Pay special attention to:

1. **Code Validation** (`src/utils/validation.ts`)
   - Must block all dangerous patterns
   - Add more patterns as threats are discovered

2. **Worker Configuration** (`generateWorkerCode` in `worker-manager.ts`)
   - MUST set `globalOutbound: null`
   - MUST use binding-based MCP access only

3. **Input Validation**
   - All user inputs validated with Zod schemas
   - Never trust AI-generated code without validation

### 📊 Performance Targets

- **Isolate Startup**: < 10ms
- **Code Execution Overhead**: < 50ms
- **Token Reduction**: > 50% vs traditional tool calling
- **Success Rate**: > 99%

### 🧪 Testing Requirements

- **Unit Tests**: > 80% code coverage
- **Integration Tests**: All MCP tools tested end-to-end
- **Security Tests**: All isolation mechanisms verified
- **Benchmarks**: Real data from GitHub MCP comparison

## Expected Deliverables

1. ✅ Working TypeScript application
2. ✅ All tests passing
3. ✅ Benchmark results documented
4. ✅ Security audit clean
5. ✅ Comprehensive documentation
6. ✅ CI/CD pipeline configured
7. ✅ Example configurations
8. ✅ README with usage instructions

## Success Criteria

Your implementation is successful when:

1. ✅ Can load GitHub MCP into isolated Worker
2. ✅ Can execute TypeScript code against GitHub MCP
3. ✅ Code runs in isolated environment (no network access)
4. ✅ Demonstrates > 50% token reduction vs traditional tool calling
5. ✅ All security tests pass
6. ✅ All integration tests pass
7. ✅ Benchmarks show measurable improvement
8. ✅ Documentation is complete and accurate

## Getting Help

If you encounter issues:

1. **Review the Implementation Guides** - All steps are documented
2. **Check the Project Spec** - Architectural decisions explained
3. **Review Cloudflare Docs** - Worker Loader API documentation
4. **Test Incrementally** - Build and test each component
5. **Use Type System** - TypeScript will catch many errors

## Development Workflow

Recommended workflow:

```bash
# 1. Create feature
git checkout -b feature/component-name

# 2. Implement following guides
# (code implementation)

# 3. Run tests
npm run test:unit
npm run lint

# 4. Commit
git commit -m "feat: implement component-name"

# 5. Integration test
npm run test:integration

# 6. Push and create PR
git push origin feature/component-name
```

## Final Notes

This is a complex project with multiple moving parts:

- MCP protocol implementation
- Process management (spawning MCP servers)
- Cloudflare Workers integration
- TypeScript code generation
- Security isolation
- Performance monitoring

**Take it step by step.** Implement one component at a time, test thoroughly, and don't move forward until the current component works correctly.

The implementation guides provide complete, production-ready code for each component. Follow them carefully, understand what each piece does, and adapt as needed for your specific environment.

Good luck! 🚀

---

**Start with `IMPLEMENTATION_GUIDE_PART1.md` Step 1 and work sequentially through all steps.**
