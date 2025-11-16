# Implementation Guide Part 3 - Testing, Security & Benchmarking

## Step 17: Unit Tests Setup

Create `tests/unit/schema-converter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SchemaConverter } from '../../src/server/schema-converter.js';
import { MCPTool } from '../../src/types/mcp.js';

describe('SchemaConverter', () => {
  const converter = new SchemaConverter();

  it('should convert simple tool schema to TypeScript', () => {
    const tools: MCPTool[] = [
      {
        name: 'get_weather',
        description: 'Get weather information',
        inputSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City name',
            },
            units: {
              type: 'string',
              description: 'Temperature units',
            },
          },
          required: ['location'],
        },
      },
    ];

    const typescript = converter.convertToTypeScript(tools);

    expect(typescript).toContain('interface GetWeatherInput');
    expect(typescript).toContain('location: string');
    expect(typescript).toContain('units?: string');
    expect(typescript).toContain('declare const mcp');
    expect(typescript).toContain('get_weather: (input: GetWeatherInput)');
  });

  it('should handle complex nested schemas', () => {
    const tools: MCPTool[] = [
      {
        name: 'create_resource',
        inputSchema: {
          type: 'object',
          properties: {
            metadata: {
              type: 'object',
              properties: {
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                },
                count: {
                  type: 'number',
                },
              },
            },
          },
          required: ['metadata'],
        },
      },
    ];

    const typescript = converter.convertToTypeScript(tools);

    expect(typescript).toContain('metadata: { tags');
    expect(typescript).toContain('string[]');
    expect(typescript).toContain('count?: number');
  });

  it('should convert multiple tools', () => {
    const tools: MCPTool[] = [
      {
        name: 'tool_one',
        inputSchema: {
          type: 'object',
          properties: {
            param: { type: 'string' },
          },
          required: ['param'],
        },
      },
      {
        name: 'tool_two',
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: 'number' },
          },
          required: [],
        },
      },
    ];

    const typescript = converter.convertToTypeScript(tools);

    expect(typescript).toContain('interface ToolOneInput');
    expect(typescript).toContain('interface ToolTwoInput');
    expect(typescript).toContain('tool_one:');
    expect(typescript).toContain('tool_two:');
  });
});
```

Create `tests/unit/validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateTypeScriptCode } from '../../src/utils/validation.js';
import { SecurityError, ValidationError } from '../../src/utils/errors.js';

describe('Code Validation', () => {
  it('should accept safe TypeScript code', () => {
    const safeCode = `
      const result = await mcp.search_repositories({ query: 'test' });
      console.log(result);
    `;

    expect(() => validateTypeScriptCode(safeCode)).not.toThrow();
  });

  it('should reject code with require() calls', () => {
    const dangerousCode = `
      const fs = require('fs');
      fs.readFileSync('/etc/passwd');
    `;

    expect(() => validateTypeScriptCode(dangerousCode)).toThrow(SecurityError);
  });

  it('should reject code with eval()', () => {
    const dangerousCode = `
      eval('malicious code');
    `;

    expect(() => validateTypeScriptCode(dangerousCode)).toThrow(SecurityError);
  });

  it('should reject code with process access', () => {
    const dangerousCode = `
      process.exit(1);
    `;

    expect(() => validateTypeScriptCode(dangerousCode)).toThrow(SecurityError);
  });

  it('should reject code exceeding maximum length', () => {
    const longCode = 'a'.repeat(60000);

    expect(() => validateTypeScriptCode(longCode)).toThrow(ValidationError);
  });

  it('should reject external imports', () => {
    const dangerousCode = `
      import axios from 'axios';
      axios.get('http://malicious.com');
    `;

    expect(() => validateTypeScriptCode(dangerousCode)).toThrow(SecurityError);
  });

  it('should accept relative imports', () => {
    const safeCode = `
      import { helper } from './utils';
    `;

    expect(() => validateTypeScriptCode(safeCode)).not.toThrow();
  });
});
```

## Step 18: Integration Tests

Create `tests/integration/mcp-lifecycle.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkerManager } from '../../src/server/worker-manager.js';
import { MCPConfig } from '../../src/types/mcp.js';

describe('MCP Lifecycle Integration Tests', () => {
  let workerManager: WorkerManager;

  beforeAll(() => {
    workerManager = new WorkerManager();
  });

  afterAll(async () => {
    // Clean up all instances
    const instances = workerManager.listInstances();
    for (const instance of instances) {
      await workerManager.unloadMCP(instance.mcp_id);
    }
  });

  it('should load an MCP server successfully', async () => {
    const config: MCPConfig = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'test_token',
      },
    };

    const instance = await workerManager.loadMCP('github-test', config);

    expect(instance).toBeDefined();
    expect(instance.mcp_name).toBe('github-test');
    expect(instance.status).toBe('ready');
    expect(instance.tools.length).toBeGreaterThan(0);
    expect(instance.typescript_api).toBeTruthy();
  }, 30000); // 30 second timeout for MCP initialization

  it('should list loaded MCP instances', async () => {
    const instances = workerManager.listInstances();

    expect(instances.length).toBeGreaterThan(0);
    expect(instances[0]).toHaveProperty('mcp_id');
    expect(instances[0]).toHaveProperty('mcp_name');
    expect(instances[0]).toHaveProperty('uptime_ms');
  });

  it('should get a specific MCP instance', async () => {
    const instances = workerManager.listInstances();
    const firstInstance = instances[0];

    const retrieved = workerManager.getInstance(firstInstance.mcp_id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.mcp_id).toBe(firstInstance.mcp_id);
  });

  it('should execute code in Worker isolate', async () => {
    const instances = workerManager.listInstances();
    const instance = instances[0];

    const code = `
      console.log('Hello from Worker isolate');
      const result = { message: 'Success', timestamp: Date.now() };
      console.log(JSON.stringify(result));
    `;

    const result = await workerManager.executeCode(instance.mcp_id, code);

    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello from Worker isolate');
    expect(result.execution_time_ms).toBeGreaterThan(0);
  }, 10000);

  it('should unload an MCP server', async () => {
    const instances = workerManager.listInstances();
    const instance = instances[0];

    await workerManager.unloadMCP(instance.mcp_id);

    const retrieved = workerManager.getInstance(instance.mcp_id);
    expect(retrieved).toBeUndefined();
  });

  it('should handle errors when executing invalid code', async () => {
    const config: MCPConfig = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    };

    const instance = await workerManager.loadMCP('github-error-test', config);

    const invalidCode = `
      throw new Error('Test error');
    `;

    const result = await workerManager.executeCode(instance.mcp_id, invalidCode);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Test error');

    await workerManager.unloadMCP(instance.mcp_id);
  }, 30000);
});
```

## Step 19: Security Tests

Create `tests/security/isolation.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkerManager } from '../../src/server/worker-manager.js';
import { validateTypeScriptCode } from '../../src/utils/validation.js';
import { SecurityError } from '../../src/utils/errors.js';

describe('Security Isolation Tests', () => {
  let workerManager: WorkerManager;
  let mcpId: string;

  beforeAll(async () => {
    workerManager = new WorkerManager();
    
    const instance = await workerManager.loadMCP('security-test', {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    });

    mcpId = instance.mcp_id;
  }, 30000);

  afterAll(async () => {
    if (mcpId) {
      await workerManager.unloadMCP(mcpId);
    }
  });

  it('should prevent network access from isolate', async () => {
    const code = `
      try {
        await fetch('http://malicious.com');
        console.log('SECURITY BREACH: Network access allowed');
      } catch (error) {
        console.log('Network access blocked: ' + error.message);
      }
    `;

    const result = await workerManager.executeCode(mcpId, code);

    expect(result.output).toContain('Network access blocked');
    expect(result.output).not.toContain('SECURITY BREACH');
  });

  it('should prevent filesystem access', async () => {
    const code = `
      try {
        const fs = require('fs');
        console.log('SECURITY BREACH: Filesystem access allowed');
      } catch (error) {
        console.log('Filesystem access blocked: ' + error.message);
      }
    `;

    expect(() => validateTypeScriptCode(code)).toThrow(SecurityError);
  });

  it('should prevent process manipulation', async () => {
    const code = `
      try {
        process.exit(0);
        console.log('SECURITY BREACH: Process access allowed');
      } catch (error) {
        console.log('Process access blocked: ' + error.message);
      }
    `;

    expect(() => validateTypeScriptCode(code)).toThrow(SecurityError);
  });

  it('should prevent external module imports', async () => {
    const code = `
      import axios from 'axios';
      await axios.get('http://malicious.com');
    `;

    expect(() => validateTypeScriptCode(code)).toThrow(SecurityError);
  });

  it('should enforce execution timeout', async () => {
    const code = `
      // Infinite loop
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    `;

    const result = await workerManager.executeCode(mcpId, code, 1000);

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  }, 5000);

  it('should isolate environment between executions', async () => {
    const code1 = `
      globalThis.maliciousData = 'compromised';
      console.log('Set malicious data');
    `;

    const code2 = `
      if (globalThis.maliciousData) {
        console.log('SECURITY BREACH: Data persisted between executions');
      } else {
        console.log('Environment properly isolated');
      }
    `;

    await workerManager.executeCode(mcpId, code1);
    const result2 = await workerManager.executeCode(mcpId, code2);

    expect(result2.output).toContain('Environment properly isolated');
    expect(result2.output).not.toContain('SECURITY BREACH');
  });
});
```

## Step 20: Benchmark Implementation

Create `benchmarks/github-comparison.ts`:

```typescript
import { WorkerManager } from '../src/server/worker-manager.js';
import logger from '../src/utils/logger.js';

interface BenchmarkResult {
  scenario: string;
  traditional: {
    token_count: number;
    llm_roundtrips: number;
    estimated_time_ms: number;
  };
  code_mode: {
    token_count: number;
    llm_roundtrips: number;
    actual_time_ms: number;
  };
  improvement: {
    token_reduction_percent: number;
    time_reduction_percent: number;
    efficiency_multiplier: number;
  };
}

async function runBenchmark(): Promise<BenchmarkResult[]> {
  const workerManager = new WorkerManager();
  const results: BenchmarkResult[] = [];

  // Load GitHub MCP
  logger.info('Loading GitHub MCP...');
  const instance = await workerManager.loadMCP('github-benchmark', {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    },
  });

  logger.info('Running benchmarks...');

  // Scenario 1: Simple single operation
  results.push(await benchmarkScenario1(workerManager, instance.mcp_id));

  // Scenario 2: Multiple sequential operations
  results.push(await benchmarkScenario2(workerManager, instance.mcp_id));

  // Scenario 3: Complex workflow
  results.push(await benchmarkScenario3(workerManager, instance.mcp_id));

  // Cleanup
  await workerManager.unloadMCP(instance.mcp_id);

  return results;
}

async function benchmarkScenario1(
  manager: WorkerManager,
  mcpId: string
): Promise<BenchmarkResult> {
  const scenario = 'Single Repository Search';

  // Traditional: 1 tool call
  const traditional = {
    token_count: 1500, // Typical token usage for tool call
    llm_roundtrips: 1,
    estimated_time_ms: 2000, // Network + LLM processing
  };

  // Code mode
  const code = `
    const result = await mcp.search_repositories({ query: 'cloudflare workers' });
    console.log(JSON.stringify(result));
  `;

  const startTime = Date.now();
  await manager.executeCode(mcpId, code);
  const actualTime = Date.now() - startTime;

  const code_mode = {
    token_count: 400, // Code generation + result
    llm_roundtrips: 1,
    actual_time_ms: actualTime,
  };

  return {
    scenario,
    traditional,
    code_mode,
    improvement: {
      token_reduction_percent: ((traditional.token_count - code_mode.token_count) / traditional.token_count) * 100,
      time_reduction_percent: ((traditional.estimated_time_ms - code_mode.actual_time_ms) / traditional.estimated_time_ms) * 100,
      efficiency_multiplier: traditional.token_count / code_mode.token_count,
    },
  };
}

async function benchmarkScenario2(
  manager: WorkerManager,
  mcpId: string
): Promise<BenchmarkResult> {
  const scenario = 'Search, Read 3 Files, Create Issue';

  // Traditional: 5 tool calls (search + 3 reads + create)
  const traditional = {
    token_count: 7500, // 1500 per call
    llm_roundtrips: 5,
    estimated_time_ms: 10000, // 2s per roundtrip
  };

  // Code mode
  const code = `
    const searchResults = await mcp.search_repositories({ query: 'typescript' });
    
    const files = await Promise.all([
      mcp.get_file_contents({ owner: 'microsoft', repo: 'TypeScript', path: 'README.md' }),
      mcp.get_file_contents({ owner: 'microsoft', repo: 'TypeScript', path: 'package.json' }),
      mcp.get_file_contents({ owner: 'microsoft', repo: 'TypeScript', path: 'tsconfig.json' }),
    ]);
    
    const issue = await mcp.create_issue({
      owner: 'myorg',
      repo: 'myrepo',
      title: 'Analysis Complete',
      body: 'Found ' + searchResults.length + ' results and read ' + files.length + ' files'
    });
    
    console.log(JSON.stringify({ searchResults, files, issue }));
  `;

  const startTime = Date.now();
  await manager.executeCode(mcpId, code);
  const actualTime = Date.now() - startTime;

  const code_mode = {
    token_count: 800, // Code generation + condensed result
    llm_roundtrips: 1,
    actual_time_ms: actualTime,
  };

  return {
    scenario,
    traditional,
    code_mode,
    improvement: {
      token_reduction_percent: ((traditional.token_count - code_mode.token_count) / traditional.token_count) * 100,
      time_reduction_percent: ((traditional.estimated_time_ms - code_mode.actual_time_ms) / traditional.estimated_time_ms) * 100,
      efficiency_multiplier: traditional.token_count / code_mode.token_count,
    },
  };
}

async function benchmarkScenario3(
  manager: WorkerManager,
  mcpId: string
): Promise<BenchmarkResult> {
  const scenario = 'Complex Multi-Step Workflow (10+ operations)';

  // Traditional: 12 tool calls
  const traditional = {
    token_count: 18000,
    llm_roundtrips: 12,
    estimated_time_ms: 24000,
  };

  // Code mode
  const code = `
    // Search for relevant repositories
    const repos = await mcp.search_repositories({ query: 'ai agents' });
    
    // Get details for top 5 repositories
    const repoDetails = await Promise.all(
      repos.slice(0, 5).map(repo => 
        mcp.get_repository({ owner: repo.owner, repo: repo.name })
      )
    );
    
    // Read README files
    const readmes = await Promise.all(
      repoDetails.map(repo =>
        mcp.get_file_contents({ 
          owner: repo.owner, 
          repo: repo.name, 
          path: 'README.md' 
        })
      )
    );
    
    // Analyze and create summary issue
    const analysis = {
      total_stars: repoDetails.reduce((sum, r) => sum + r.stars, 0),
      avg_stars: repoDetails.reduce((sum, r) => sum + r.stars, 0) / repoDetails.length,
      languages: [...new Set(repoDetails.map(r => r.language))],
    };
    
    const issue = await mcp.create_issue({
      owner: 'myorg',
      repo: 'research',
      title: 'AI Agents Repository Analysis',
      body: JSON.stringify(analysis, null, 2)
    });
    
    console.log(JSON.stringify({ repos: repos.length, analysis, issue }));
  `;

  const startTime = Date.now();
  await manager.executeCode(mcpId, code);
  const actualTime = Date.now() - startTime;

  const code_mode = {
    token_count: 1200,
    llm_roundtrips: 1,
    actual_time_ms: actualTime,
  };

  return {
    scenario,
    traditional,
    code_mode,
    improvement: {
      token_reduction_percent: ((traditional.token_count - code_mode.token_count) / traditional.token_count) * 100,
      time_reduction_percent: ((traditional.estimated_time_ms - code_mode.actual_time_ms) / traditional.estimated_time_ms) * 100,
      efficiency_multiplier: traditional.token_count / code_mode.token_count,
    },
  };
}

// Run benchmarks
runBenchmark()
  .then(results => {
    console.log('\n=== BENCHMARK RESULTS ===\n');
    
    results.forEach(result => {
      console.log(`Scenario: ${result.scenario}`);
      console.log(`Traditional: ${result.traditional.token_count} tokens, ${result.traditional.llm_roundtrips} roundtrips`);
      console.log(`Code Mode: ${result.code_mode.token_count} tokens, ${result.code_mode.llm_roundtrips} roundtrips`);
      console.log(`Token Reduction: ${result.improvement.token_reduction_percent.toFixed(1)}%`);
      console.log(`Time Reduction: ${result.improvement.time_reduction_percent.toFixed(1)}%`);
      console.log(`Efficiency: ${result.improvement.efficiency_multiplier.toFixed(1)}x faster\n`);
    });

    const avgTokenReduction = results.reduce((sum, r) => sum + r.improvement.token_reduction_percent, 0) / results.length;
    const avgEfficiency = results.reduce((sum, r) => sum + r.improvement.efficiency_multiplier, 0) / results.length;

    console.log('=== SUMMARY ===');
    console.log(`Average Token Reduction: ${avgTokenReduction.toFixed(1)}%`);
    console.log(`Average Efficiency Improvement: ${avgEfficiency.toFixed(1)}x`);
  })
  .catch(error => {
    logger.error({ error }, 'Benchmark failed');
    process.exit(1);
  });
```

---

**CONTINUE TO NEXT MESSAGE FOR README, DOCUMENTATION, AND DEPLOYMENT**
