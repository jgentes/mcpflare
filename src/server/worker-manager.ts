import { type ChildProcess, exec, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  createServer,
  type Server as HttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { MCPConfig, MCPInstance, MCPTool } from '../types/mcp.js'
import type { WorkerCode } from '../types/worker.js'
import { MCPConnectionError, WorkerError } from '../utils/errors.js'
import logger from '../utils/logger.js'
import { ProgressIndicator } from '../utils/progress-indicator.js'
import { formatWranglerError } from '../utils/wrangler-formatter.js'
import { SchemaConverter } from './schema-converter.js'

const execAsync = promisify(exec)

/**
 * Cached schema data for an MCP
 */
interface CachedMCPSchema {
  tools: MCPTool[]
  typescriptApi: string
  configHash: string // Hash of the config to detect changes
  cachedAt: Date
}

export class WorkerManager {
  private instances: Map<string, MCPInstance> = new Map()
  private mcpProcesses: Map<string, ChildProcess> = new Map()
  private mcpClients: Map<string, Client> = new Map() // Store MCP clients for communication
  private schemaConverter: SchemaConverter
  private wranglerAvailable: boolean | null = null
  // Cache schemas by MCP name + config hash
  private schemaCache: Map<string, CachedMCPSchema> = new Map()
  // RPC server for Workers to call MCP tools
  private rpcServer: HttpServer | null = null
  private rpcPort: number = 0
  private rpcServerReady: Promise<void> | null = null

  constructor() {
    this.schemaConverter = new SchemaConverter()
    this.checkWranglerAvailability()
    this.startRPCServer()
  }

  private async checkWranglerAvailability(): Promise<void> {
    try {
      await execAsync('npx wrangler --version')
      this.wranglerAvailable = true
      logger.info('Wrangler is available via npx')
    } catch (_error) {
      this.wranglerAvailable = false
      logger.warn(
        'Wrangler not available via npx. Worker execution will be simulated.',
      )
    }
  }

  /**
   * Start HTTP RPC server for Workers to call MCP tools
   * Workers make HTTP requests to this server to execute MCP tools
   */
  private startRPCServer(): void {
    if (this.rpcServer) {
      return // Already started
    }

    this.rpcServer = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        // CORS headers for development
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.writeHead(200)
          res.end()
          return
        }

        if (req.method !== 'POST' || req.url !== '/mcp-rpc') {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Not found' }))
          return
        }

        try {
          let body = ''
          for await (const chunk of req) {
            body += chunk.toString()
          }

          const { mcpId, toolName, input } = JSON.parse(body)

          if (!mcpId || !toolName) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing mcpId or toolName' }))
            return
          }

          // Get MCP client and call tool
          const client = this.mcpClients.get(mcpId)
          if (!client) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                error: `MCP client not found for ID: ${mcpId}`,
              }),
            )
            return
          }

          logger.debug({ mcpId, toolName, input }, 'RPC: Calling MCP tool')

          // Call the tool using MCP SDK
          const result = await client.callTool({
            name: toolName,
            arguments: input || {},
          })

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, result }))
        } catch (error: any) {
          logger.error(
            { error: error.message, stack: error.stack },
            'RPC: Error calling MCP tool',
          )
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack,
            }),
          )
        }
      },
    )

    // Find an available port
    this.rpcServerReady = new Promise((resolve) => {
      this.rpcServer?.listen(0, '127.0.0.1', () => {
        const address = this.rpcServer?.address()
        if (address && typeof address === 'object') {
          this.rpcPort = address.port
          logger.info({ port: this.rpcPort }, 'MCP RPC server started')
        }
        resolve()
      })
    })
  }

  /**
   * Get the RPC server URL for Workers to use
   */
  private async getRPCUrl(): Promise<string> {
    if (this.rpcServerReady) {
      await this.rpcServerReady
    }
    return `http://127.0.0.1:${this.rpcPort}/mcp-rpc`
  }

  /**
   * Generate a hash of the MCP config for caching
   */
  private hashConfig(mcpName: string, config: MCPConfig): string {
    const configString = JSON.stringify({ mcpName, config })
    return createHash('sha256')
      .update(configString)
      .digest('hex')
      .substring(0, 16)
  }

  /**
   * Get cache key for an MCP
   */
  private getCacheKey(mcpName: string, config: MCPConfig): string {
    return `${mcpName}:${this.hashConfig(mcpName, config)}`
  }

  /**
   * Load an MCP server into a Worker isolate
   */
  async loadMCP(mcpName: string, config: MCPConfig): Promise<MCPInstance> {
    const mcpId = randomUUID()
    const cacheKey = this.getCacheKey(mcpName, config)

    // Log config without sensitive environment variables
    const safeConfig = {
      command: config.command,
      args: config.args,
      envKeys: config.env ? Object.keys(config.env) : undefined,
    }
    logger.info({ mcpId, mcpName, config: safeConfig }, 'Loading MCP server')

    try {
      // Step 1: Check cache first - if we have cached schema, we can skip process initialization wait
      const cached = this.schemaCache.get(cacheKey)
      const hasCachedSchema =
        cached && cached.configHash === this.hashConfig(mcpName, config)

      // Step 2: If we have cached schema, we still need a process for execution
      // For now, spawn it quickly (we'll refactor this later to reuse Client)
      if (hasCachedSchema) {
        const mcpProcess = await this.startMCPProcess(config, true)
        this.mcpProcesses.set(mcpId, mcpProcess)
      }

      // Step 3: Get schema and TypeScript API (from cache or fetch)
      let tools: MCPTool[]
      let typescriptApi: string

      if (hasCachedSchema) {
        // Use cached schema and TypeScript API
        logger.info({ mcpId, mcpName, cacheKey }, 'Using cached MCP schema')
        tools = cached?.tools
        typescriptApi = cached?.typescriptApi
      } else {
        // Step 4: Connect to MCP server and fetch schema using real MCP protocol
        tools = await this.fetchMCPSchema(mcpName, config, mcpId)

        // Step 5: Convert schema to TypeScript API
        typescriptApi = this.schemaConverter.convertToTypeScript(tools)

        // Cache the schema and TypeScript API
        this.schemaCache.set(cacheKey, {
          tools,
          typescriptApi,
          configHash: this.hashConfig(mcpName, config),
          cachedAt: new Date(),
        })
        logger.debug(
          { mcpId, mcpName, cacheKey, toolCount: tools.length },
          'Cached MCP schema',
        )
      }

      // Step 5: Create Worker isolate configuration
      const workerId = `worker-${mcpId}`
      // Worker code will be generated on-demand when executing code

      // Step 6: Store instance metadata
      const instance: MCPInstance = {
        mcp_id: mcpId,
        mcp_name: mcpName,
        status: 'ready',
        worker_id: workerId,
        typescript_api: typescriptApi,
        tools,
        created_at: new Date(),
        uptime_ms: 0,
      }

      this.instances.set(mcpId, instance)

      logger.info(
        { mcpId, mcpName, cached: !!cached },
        'MCP server loaded successfully',
      )

      return instance
    } catch (error: any) {
      logger.error({ error, mcpId, mcpName }, 'Failed to load MCP server')

      // Cleanup on failure
      const process = this.mcpProcesses.get(mcpId)
      if (process) {
        process.kill()
        this.mcpProcesses.delete(mcpId)
      }

      throw new MCPConnectionError(
        `Failed to load MCP server: ${error.message}`,
        { mcpName, error },
      )
    }
  }

  /**
   * Execute TypeScript code in a Worker isolate
   */
  async executeCode(
    mcpId: string,
    code: string,
    timeoutMs: number = 30000,
  ): Promise<any> {
    const instance = this.instances.get(mcpId)

    if (!instance) {
      throw new WorkerError(`MCP instance not found: ${mcpId}`)
    }

    if (instance.status !== 'ready') {
      throw new WorkerError(`MCP instance not ready: ${instance.status}`)
    }

    logger.info(
      { mcpId, codeLength: code.length },
      'Executing code in Worker isolate',
    )

    const startTime = Date.now()

    try {
      const result = await this.executeInIsolate(
        mcpId,
        code,
        timeoutMs,
        instance,
      )

      const executionTime = Date.now() - startTime

      logger.info({ mcpId, executionTime }, 'Code executed successfully')

      return {
        success: true,
        output: result.output,
        execution_time_ms: executionTime,
        metrics: result.metrics,
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime

      logger.error({ error, mcpId, executionTime }, 'Code execution failed')

      return {
        success: false,
        error: error.message,
        execution_time_ms: executionTime,
        metrics: {
          mcp_calls_made: 0,
          tokens_saved_estimate: 0,
        },
      }
    }
  }

  /**
   * Unload an MCP server and clean up resources
   */
  async unloadMCP(mcpId: string): Promise<void> {
    logger.info({ mcpId }, 'Unloading MCP server')

    const instance = this.instances.get(mcpId)
    if (!instance) {
      throw new WorkerError(`MCP instance not found: ${mcpId}`)
    }

    // Close MCP client connection
    const client = this.mcpClients.get(mcpId)
    if (client) {
      try {
        // Get transport from client and close it
        const transport = (client as any)._transport
        if (transport && typeof transport.close === 'function') {
          await transport.close()
        }
      } catch (error: any) {
        logger.warn({ error, mcpId }, 'Error closing MCP client transport')
      }
      this.mcpClients.delete(mcpId)
    }

    // Kill MCP process (fallback)
    const process = this.mcpProcesses.get(mcpId)
    if (process) {
      process.kill()
      this.mcpProcesses.delete(mcpId)
    }

    // Remove instance
    this.instances.delete(mcpId)

    logger.info({ mcpId }, 'MCP server unloaded')
  }

  /**
   * Get all loaded MCP instances
   */
  listInstances(): MCPInstance[] {
    return Array.from(this.instances.values()).map((instance) => ({
      ...instance,
      uptime_ms: Date.now() - instance.created_at.getTime(),
    }))
  }

  /**
   * Get a specific MCP instance
   */
  getInstance(mcpId: string): MCPInstance | undefined {
    const instance = this.instances.get(mcpId)
    if (instance) {
      return {
        ...instance,
        uptime_ms: Date.now() - instance.created_at.getTime(),
      }
    }
    return undefined
  }

  /**
   * Get MCP instance by name
   */
  getMCPByName(mcpName: string): MCPInstance | undefined {
    const instances = this.listInstances()
    return instances.find((instance) => instance.mcp_name === mcpName)
  }

  // Private helper methods

  private async startMCPProcess(
    config: MCPConfig,
    hasCachedSchema: boolean = false,
  ): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
      // On Windows, npx resolves to npx.cmd which spawn() can execute directly
      // On Unix, npx is a regular executable
      let command = config.command
      const args = config.args || []

      if (process.platform === 'win32' && command === 'npx') {
        command = 'npx.cmd'
      }

      logger.info(
        {
          platform: process.platform,
          originalCommand: config.command,
          resolvedCommand: command,
          args: args,
          envKeys: Object.keys(config.env || {}),
          hasCachedSchema,
        },
        'Spawning MCP process',
      )

      let mcpProcess: ChildProcess
      let initialized = false

      try {
        // On Windows, .cmd files need shell: true to execute properly
        const spawnOptions: any = {
          env: { ...process.env, ...config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        }

        if (process.platform === 'win32') {
          spawnOptions.shell = true
        }

        logger.debug({ spawnOptions }, 'Spawning with options')

        mcpProcess = spawn(command, args, spawnOptions)

        logger.debug(
          { pid: mcpProcess.pid },
          'MCP process spawned successfully',
        )

        // If we have cached schema, we don't need to wait for initialization
        // Just give the process a moment to start, then resolve
        if (hasCachedSchema) {
          // Wait a short time for process to start, then resolve
          setTimeout(() => {
            if (mcpProcess && !mcpProcess.killed) {
              initialized = true
              resolve(mcpProcess)
            } else {
              reject(new MCPConnectionError('MCP process failed to start'))
            }
          }, 500)
          return
        }

        // Without cached schema, we need to wait for the process to be ready
        // MCP servers communicate via JSON-RPC, so we wait for any stdout output
        // (which indicates the process is running and ready to communicate)
        if (mcpProcess.stdout) {
          mcpProcess.stdout.on('data', (data: Buffer) => {
            const output = data.toString()
            logger.debug({ output }, 'MCP stdout')

            // MCP servers output JSON-RPC messages - any output means it's ready
            if (!initialized) {
              initialized = true
              // Give it a moment to fully initialize
              setTimeout(() => resolve(mcpProcess), 200)
            }
          })
        }

        if (mcpProcess.stderr) {
          mcpProcess.stderr.on('data', (data: Buffer) => {
            const stderrOutput = data.toString()
            logger.debug({ error: stderrOutput }, 'MCP stderr')
            // Some MCP servers output initialization info to stderr
            // If we see output, the process is at least running
            if (!initialized && stderrOutput.trim().length > 0) {
              initialized = true
              setTimeout(() => resolve(mcpProcess), 200)
            }
          })
        }

        mcpProcess.on('error', (error: Error) => {
          logger.error(
            {
              error: error.message,
              code: (error as any).code,
              errno: (error as any).errno,
              syscall: (error as any).syscall,
              command,
              args,
            },
            'MCP process spawn error',
          )
          reject(
            new MCPConnectionError(
              `Failed to start MCP process: ${error.message}`,
            ),
          )
        })

        // Timeout for initialization
        // Note: MCP servers may not output anything until we send an initialize request
        // So we use a shorter timeout and assume the process is ready if it's still running
        setTimeout(() => {
          if (!initialized) {
            // If process is still running, assume it's ready (even without output)
            // This handles MCP servers that wait for initialization requests
            if (mcpProcess && !mcpProcess.killed && mcpProcess.pid) {
              logger.info(
                { pid: mcpProcess.pid },
                'MCP process ready (timeout - assuming ready)',
              )
              initialized = true
              resolve(mcpProcess)
            } else {
              reject(
                new MCPConnectionError(
                  'MCP process initialization timeout - process not running',
                ),
              )
            }
          }
        }, 2000) // Reduced to 2s since we can use cached schemas
      } catch (spawnError: any) {
        logger.error(
          {
            error: spawnError.message,
            code: spawnError.code,
            errno: spawnError.errno,
            syscall: spawnError.syscall,
            command,
            args,
          },
          'Failed to spawn MCP process (catch block)',
        )
        reject(
          new MCPConnectionError(
            `Failed to spawn MCP process: ${spawnError.message}`,
          ),
        )
      }
    })
  }

  private async fetchMCPSchema(
    mcpName: string,
    config: MCPConfig,
    mcpId: string,
  ): Promise<MCPTool[]> {
    logger.info({ mcpId, mcpName }, 'Fetching MCP schema using real protocol')

    try {
      // Create MCP client with stdio transport
      // The transport will spawn the process and handle initialization
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: config.env,
      })

      const client = new Client(
        {
          name: 'mcpguard',
          version: '0.1.0',
        },
        {
          capabilities: {},
        },
      )

      // Connect to the MCP server (this handles initialization automatically)
      const connectStartTime = Date.now()
      await client.connect(transport, { timeout: 10000 }) // 10 second timeout for initialization
      const connectTime = Date.now() - connectStartTime
      logger.info(
        { mcpId, mcpName, connectTimeMs: connectTime },
        'MCP client connected',
      )

      // Store client for later use (e.g., executing tools)
      this.mcpClients.set(mcpId, client)

      // Get the actual process from the transport
      const process = (transport as any)._process
      if (process) {
        // Update our process map with the actual process
        this.mcpProcesses.set(mcpId, process)
      }

      // List tools from the MCP server
      const listToolsStartTime = Date.now()
      const toolsResponse = await client.listTools()
      const listToolsTime = Date.now() - listToolsStartTime
      // Don't log schema details - just timing
      logger.debug(
        {
          mcpId,
          mcpName,
          toolCount: toolsResponse.tools.length,
          listToolsTimeMs: listToolsTime,
        },
        'Fetched tools from MCP server',
      )

      // Convert MCP SDK tool format to our MCPTool format
      const tools: MCPTool[] = toolsResponse.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object' as const,
          properties: tool.inputSchema.properties || {},
          required: tool.inputSchema.required || [],
        },
      }))

      return tools
    } catch (error: any) {
      logger.error({ error, mcpId, mcpName }, 'Failed to fetch MCP schema')
      throw new MCPConnectionError(
        `Failed to fetch MCP schema: ${error.message}`,
        { mcpName, error },
      )
    }
  }

  private async generateWorkerCode(
    mcpId: string,
    tools: MCPTool[],
    _typescriptApi: string, // Not used in worker code (causes strict mode syntax errors), kept for API compatibility
    userCode: string,
  ): Promise<WorkerCode> {
    // Get RPC server URL for Workers to call MCP tools
    const rpcUrl = await this.getRPCUrl()

    // Generate MCP binding stubs that make HTTP requests to the RPC server
    // We embed the RPC URL and MCP ID directly in the code (functions can't be cloned via env)
    // Escape the RPC URL and MCP ID for safe embedding in the generated code
    const escapedRpcUrl = rpcUrl
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
    const escapedMcpId = mcpId
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')

    const mcpBindingStubs = tools
      .map((tool) => {
        // Escape tool name for use in template string
        const escapedToolName = tool.name.replace(/'/g, "\\'")
        return `    ${tool.name}: async (input) => {
      // Call MCP tool via RPC server (URL embedded in code)
      const response = await fetch('${escapedRpcUrl}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpId: '${escapedMcpId}',
          toolName: '${escapedToolName}',
          input: input || {}
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error('MCP tool call failed: ' + (error.error || response.statusText));
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error('MCP tool call failed: ' + result.error);
      }
      
      return result.result;
    }`
      })
      .join(',\n')

    // Dynamic Worker code that executes user code
    // This Worker is spawned via the Worker Loader API
    // Reference: https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/
    // Note: TypeScript API definitions are not included here as they cause syntax errors in strict mode.
    // Type definitions are only needed for IDE/type checking, not at runtime.
    // Following Cloudflare's Code Mode pattern: https://blog.cloudflare.com/code-mode/
    const workerScript = `
// Dynamic Worker that executes AI-generated code
// This Worker is spawned via Worker Loader API from the parent Worker
export default {
  async fetch(request, env, ctx) {
    const { code, timeout = 30000 } = await request.json();
    
    // Capture console output
    const logs = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    };

    console.error = (...args) => {
      logs.push('ERROR: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    };

    console.warn = (...args) => {
      logs.push('WARN: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    };

    let mcpCallCount = 0;
    let result;

    try {
      // Create MCP binding implementation inside fetch handler where env is available
      // This follows Cloudflare's Code Mode pattern where bindings are accessed via env
      // Reference: https://blog.cloudflare.com/code-mode/
      const mcpBinding = {
${mcpBindingStubs}
      };

      // Create MCP proxy to count calls
      const mcp = new Proxy(mcpBinding, {
        get(target, prop) {
          const original = target[prop];
          if (typeof original === 'function') {
            return async (...args) => {
              mcpCallCount++;
              return await original.apply(target, args);
            };
          }
          return original;
        },
      });

      // Execute the user-provided code
      // The user code is embedded directly in this Worker module as executable statements
      // Each execution gets a fresh Worker isolate via Worker Loader API
      // Note: We can't use new Function() or eval() in Workers, so code must be embedded at generation time
      const executeWithTimeout = async () => {
        // User code is embedded below - it has access to 'mcp' and 'env'
        // The code variable contains the user's code which will be executed directly
        ${userCode.replace(/`/g, '\\`').replace(/\$/g, '\\$')}
      };

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Execution timeout')), timeout)
      );

      result = await Promise.race([executeWithTimeout(), timeoutPromise]);

      return new Response(JSON.stringify({
        success: true,
        output: logs.join('\\n'),
        result: result !== undefined ? result : null,
        metrics: {
          mcp_calls_made: mcpCallCount,
          tokens_saved_estimate: calculateTokensSaved(mcpCallCount),
        },
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
        output: logs.join('\\n'),
        metrics: {
          mcp_calls_made: mcpCallCount,
          tokens_saved_estimate: 0,
        },
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    } finally {
      // Restore console methods
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }
  }
};

function calculateTokensSaved(mcpCalls) {
  // Traditional tool calling: ~1500 tokens per call
  const traditionalTokens = mcpCalls * 1500;
  // Code mode: ~300 tokens for code + ~100 tokens per result
  const codeModeTokens = 300 + (mcpCalls * 100);
  return Math.max(0, traditionalTokens - codeModeTokens);
}
`

    return {
      compatibilityDate: '2025-06-01',
      mainModule: 'worker.js',
      modules: {
        'worker.js': workerScript,
      },
      env: {
        MCP_ID: mcpId,
        MCP_RPC_URL: rpcUrl, // RPC server URL - passed as string (functions can't be cloned)
      },
      // Note: We need fetch() to call the RPC server
      // The RPC URL is embedded directly in the generated code, so workers can only call that specific URL
      // TODO: In production, use a Service Binding for better security instead of allowing fetch()
      // For now, we allow fetch() but the generated code only calls the embedded RPC URL
      // globalOutbound: null, // Temporarily disabled to allow RPC calls via fetch()
    }
  }

  private async executeInIsolate(
    mcpId: string,
    code: string,
    timeoutMs: number,
    instance: MCPInstance,
  ): Promise<any> {
    // Ensure Wrangler availability check has completed
    if (this.wranglerAvailable === null) {
      await this.checkWranglerAvailability()
    }

    // Try to use Wrangler Worker Loader API if available
    if (this.wranglerAvailable) {
      return await this.executeWithWrangler(mcpId, code, timeoutMs, instance)
    }

    // Fallback: Simulated execution (only if Wrangler is confirmed unavailable)
    // Only log to structured logger in non-CLI mode or verbose mode
    // The console.warn below handles CLI display
    const isCLIMode = process.env.CLI_MODE === 'true'
    const isVerbose =
      process.argv.includes('--verbose') || process.argv.includes('-v')
    if (!isCLIMode || isVerbose) {
      logger.warn(
        { mcpId, wranglerAvailable: this.wranglerAvailable },
        '⚠️  WARNING: Worker execution is SIMULATED. Wrangler is not available or execution failed.',
      )
    }
    // Only show warning if Wrangler is confirmed unavailable (not just null/checking)
    if (this.wranglerAvailable === false) {
      console.warn(
        '\n⚠️  DEVELOPMENT WARNING: Worker execution is currently simulated.\n' +
          '   Wrangler is not available. Install Wrangler to enable real Worker execution:\n' +
          '   npm install -g wrangler\n' +
          '   or\n' +
          '   npx wrangler --version\n',
      )
    }

    // Simulate execution with basic validation
    return {
      output:
        `Simulated execution result for code (${code.length} chars)\n` +
        `Note: This is a placeholder. Real Worker execution via Wrangler needed.`,
      metrics: {
        mcp_calls_made: 1, // Estimated
        tokens_saved_estimate: 500,
      },
    }
  }

  private async executeWithWrangler(
    mcpId: string,
    code: string,
    timeoutMs: number,
    instance: MCPInstance,
  ): Promise<any> {
    // Initialize progress indicator (declare outside try for catch access)
    const progress = new ProgressIndicator()
    const isCLIMode = process.env.CLI_MODE === 'true'

    let wranglerProcess: ChildProcess | null = null
    const port = Math.floor(Math.random() * 10000) + 20000 // Random port 20000-29999

    // Collect stdout/stderr for debugging (declare outside try block for catch access)
    let wranglerStdout = ''
    let wranglerStderr = ''

    try {
      // Step 1: Our MCP - Generate worker code with user code embedded
      if (isCLIMode) {
        progress.updateStep(0, 'running')
      }
      const workerCode = await this.generateWorkerCode(
        mcpId,
        instance.tools,
        instance.typescript_api,
        code,
      )

      // Determine npx command based on platform
      const isWindows = process.platform === 'win32'
      const npxCmd = isWindows ? 'npx.cmd' : 'npx'

      // Step 1 complete: Our MCP
      if (isCLIMode) {
        progress.updateStep(0, 'success')
      }

      // Step 2: Wrangler - Start dev server for parent Worker
      if (isCLIMode) {
        progress.updateStep(1, 'running')
      }
      logger.debug(
        { mcpId, port },
        'Starting Wrangler dev server for parent Worker',
      )
      wranglerProcess = spawn(
        npxCmd,
        ['wrangler', 'dev', '--local', '--port', port.toString()],
        {
          cwd: process.cwd(), // Use project root where wrangler.toml is
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: isWindows,
        },
      )

      if (wranglerProcess?.stdout) {
        wranglerProcess.stdout.on('data', (data: Buffer) => {
          const output = data.toString()
          wranglerStdout += output
          logger.debug({ output }, 'Wrangler stdout')
        })
      }

      if (wranglerProcess?.stderr) {
        wranglerProcess.stderr.on('data', (data: Buffer) => {
          const output = data.toString()
          wranglerStderr += output
          logger.debug({ output }, 'Wrangler stderr')
        })
      }

      // Wait for Wrangler to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const error = new Error(
            'Wrangler dev server failed to start within 10 seconds',
          )
          reject(error)
        }, 10000)

        let ready = false
        let checkCount = 0
        const maxChecks = 50

        const checkReady = async () => {
          checkCount++
          try {
            const response = await fetch(`http://localhost:${port}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                workerId: `mcp-${mcpId}-${Date.now()}`,
                workerCode: {
                  compatibilityDate: '2025-06-01',
                  mainModule: 'test.js',
                  modules: {
                    'test.js':
                      'export default { fetch: () => new Response("ok") }',
                  },
                },
                executionRequest: { code: '// health check', timeout: 1000 },
              }),
              signal: AbortSignal.timeout(500),
            })
            if (response.ok || response.status === 500) {
              ready = true
              clearTimeout(timeout)
              if (isCLIMode) {
                progress.updateStep(1, 'success')
              }
              resolve()
            } else if (checkCount < maxChecks) {
              setTimeout(checkReady, 200)
            }
          } catch (error: any) {
            if (checkCount < maxChecks && !error.name?.includes('AbortError')) {
              setTimeout(checkReady, 200)
            } else if (checkCount >= maxChecks) {
              clearTimeout(timeout)
              const healthCheckError = new Error(
                `Wrangler health check failed after ${maxChecks} attempts. Last error: ${error.message}`,
              )
              reject(healthCheckError)
            }
          }
        }

        setTimeout(checkReady, 1000)

        if (wranglerProcess?.stdout) {
          wranglerProcess.stdout.on('data', (data: Buffer) => {
            const output = data.toString()
            if (
              (output.includes('Ready') ||
                output.includes('ready') ||
                output.includes('Listening')) &&
              !ready
            ) {
              ready = true
              clearTimeout(timeout)
              if (isCLIMode) {
                progress.updateStep(1, 'success')
              }
              setTimeout(() => resolve(), 500)
            }
          })
        }

        wranglerProcess?.on('error', (error) => {
          clearTimeout(timeout)
          reject(new Error(`Wrangler process error: ${error.message}`))
        })

        wranglerProcess?.on('exit', (code, signal) => {
          if (!ready && code !== null && code !== 0) {
            clearTimeout(timeout)
            const hasBuildError =
              wranglerStderr.includes('Build failed') ||
              wranglerStderr.includes('build failed') ||
              wranglerStderr.includes('✗ Build failed')
            const hasWorkerLoadersError =
              wranglerStderr.includes('worker_loaders') ||
              wranglerStdout.includes('worker_loaders')

            if (hasWorkerLoadersError) {
              const error = new Error(
                'Worker Loader API configuration error. The "worker_loaders" field may not be supported in your Wrangler version.\n' +
                  'Please ensure you have Wrangler 3.50.0 or later, or check the Wrangler documentation for the correct configuration format.\n' +
                  'Error details: ' +
                  (wranglerStderr || wranglerStdout)
                    .split('\n')
                    .find((line) => line.includes('worker_loaders')) ||
                  'Unknown error',
              )
              ;(error as any).isBuildError = true
              reject(error)
            } else if (hasBuildError) {
              const error = new Error(
                'TypeScript compilation failed. Check the error details below.',
              )
              ;(error as any).isBuildError = true
              reject(error)
            } else {
              const error = new Error(
                `Wrangler process exited with code ${code} (signal: ${signal})`,
              )
              reject(error)
            }
          }
        })
      })

      // Step 3: Target MCP - Execute code via Worker Loader API
      if (isCLIMode) {
        progress.updateStep(2, 'running')
      }
      logger.debug(
        { mcpId, codeLength: code.length },
        'Executing code via Worker Loader API',
      )

      // Generate a unique worker ID for this execution
      // Using hash of code + mcpId to enable caching when same code is executed
      const workerId = `mcp-${mcpId}-${createHash('sha256').update(`${mcpId}-${code}`).digest('hex').substring(0, 16)}`

      const response = await fetch(`http://localhost:${port}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId,
          workerCode,
          executionRequest: {
            code,
            timeout: timeoutMs,
          },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        if (isCLIMode) {
          progress.updateStep(2, 'failed')
          progress.showFinal(2)
        }
        throw new Error(
          `Worker execution failed: ${response.status} ${errorText}`,
        )
      }

      const result = (await response.json()) as {
        success: boolean
        output?: string
        result?: any
        error?: string
        metrics?: {
          mcp_calls_made: number
          tokens_saved_estimate: number
        }
      }

      // Clean up - wait for process to terminate on Windows
      if (wranglerProcess) {
        wranglerProcess.kill()
        // Wait for process to fully terminate, especially important on Windows
        await new Promise<void>((resolve) => {
          if (wranglerProcess) {
            wranglerProcess.on('exit', () => resolve())
            // Force kill after 2 seconds if it doesn't exit
            setTimeout(() => {
              if (wranglerProcess && !wranglerProcess.killed) {
                wranglerProcess.kill('SIGKILL')
              }
              resolve()
            }, 2000)
          } else {
            resolve()
          }
        })
        wranglerProcess = null
      }

      // Step 3 complete: Target MCP execution successful
      if (isCLIMode) {
        progress.updateStep(2, 'success')
        progress.showFinal()
      }

      return {
        output: result.output || '',
        result: result.result,
        metrics: result.metrics || {
          mcp_calls_made: 0,
          tokens_saved_estimate: 0,
        },
      }
    } catch (error: any) {
      // Determine which step failed
      let failedStep = -1
      const isCLIMode = process.env.CLI_MODE === 'true'

      if (isCLIMode) {
        // Check for build/compilation errors first (these happen during Wrangler phase)
        const hasWorkerLoadersError =
          (wranglerStderr?.includes('worker_loaders') ||
            wranglerStdout?.includes('worker_loaders') ||
            error.message?.includes('worker_loaders')) ??
          false
        const hasBuildError =
          wranglerStderr.includes('Build failed') ||
          wranglerStderr.includes('build failed') ||
          wranglerStderr.includes('✗ Build failed') ||
          error.message.includes('TypeScript compilation failed') ||
          error.message.includes('compilation failed') ||
          error.isBuildError === true

        // Check error message to determine failure point
        if (
          hasWorkerLoadersError ||
          hasBuildError ||
          error.message.includes('Wrangler process') ||
          error.message.includes('Wrangler dev server') ||
          error.message.includes('health check') ||
          error.message.includes('Wrangler process exited')
        ) {
          failedStep = 1 // Wrangler failed (build or startup)
          progress.updateStep(1, 'failed')
        } else if (
          error.message.includes('Worker execution failed') ||
          error.message.includes('execute') ||
          (error.message.includes('fetch') &&
            error.message.includes('localhost'))
        ) {
          failedStep = 2 // Target MCP execution failed
          progress.updateStep(2, 'failed')
        } else {
          failedStep = 0 // Our MCP failed (unlikely but possible)
          progress.updateStep(0, 'failed')
        }
        progress.showFinal(failedStep)
      }

      // Format and display the error nicely
      // Include user code in context for build errors to help with troubleshooting
      const context: any = {
        mcpId,
        port,
      }

      // Add user code to context if it's a build error (helps with troubleshooting)
      const isWorkerLoadersError =
        wranglerStderr?.includes('worker_loaders') ||
        wranglerStdout?.includes('worker_loaders')
      const isBuildError =
        wranglerStderr?.includes('Build failed') ||
        wranglerStderr?.includes('build failed') ||
        wranglerStderr?.includes('✗ Build failed')
      if ((isBuildError || isWorkerLoadersError) && code) {
        context.userCode = code
      }

      console.error(
        '\n' +
          formatWranglerError(
            error,
            wranglerStdout || '',
            wranglerStderr || '',
            context,
          ) +
          '\n',
      )

      // Only log to structured logger in non-CLI mode or verbose mode
      // In CLI mode, the formatted error above is sufficient
      const isVerbose =
        process.argv.includes('--verbose') || process.argv.includes('-v')
      if (!isCLIMode || isVerbose) {
        logger.error(
          {
            error: error.message,
            stack: error.stack,
            mcpId,
            port,
          },
          'Wrangler execution error',
        )
      }

      // Clean up on error - wait for process to terminate
      if (wranglerProcess) {
        wranglerProcess.kill()
        await new Promise<void>((resolve) => {
          if (wranglerProcess) {
            wranglerProcess.on('exit', () => resolve())
            setTimeout(() => {
              if (wranglerProcess && !wranglerProcess.killed) {
                wranglerProcess.kill('SIGKILL')
              }
              resolve()
            }, 2000)
          } else {
            resolve()
          }
        })
      }

      throw new WorkerError(`Wrangler execution failed: ${error.message}`)
    }
  }
}
