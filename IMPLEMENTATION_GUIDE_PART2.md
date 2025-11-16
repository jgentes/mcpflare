# Implementation Guide Part 2 - MCP Handler & Server

## Step 12: MCP Protocol Handler

Create `src/server/mcp-handler.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { WorkerManager } from './worker-manager.js';
import { MetricsCollector } from './metrics-collector.js';
import {
  LoadMCPRequestSchema,
  ExecuteCodeRequestSchema,
} from '../types/mcp.js';
import { validateInput, validateTypeScriptCode } from '../utils/validation.js';
import logger from '../utils/logger.js';
import { MCPIsolateError } from '../utils/errors.js';

export class MCPHandler {
  private server: Server;
  private workerManager: WorkerManager;
  private metricsCollector: MetricsCollector;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-isolate-runner',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.workerManager = new WorkerManager();
    this.metricsCollector = new MetricsCollector();

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Listing available tools');
      
      return {
        tools: [
          {
            name: 'load_mcp_server',
            description: 'Load an MCP server into a secure isolated Worker environment for code mode execution',
            inputSchema: {
              type: 'object',
              properties: {
                mcp_name: {
                  type: 'string',
                  description: 'Unique identifier for this MCP instance (alphanumeric, hyphens, underscores only)',
                },
                mcp_config: {
                  type: 'object',
                  description: 'MCP server connection configuration',
                  properties: {
                    command: {
                      type: 'string',
                      description: 'Command to launch the MCP server (e.g., "npx", "node", "python")',
                    },
                    args: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Arguments for the MCP server command',
                    },
                    env: {
                      type: 'object',
                      description: 'Environment variables for the MCP server',
                    },
                  },
                  required: ['command'],
                },
              },
              required: ['mcp_name', 'mcp_config'],
            },
          },
          {
            name: 'execute_code',
            description: 'Execute TypeScript code in a sandboxed Worker isolate with access to a loaded MCP server. Use console.log() to return results.',
            inputSchema: {
              type: 'object',
              properties: {
                mcp_id: {
                  type: 'string',
                  description: 'UUID of the loaded MCP server (returned from load_mcp_server)',
                },
                code: {
                  type: 'string',
                  description: 'TypeScript code to execute. Must use the mcp API object to call MCP tools. Use console.log() to output results.',
                },
                timeout_ms: {
                  type: 'number',
                  description: 'Execution timeout in milliseconds (default: 30000, max: 60000)',
                  default: 30000,
                },
              },
              required: ['mcp_id', 'code'],
            },
          },
          {
            name: 'list_available_mcps',
            description: 'List all MCP servers currently loaded in Worker isolates',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_mcp_schema',
            description: 'Get the TypeScript API definition for a loaded MCP server',
            inputSchema: {
              type: 'object',
              properties: {
                mcp_id: {
                  type: 'string',
                  description: 'UUID of the loaded MCP server',
                },
              },
              required: ['mcp_id'],
            },
          },
          {
            name: 'unload_mcp_server',
            description: 'Unload an MCP server and clean up its Worker isolate',
            inputSchema: {
              type: 'object',
              properties: {
                mcp_id: {
                  type: 'string',
                  description: 'UUID of the loaded MCP server to unload',
                },
              },
              required: ['mcp_id'],
            },
          },
          {
            name: 'get_metrics',
            description: 'Get performance metrics and statistics for MCP operations',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.info({ tool: name, args }, 'Tool called');

      try {
        switch (name) {
          case 'load_mcp_server':
            return await this.handleLoadMCP(args);
          
          case 'execute_code':
            return await this.handleExecuteCode(args);
          
          case 'list_available_mcps':
            return await this.handleListMCPs();
          
          case 'get_mcp_schema':
            return await this.handleGetSchema(args);
          
          case 'unload_mcp_server':
            return await this.handleUnloadMCP(args);
          
          case 'get_metrics':
            return await this.handleGetMetrics();
          
          default:
            throw new MCPIsolateError(
              `Unknown tool: ${name}`,
              'UNKNOWN_TOOL',
              404
            );
        }
      } catch (error) {
        logger.error({ error, tool: name }, 'Tool execution failed');

        if (error instanceof MCPIsolateError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: error.message,
                  code: error.code,
                  details: error.details,
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Internal server error',
                message: error.message,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleLoadMCP(args: any) {
    const validated = validateInput(LoadMCPRequestSchema, args);
    
    const startTime = Date.now();
    const instance = await this.workerManager.loadMCP(
      validated.mcp_name,
      validated.mcp_config
    );
    const loadTime = Date.now() - startTime;

    this.metricsCollector.recordMCPLoad(instance.mcp_id, loadTime);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            mcp_id: instance.mcp_id,
            mcp_name: instance.mcp_name,
            status: instance.status,
            tools_count: instance.tools.length,
            typescript_api: instance.typescript_api,
            available_tools: instance.tools.map(t => t.name),
            load_time_ms: loadTime,
          }, null, 2),
        },
      ],
    };
  }

  private async handleExecuteCode(args: any) {
    const validated = validateInput(ExecuteCodeRequestSchema, args);
    
    // Validate code for security
    validateTypeScriptCode(validated.code);

    const startTime = Date.now();
    const result = await this.workerManager.executeCode(
      validated.mcp_id,
      validated.code,
      validated.timeout_ms
    );

    this.metricsCollector.recordExecution(
      validated.mcp_id,
      result.execution_time_ms,
      result.success,
      result.metrics?.mcp_calls_made || 0
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleListMCPs() {
    const instances = this.workerManager.listInstances();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            mcps: instances.map(instance => ({
              mcp_id: instance.mcp_id,
              mcp_name: instance.mcp_name,
              status: instance.status,
              uptime_ms: instance.uptime_ms,
              tools_count: instance.tools.length,
              created_at: instance.created_at.toISOString(),
            })),
            total_count: instances.length,
          }, null, 2),
        },
      ],
    };
  }

  private async handleGetSchema(args: any) {
    const { mcp_id } = args;

    if (!mcp_id || typeof mcp_id !== 'string') {
      throw new MCPIsolateError(
        'mcp_id is required and must be a string',
        'INVALID_INPUT',
        400
      );
    }

    const instance = this.workerManager.getInstance(mcp_id);

    if (!instance) {
      throw new MCPIsolateError(
        `MCP instance not found: ${mcp_id}`,
        'NOT_FOUND',
        404
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            mcp_id: instance.mcp_id,
            mcp_name: instance.mcp_name,
            typescript_api: instance.typescript_api,
            tools: instance.tools,
          }, null, 2),
        },
      ],
    };
  }

  private async handleUnloadMCP(args: any) {
    const { mcp_id } = args;

    if (!mcp_id || typeof mcp_id !== 'string') {
      throw new MCPIsolateError(
        'mcp_id is required and must be a string',
        'INVALID_INPUT',
        400
      );
    }

    await this.workerManager.unloadMCP(mcp_id);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `MCP server ${mcp_id} unloaded successfully`,
          }, null, 2),
        },
      ],
    };
  }

  private async handleGetMetrics() {
    const metrics = this.metricsCollector.getMetrics();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(metrics, null, 2),
        },
      ],
    };
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('MCP Isolate Runner server started');
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down gracefully...');
      await this.server.close();
      process.exit(0);
    });
  }
}
```

## Step 13: Metrics Collector

Create `src/server/metrics-collector.ts`:

```typescript
import logger from '../utils/logger.js';

interface ExecutionMetrics {
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  total_execution_time_ms: number;
  average_execution_time_ms: number;
  total_mcp_calls: number;
  estimated_tokens_saved: number;
}

interface MCPMetrics {
  mcp_id: string;
  load_time_ms: number;
  executions: ExecutionMetrics;
}

export class MetricsCollector {
  private mcpMetrics: Map<string, MCPMetrics> = new Map();
  private globalMetrics: ExecutionMetrics = {
    total_executions: 0,
    successful_executions: 0,
    failed_executions: 0,
    total_execution_time_ms: 0,
    average_execution_time_ms: 0,
    total_mcp_calls: 0,
    estimated_tokens_saved: 0,
  };

  recordMCPLoad(mcpId: string, loadTimeMs: number): void {
    this.mcpMetrics.set(mcpId, {
      mcp_id: mcpId,
      load_time_ms: loadTimeMs,
      executions: {
        total_executions: 0,
        successful_executions: 0,
        failed_executions: 0,
        total_execution_time_ms: 0,
        average_execution_time_ms: 0,
        total_mcp_calls: 0,
        estimated_tokens_saved: 0,
      },
    });

    logger.debug({ mcpId, loadTimeMs }, 'MCP load metrics recorded');
  }

  recordExecution(
    mcpId: string,
    executionTimeMs: number,
    success: boolean,
    mcpCallsMade: number
  ): void {
    const mcpMetric = this.mcpMetrics.get(mcpId);

    if (mcpMetric) {
      mcpMetric.executions.total_executions++;
      
      if (success) {
        mcpMetric.executions.successful_executions++;
      } else {
        mcpMetric.executions.failed_executions++;
      }

      mcpMetric.executions.total_execution_time_ms += executionTimeMs;
      mcpMetric.executions.average_execution_time_ms =
        mcpMetric.executions.total_execution_time_ms /
        mcpMetric.executions.total_executions;
      
      mcpMetric.executions.total_mcp_calls += mcpCallsMade;

      // Estimate tokens saved based on MCP calls
      // Assumption: Each traditional tool call uses ~1500 tokens
      // Code mode uses ~300 tokens + ~100 per result
      const traditionalTokens = mcpCallsMade * 1500;
      const codeModeTokens = 300 + (mcpCallsMade * 100);
      const tokensSaved = Math.max(0, traditionalTokens - codeModeTokens);
      
      mcpMetric.executions.estimated_tokens_saved += tokensSaved;
    }

    // Update global metrics
    this.globalMetrics.total_executions++;
    
    if (success) {
      this.globalMetrics.successful_executions++;
    } else {
      this.globalMetrics.failed_executions++;
    }

    this.globalMetrics.total_execution_time_ms += executionTimeMs;
    this.globalMetrics.average_execution_time_ms =
      this.globalMetrics.total_execution_time_ms /
      this.globalMetrics.total_executions;
    
    this.globalMetrics.total_mcp_calls += mcpCallsMade;

    const traditionalTokens = mcpCallsMade * 1500;
    const codeModeTokens = 300 + (mcpCallsMade * 100);
    const tokensSaved = Math.max(0, traditionalTokens - codeModeTokens);
    
    this.globalMetrics.estimated_tokens_saved += tokensSaved;

    logger.debug(
      { mcpId, executionTimeMs, success, mcpCallsMade, tokensSaved },
      'Execution metrics recorded'
    );
  }

  getMetrics() {
    const mcpMetricsArray = Array.from(this.mcpMetrics.values());

    return {
      global: this.globalMetrics,
      per_mcp: mcpMetricsArray,
      summary: {
        total_mcps_loaded: mcpMetricsArray.length,
        success_rate:
          this.globalMetrics.total_executions > 0
            ? (this.globalMetrics.successful_executions /
                this.globalMetrics.total_executions) *
              100
            : 0,
        average_tokens_saved_per_execution:
          this.globalMetrics.total_executions > 0
            ? this.globalMetrics.estimated_tokens_saved /
              this.globalMetrics.total_executions
            : 0,
      },
    };
  }

  resetMetrics(): void {
    this.mcpMetrics.clear();
    this.globalMetrics = {
      total_executions: 0,
      successful_executions: 0,
      failed_executions: 0,
      total_execution_time_ms: 0,
      average_execution_time_ms: 0,
      total_mcp_calls: 0,
      estimated_tokens_saved: 0,
    };

    logger.info('Metrics reset');
  }
}
```

## Step 14: Main Server Entry Point

Create `src/server/index.ts`:

```typescript
#!/usr/bin/env node

import { MCPHandler } from './mcp-handler.js';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  try {
    logger.info('Starting MCP Isolate Runner...');

    const handler = new MCPHandler();
    await handler.start();

    logger.info('MCP Isolate Runner is ready to accept connections');
  } catch (error) {
    logger.error({ error }, 'Failed to start MCP Isolate Runner');
    process.exit(1);
  }
}

main();
```

## Step 15: Worker Runtime Code

Create `src/worker/runtime.ts`:

```typescript
/**
 * Worker Isolate Runtime
 * 
 * This code runs inside Cloudflare Worker isolates and executes
 * AI-generated TypeScript code with access to MCP server bindings.
 */

interface Env {
  MCP_ID: string;
  LOADER: any; // Worker Loader binding
  [key: string]: any; // MCP bindings
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // CORS headers for development
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: corsHeaders,
      });
    }

    try {
      const { code, timeout = 30000 } = await request.json() as { 
        code: string; 
        timeout?: number;
      };

      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;

      console.log = (...args: any[]) => {
        logs.push(args.map(a => 
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' '));
      };

      console.error = (...args: any[]) => {
        logs.push('ERROR: ' + args.map(a => 
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' '));
      };

      console.warn = (...args: any[]) => {
        logs.push('WARN: ' + args.map(a => 
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' '));
      };

      let result: any;
      let mcpCallCount = 0;

      try {
        // Create execution context with timeout
        const executeWithTimeout = async () => {
          // Wrap MCP bindings to count calls
          const mcpProxy = new Proxy(env, {
            get(target, prop) {
              if (typeof prop === 'string' && prop !== 'MCP_ID' && prop !== 'LOADER') {
                return new Proxy(target[prop], {
                  get(mcpTarget, mcpProp) {
                    const original = mcpTarget[mcpProp];
                    if (typeof original === 'function') {
                      return async (...args: any[]) => {
                        mcpCallCount++;
                        return await original.apply(mcpTarget, args);
                      };
                    }
                    return original;
                  },
                });
              }
              return target[prop];
            },
          });

          // Execute the code
          const asyncFunction = new Function('env', 'mcp', `
            return (async () => {
              ${code}
            })();
          `);

          result = await asyncFunction(env, mcpProxy);
          return result;
        };

        // Execute with timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Execution timeout')), timeout)
        );

        await Promise.race([
          executeWithTimeout(),
          timeoutPromise,
        ]);

        return new Response(JSON.stringify({
          success: true,
          output: logs.join('\n'),
          result: result !== undefined ? result : null,
          metrics: {
            mcp_calls_made: mcpCallCount,
            tokens_saved_estimate: calculateTokensSaved(mcpCallCount),
          },
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });

      } catch (executionError: any) {
        return new Response(JSON.stringify({
          success: false,
          error: executionError.message,
          stack: executionError.stack,
          output: logs.join('\n'),
          metrics: {
            mcp_calls_made: mcpCallCount,
            tokens_saved_estimate: 0,
          },
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
      }

    } catch (error: any) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to parse request',
        message: error.message,
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
  },
};

function calculateTokensSaved(mcpCalls: number): number {
  // Traditional tool calling: ~1500 tokens per call
  const traditionalTokens = mcpCalls * 1500;
  
  // Code mode: ~300 tokens for code + ~100 tokens per result
  const codeModeTokens = 300 + (mcpCalls * 100);
  
  return Math.max(0, traditionalTokens - codeModeTokens);
}
```

## Step 16: Example Configuration for GitHub MCP

Create `examples/github-mcp/config.json`:

```json
{
  "mcp_name": "github",
  "mcp_config": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  },
  "description": "GitHub MCP server for repository operations",
  "example_usage": {
    "load": {
      "tool": "load_mcp_server",
      "arguments": {
        "mcp_name": "github",
        "mcp_config": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-github"],
          "env": {
            "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
          }
        }
      }
    },
    "execute_search_and_create_issue": {
      "tool": "execute_code",
      "arguments": {
        "mcp_id": "<returned-from-load>",
        "code": "const searchResults = await mcp.search_repositories({ query: 'cloudflare workers' });\nconsole.log('Found repositories:', searchResults);\n\nconst issue = await mcp.create_issue({\n  owner: 'myorg',\n  repo: 'myrepo',\n  title: 'Found interesting repos',\n  body: JSON.stringify(searchResults, null, 2)\n});\n\nconsole.log('Created issue:', issue);"
      }
    }
  }
}
```

---

**CONTINUE TO NEXT MESSAGE FOR TESTING AND BENCHMARKING IMPLEMENTATION**
