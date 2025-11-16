# Implementation Guide for Cursor AI Agent

## Overview

This document provides step-by-step instructions for implementing the MCP Isolate Runner. Follow these instructions sequentially to build a production-ready, enterprise-grade MCP execution environment.

## Prerequisites

Before starting implementation, ensure:

1. Node.js 20+ or Bun installed
2. Wrangler CLI installed (`npm install -g wrangler`)
3. Git initialized in project directory
4. TypeScript 5+ configured

## Project Initialization

### Step 1: Create Project Structure

Create the following directory structure:

```bash
mcp-isolate-runner/
├── src/
│   ├── server/
│   │   ├── index.ts              # Main MCP server entry point
│   │   ├── mcp-handler.ts        # MCP protocol implementation
│   │   ├── worker-manager.ts     # Worker Loader integration
│   │   ├── schema-converter.ts   # MCP to TypeScript converter
│   │   ├── metrics-collector.ts  # Performance metrics
│   │   └── security.ts           # Security utilities
│   ├── worker/
│   │   ├── runtime.ts            # Worker isolate runtime code
│   │   └── bindings.ts           # RPC binding handlers
│   ├── types/
│   │   ├── mcp.ts               # MCP-related types
│   │   ├── worker.ts            # Worker-related types
│   │   └── index.ts             # Export all types
│   └── utils/
│       ├── logger.ts            # Structured logging
│       ├── validation.ts        # Input validation
│       └── errors.ts            # Custom error classes
├── tests/
│   ├── unit/
│   ├── integration/
│   └── security/
├── examples/
│   └── github-mcp/
│       └── config.json
├── benchmarks/
│   └── github-comparison.ts
├── docs/
├── package.json
├── tsconfig.json
├── wrangler.toml
├── .env.example
└── README.md
```

### Step 2: Initialize Package Configuration

Create `package.json`:

```json
{
  "name": "mcp-isolate-runner",
  "version": "0.1.0",
  "description": "Enterprise-grade MCP server providing secure, isolated execution using Cloudflare Workers",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "mcp-isolate": "dist/cli/index.js"
  },
  "scripts": {
    "dev": "tsx src/server/index.ts",
    "build": "tsc",
    "test": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:security": "vitest run tests/security",
    "lint": "eslint src --ext ts",
    "format": "prettier --write 'src/**/*.ts'",
    "worker:dev": "wrangler dev",
    "benchmark": "tsx benchmarks/github-comparison.ts"
  },
  "keywords": [
    "mcp",
    "model-context-protocol",
    "ai-agents",
    "cloudflare-workers",
    "isolate",
    "security",
    "code-mode"
  ],
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.4",
    "pino": "^8.16.2",
    "pino-pretty": "^10.2.3",
    "dotenv": "^16.3.1",
    "typescript": "^5.3.3"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "vitest": "^1.0.4",
    "eslint": "^8.55.0",
    "@typescript-eslint/parser": "^6.14.0",
    "@typescript-eslint/eslint-plugin": "^6.14.0",
    "prettier": "^3.1.1",
    "wrangler": "^3.80.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### Step 3: TypeScript Configuration

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false,
    "outDir": "dist",
    "rootDir": "src",
    "removeComments": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Step 4: Wrangler Configuration

Create `wrangler.toml`:

```toml
name = "mcp-isolate-runner"
main = "src/worker/runtime.ts"
compatibility_date = "2025-06-01"

[env.development]
workers_dev = true

[[worker_loaders]]
binding = "LOADER"
```

### Step 5: Environment Configuration

Create `.env.example`:

```bash
# MCP Isolate Runner Configuration

# Server Configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Security
ALLOWED_ORIGINS=http://localhost:*
MAX_EXECUTION_TIME_MS=30000
MAX_MEMORY_MB=128
MAX_CONCURRENT_ISOLATES=100

# Metrics
ENABLE_METRICS=true
METRICS_INTERVAL_MS=60000

# GitHub MCP Configuration (for testing)
GITHUB_TOKEN=your_github_token_here
GITHUB_MCP_COMMAND=npx
GITHUB_MCP_ARGS=-y @modelcontextprotocol/server-github
```

## Core Implementation

### Step 6: Type Definitions

Create `src/types/mcp.ts`:

```typescript
import { z } from 'zod';

// MCP Tool Schema
export const MCPToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.any()),
    required: z.array(z.string()).optional(),
  }),
});

export type MCPTool = z.infer<typeof MCPToolSchema>;

// MCP Configuration
export const MCPConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

export type MCPConfig = z.infer<typeof MCPConfigSchema>;

// Load MCP Request
export const LoadMCPRequestSchema = z.object({
  mcp_name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/),
  mcp_config: MCPConfigSchema,
});

export type LoadMCPRequest = z.infer<typeof LoadMCPRequestSchema>;

// Execute Code Request
export const ExecuteCodeRequestSchema = z.object({
  mcp_id: z.string().uuid(),
  code: z.string().min(1).max(50000),
  timeout_ms: z.number().min(100).max(60000).default(30000),
});

export type ExecuteCodeRequest = z.infer<typeof ExecuteCodeRequestSchema>;

// Execution Result
export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  execution_time_ms: number;
  metrics: {
    mcp_calls_made: number;
    tokens_saved_estimate: number;
  };
}

// MCP Instance
export interface MCPInstance {
  mcp_id: string;
  mcp_name: string;
  status: 'initializing' | 'ready' | 'error' | 'stopped';
  worker_id?: string;
  typescript_api: string;
  tools: MCPTool[];
  created_at: Date;
  uptime_ms: number;
}
```

Create `src/types/worker.ts`:

```typescript
export interface WorkerCode {
  compatibilityDate: string;
  compatibilityFlags?: string[];
  experimental?: boolean;
  mainModule: string;
  modules: Record<string, string | ModuleContent>;
  env?: Record<string, any>;
  globalOutbound?: any;
}

export type ModuleContent =
  | { js: string }
  | { cjs: string }
  | { py: string }
  | { text: string }
  | { data: ArrayBuffer }
  | { json: object };

export interface WorkerStub {
  getEntrypoint(name?: string, options?: { props?: any }): any;
}

export interface WorkerLoader {
  get(
    id: string,
    getCodeCallback: () => Promise<WorkerCode>
  ): WorkerStub;
}
```

### Step 7: Logger Utility

Create `src/utils/logger.ts`:

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  },
});

export default logger;
```

### Step 8: Custom Errors

Create `src/utils/errors.ts`:

```typescript
export class MCPIsolateError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'MCPIsolateError';
  }
}

export class ValidationError extends MCPIsolateError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class WorkerError extends MCPIsolateError {
  constructor(message: string, details?: any) {
    super(message, 'WORKER_ERROR', 500, details);
    this.name = 'WorkerError';
  }
}

export class MCPConnectionError extends MCPIsolateError {
  constructor(message: string, details?: any) {
    super(message, 'MCP_CONNECTION_ERROR', 502, details);
    this.name = 'MCPConnectionError';
  }
}

export class SecurityError extends MCPIsolateError {
  constructor(message: string, details?: any) {
    super(message, 'SECURITY_ERROR', 403, details);
    this.name = 'SecurityError';
  }
}
```

### Step 9: Input Validation

Create `src/utils/validation.ts`:

```typescript
import { z } from 'zod';
import { ValidationError } from './errors.js';
import logger from './logger.js';

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({ error: error.errors }, 'Validation failed');
      throw new ValidationError(
        'Invalid input parameters',
        error.errors
      );
    }
    throw error;
  }
}

// Code security validation
export function validateTypeScriptCode(code: string): void {
  const dangerousPatterns = [
    /require\s*\(/g,                    // Prevent require() calls
    /import\s+.*\s+from\s+['"](?!\.)/g, // Prevent external imports
    /eval\s*\(/g,                        // Prevent eval
    /Function\s*\(/g,                    // Prevent Function constructor
    /process\./g,                        // Prevent process access
    /__dirname/g,                        // Prevent __dirname
    /__filename/g,                       // Prevent __filename
    /global\./g,                         // Prevent global access
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      throw new SecurityError(
        `Code contains dangerous pattern: ${pattern.source}`
      );
    }
  }

  // Validate code length
  if (code.length > 50000) {
    throw new ValidationError('Code exceeds maximum length of 50KB');
  }
}
```

### Step 10: Schema to TypeScript Converter

Create `src/server/schema-converter.ts`:

```typescript
import { MCPTool } from '../types/mcp.js';
import logger from '../utils/logger.js';

export class SchemaConverter {
  /**
   * Convert MCP tool schemas to TypeScript API definitions
   */
  convertToTypeScript(tools: MCPTool[]): string {
    logger.info({ toolCount: tools.length }, 'Converting MCP schema to TypeScript');

    const interfaceDefinitions = tools.map(tool => 
      this.generateInterfaceForTool(tool)
    ).join('\n\n');

    const apiDefinition = this.generateAPIObject(tools);

    return `${interfaceDefinitions}\n\n${apiDefinition}`;
  }

  private generateInterfaceForTool(tool: MCPTool): string {
    const inputInterfaceName = this.toPascalCase(tool.name) + 'Input';
    const outputInterfaceName = this.toPascalCase(tool.name) + 'Output';

    const inputProps = tool.inputSchema.properties || {};
    const required = tool.inputSchema.required || [];

    const inputFields = Object.entries(inputProps).map(([key, schema]: [string, any]) => {
      const optional = !required.includes(key);
      const tsType = this.jsonSchemaToTypeScript(schema);
      const description = schema.description 
        ? `\n  /**\n   * ${schema.description}\n   */\n  `
        : '\n  ';
      
      return `${description}${key}${optional ? '?' : ''}: ${tsType};`;
    }).join('\n');

    return `interface ${inputInterfaceName} {\n${inputFields}\n}\n\ninterface ${outputInterfaceName} {\n  [key: string]: any;\n}`;
  }

  private generateAPIObject(tools: MCPTool[]): string {
    const methods = tools.map(tool => {
      const inputType = this.toPascalCase(tool.name) + 'Input';
      const outputType = this.toPascalCase(tool.name) + 'Output';
      const description = tool.description 
        ? `\n  /**\n   * ${tool.description}\n   */\n  `
        : '\n  ';

      return `${description}${tool.name}: (input: ${inputType}) => Promise<${outputType}>;`;
    }).join('\n');

    return `declare const mcp: {\n${methods}\n};`;
  }

  private jsonSchemaToTypeScript(schema: any): string {
    if (!schema.type) {
      return 'any';
    }

    switch (schema.type) {
      case 'string':
        return 'string';
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'array':
        const itemType = schema.items 
          ? this.jsonSchemaToTypeScript(schema.items)
          : 'any';
        return `${itemType}[]`;
      case 'object':
        if (schema.properties) {
          const props = Object.entries(schema.properties).map(
            ([key, value]: [string, any]) => {
              const optional = !(schema.required || []).includes(key);
              return `${key}${optional ? '?' : ''}: ${this.jsonSchemaToTypeScript(value)}`;
            }
          ).join('; ');
          return `{ ${props} }`;
        }
        return 'Record<string, any>';
      default:
        return 'any';
    }
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }
}
```

### Step 11: Worker Manager (Critical Component)

Create `src/server/worker-manager.ts`:

```typescript
import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { MCPConfig, MCPInstance, MCPTool } from '../types/mcp.js';
import { WorkerCode, WorkerStub } from '../types/worker.js';
import { WorkerError, MCPConnectionError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { SchemaConverter } from './schema-converter.js';

export class WorkerManager {
  private instances: Map<string, MCPInstance> = new Map();
  private mcpProcesses: Map<string, ChildProcess> = new Map();
  private schemaConverter: SchemaConverter;

  constructor() {
    this.schemaConverter = new SchemaConverter();
  }

  /**
   * Load an MCP server into a Worker isolate
   */
  async loadMCP(mcpName: string, config: MCPConfig): Promise<MCPInstance> {
    const mcpId = randomUUID();
    
    logger.info({ mcpId, mcpName, config }, 'Loading MCP server');

    try {
      // Step 1: Start the MCP server process
      const mcpProcess = await this.startMCPProcess(config);
      this.mcpProcesses.set(mcpId, mcpProcess);

      // Step 2: Connect to MCP server and fetch schema
      const tools = await this.fetchMCPSchema(mcpProcess);

      // Step 3: Convert schema to TypeScript API
      const typescriptApi = this.schemaConverter.convertToTypeScript(tools);

      // Step 4: Create Worker isolate configuration
      const workerId = `worker-${mcpId}`;
      const workerCode = this.generateWorkerCode(mcpId, tools, typescriptApi);

      // Step 5: Store instance metadata
      const instance: MCPInstance = {
        mcp_id: mcpId,
        mcp_name: mcpName,
        status: 'ready',
        worker_id: workerId,
        typescript_api: typescriptApi,
        tools,
        created_at: new Date(),
        uptime_ms: 0,
      };

      this.instances.set(mcpId, instance);

      logger.info({ mcpId, toolCount: tools.length }, 'MCP server loaded successfully');

      return instance;
    } catch (error) {
      logger.error({ error, mcpId, mcpName }, 'Failed to load MCP server');
      
      // Cleanup on failure
      const process = this.mcpProcesses.get(mcpId);
      if (process) {
        process.kill();
        this.mcpProcesses.delete(mcpId);
      }

      throw new MCPConnectionError(
        `Failed to load MCP server: ${error.message}`,
        { mcpName, error }
      );
    }
  }

  /**
   * Execute TypeScript code in a Worker isolate
   */
  async executeCode(
    mcpId: string,
    code: string,
    timeoutMs: number = 30000
  ): Promise<any> {
    const instance = this.instances.get(mcpId);
    
    if (!instance) {
      throw new WorkerError(`MCP instance not found: ${mcpId}`);
    }

    if (instance.status !== 'ready') {
      throw new WorkerError(`MCP instance not ready: ${instance.status}`);
    }

    logger.info({ mcpId, codeLength: code.length }, 'Executing code in Worker isolate');

    const startTime = Date.now();

    try {
      // This is where we would integrate with Wrangler's Worker Loader API
      // For now, we'll simulate the execution
      const result = await this.executeInIsolate(mcpId, code, timeoutMs);
      
      const executionTime = Date.now() - startTime;

      logger.info({ mcpId, executionTime }, 'Code executed successfully');

      return {
        success: true,
        output: result.output,
        execution_time_ms: executionTime,
        metrics: result.metrics,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error({ error, mcpId, executionTime }, 'Code execution failed');

      return {
        success: false,
        error: error.message,
        execution_time_ms: executionTime,
        metrics: {
          mcp_calls_made: 0,
          tokens_saved_estimate: 0,
        },
      };
    }
  }

  /**
   * Unload an MCP server and clean up resources
   */
  async unloadMCP(mcpId: string): Promise<void> {
    logger.info({ mcpId }, 'Unloading MCP server');

    const instance = this.instances.get(mcpId);
    if (!instance) {
      throw new WorkerError(`MCP instance not found: ${mcpId}`);
    }

    // Kill MCP process
    const process = this.mcpProcesses.get(mcpId);
    if (process) {
      process.kill();
      this.mcpProcesses.delete(mcpId);
    }

    // Remove instance
    this.instances.delete(mcpId);

    logger.info({ mcpId }, 'MCP server unloaded');
  }

  /**
   * Get all loaded MCP instances
   */
  listInstances(): MCPInstance[] {
    return Array.from(this.instances.values()).map(instance => ({
      ...instance,
      uptime_ms: Date.now() - instance.created_at.getTime(),
    }));
  }

  /**
   * Get a specific MCP instance
   */
  getInstance(mcpId: string): MCPInstance | undefined {
    const instance = this.instances.get(mcpId);
    if (instance) {
      return {
        ...instance,
        uptime_ms: Date.now() - instance.created_at.getTime(),
      };
    }
    return undefined;
  }

  // Private helper methods

  private async startMCPProcess(config: MCPConfig): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
      const process = spawn(config.command, config.args || [], {
        env: { ...process.env, ...config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let initialized = false;

      process.stdout.on('data', (data) => {
        const output = data.toString();
        logger.debug({ output }, 'MCP stdout');
        
        // Simple initialization detection
        if (!initialized && output.includes('initialized')) {
          initialized = true;
          resolve(process);
        }
      });

      process.stderr.on('data', (data) => {
        logger.error({ error: data.toString() }, 'MCP stderr');
      });

      process.on('error', (error) => {
        reject(new MCPConnectionError(`Failed to start MCP process: ${error.message}`));
      });

      // Timeout for initialization
      setTimeout(() => {
        if (!initialized) {
          process.kill();
          reject(new MCPConnectionError('MCP process initialization timeout'));
        }
      }, 10000);
    });
  }

  private async fetchMCPSchema(process: ChildProcess): Promise<MCPTool[]> {
    // In a real implementation, this would communicate with the MCP server
    // via stdio using the MCP protocol to fetch the list of tools
    
    // For now, returning mock data for GitHub MCP
    return [
      {
        name: 'search_repositories',
        description: 'Search for GitHub repositories',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            page: {
              type: 'number',
              description: 'Page number',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'create_issue',
        description: 'Create a new GitHub issue',
        inputSchema: {
          type: 'object' as const,
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            title: { type: 'string', description: 'Issue title' },
            body: { type: 'string', description: 'Issue body' },
          },
          required: ['owner', 'repo', 'title'],
        },
      },
    ];
  }

  private generateWorkerCode(
    mcpId: string,
    tools: MCPTool[],
    typescriptApi: string
  ): WorkerCode {
    const workerScript = `
${typescriptApi}

// Worker runtime that executes AI-generated code
export default {
  async fetch(request, env, ctx) {
    const { code } = await request.json();
    
    // Capture console.log output
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.map(a => JSON.stringify(a)).join(' '));
    };
    
    try {
      // Execute the AI-generated code
      const result = await eval(\`(async () => { \${code} })()\`);
      
      return new Response(JSON.stringify({
        success: true,
        output: logs.join('\\n'),
        result,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message,
        output: logs.join('\\n'),
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    } finally {
      console.log = originalLog;
    }
  }
};
`;

    return {
      compatibilityDate: '2025-06-01',
      mainModule: 'worker.js',
      modules: {
        'worker.js': workerScript,
      },
      env: {
        MCP_ID: mcpId,
      },
      globalOutbound: null, // Critical: Block all network access
    };
  }

  private async executeInIsolate(
    mcpId: string,
    code: string,
    timeoutMs: number
  ): Promise<any> {
    // This is a placeholder for actual Worker Loader API integration
    // In production, this would use env.LOADER.get() to load the Worker
    // and execute the code in a real isolate
    
    // For now, simulating execution
    return {
      output: 'Simulated execution result',
      metrics: {
        mcp_calls_made: 1,
        tokens_saved_estimate: 500,
      },
    };
  }
}
```

---

**CONTINUE TO NEXT MESSAGE FOR REMAINING IMPLEMENTATION STEPS**

This is part 1 of the implementation guide. The document is quite long, so I'll continue with the remaining steps in the next file.
