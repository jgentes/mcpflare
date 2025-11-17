/**
 * Parent Worker Runtime
 *
 * This Worker uses the Worker Loader API to spawn dynamic Worker isolates
 * that execute AI-generated TypeScript code with access to MCP server bindings.
 *
 * Uses Service Bindings for secure communication between dynamic workers and MCP servers.
 *
 * Reference: https://blog.cloudflare.com/code-mode/
 * Reference: https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/
 * Reference: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
 */

// @ts-expect-error - cloudflare:workers is a runtime import, types available at runtime
import { WorkerEntrypoint } from 'cloudflare:workers'
import type { WorkerCode } from '../types/worker.js'

// ExecutionContext is a global type in Cloudflare Workers runtime
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ExecutionContext = {
  waitUntil(promise: Promise<any>): void
  passThroughOnException(): void
  exports: {
    MCPBridge: (options?: { props?: { mcpId: string; rpcUrl: string } }) => MCPBridge
  }
}

interface Env {
  LOADER: {
    get(
      id: string,
      getCodeCallback: () => Promise<WorkerCode>,
    ): {
      getEntrypoint(
        name?: string,
        options?: { props?: any },
      ): {
        fetch(request: Request): Promise<Response>
      }
    }
  }
  [key: string]: any // MCP bindings and other env vars
}

/**
 * MCPBridge Service Binding
 *
 * Provides a secure Service Binding for dynamic workers to call MCP tools.
 * The bridge internally calls the Node.js RPC server, allowing dynamic workers
 * to remain fully isolated (globalOutbound: null) while still accessing MCP functionality.
 */
export class MCPBridge extends WorkerEntrypoint<{ mcpId: string; rpcUrl: string }> {
  /**
   * Call an MCP tool via the Node.js RPC server
   */
  async callTool(toolName: string, input: any): Promise<any> {
    // @ts-expect-error - ctx.props is available at runtime via WorkerEntrypoint
    const { mcpId, rpcUrl } = this.ctx.props

    // Call Node.js RPC server (parent Worker can use fetch)
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mcpId,
        toolName,
        input: input || {},
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: response.statusText,
      })) as { error?: string }
      throw new Error(
        `MCP tool call failed: ${errorData.error || response.statusText}`,
      )
    }

    const result = await response.json() as { success: boolean; result?: any; error?: string }
    if (!result.success) {
      throw new Error(`MCP tool call failed: ${result.error || 'Unknown error'}`)
    }

    return result.result
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // CORS headers for development
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders,
      })
    }

    try {
      const { workerId, workerCode, executionRequest } =
        (await request.json()) as {
          workerId: string
          workerCode: WorkerCode
          executionRequest: {
            code: string
            timeout?: number
          }
        }

      if (!env.LOADER) {
        throw new Error(
          'Worker Loader binding not available. Ensure [[worker_loaders]] is configured in wrangler.toml',
        )
      }

      // Use Worker Loader API to spawn a dynamic Worker isolate
      // Reference: https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/
      // Following Cloudflare's Code Mode pattern: https://blog.cloudflare.com/code-mode/
      // Dynamic workers use Service Bindings for secure MCP access (no fetch() needed)
      const dynamicWorker = env.LOADER.get(workerId, async () => {
        // Extract MCP ID and RPC URL from workerCode.env (set by WorkerManager)
        const mcpId = workerCode.env?.MCP_ID as string
        const rpcUrl = workerCode.env?.MCP_RPC_URL as string

        // Use ctx.exports to create a Service Binding
        // ctx.exports contains exported WorkerEntrypoint classes
        // Reference: https://developers.cloudflare.com/workers/runtime-apis/context/#exports
        const mcpBinding = ctx.exports.MCPBridge({
          props: { mcpId, rpcUrl },
        })

        // Replace env with Service Binding instead of passing strings
        // The Service Binding allows dynamic workers to call MCP tools without fetch()
        return {
          ...workerCode,
          env: {
            ...workerCode.env,
            MCP: mcpBinding,
          },
        }
      })

      // Get the default entrypoint of the dynamic Worker
      const entrypoint = dynamicWorker.getEntrypoint()

      // Forward the execution request to the dynamic Worker
      const executionRequestPayload = JSON.stringify(executionRequest)
      const workerResponse = await entrypoint.fetch(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: executionRequestPayload,
        }),
      )

      // Return the response from the dynamic Worker with CORS headers
      const responseBody = await workerResponse.text()
      return new Response(responseBody, {
        status: workerResponse.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      })
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to execute code in Worker isolate',
          message: errorMessage,
          stack: errorStack,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        },
      )
    }
  },
}
