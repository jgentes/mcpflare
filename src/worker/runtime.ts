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
import type { WorkerCode, WorkerLoader } from '../types/worker.js'

// ExecutionContext is a global type in Cloudflare Workers runtime
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
  exports: {
    MCPBridge: (options?: {
      props?: { mcpId: string; rpcUrl: string }
    }) => MCPBridge
    // FetchProxy doesn't use props - allowlist is passed via headers
    FetchProxy?: (options?: Record<string, never>) => FetchProxy
  }
}

interface Env {
  LOADER: WorkerLoader
  [key: string]: unknown // MCP bindings and other env vars
}

/**
 * MCPBridge Service Binding
 *
 * Provides a secure Service Binding for dynamic workers to call MCP tools.
 * The bridge internally calls the Node.js RPC server, allowing dynamic workers
 * to remain fully isolated (globalOutbound: null) while still accessing MCP functionality.
 */
export class MCPBridge extends WorkerEntrypoint<{
  mcpId: string
  rpcUrl: string
}> {
  /**
   * Call an MCP tool via the Node.js RPC server
   */
  async callTool(toolName: string, input: unknown): Promise<unknown> {
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
      const errorData = (await response.json().catch(() => ({
        error: response.statusText,
      }))) as { error?: string }
      throw new Error(
        `MCP tool call failed: ${errorData.error || response.statusText}`,
      )
    }

    const result = (await response.json()) as {
      success: boolean
      result?: unknown
      error?: string
    }
    if (!result.success) {
      throw new Error(
        `MCP tool call failed: ${result.error || 'Unknown error'}`,
      )
    }

    return result.result
  }
}

/**
 * FetchProxy Service Binding
 *
 * Provides controlled fetch capability for dynamic workers when network access is enabled.
 * Used as the `globalOutbound` value for dynamic workers, making their `fetch()` calls
 * automatically go through this proxy.
 *
 * How it works:
 * 1. Dynamic worker wraps fetch() and adds X-MCPflare-* headers with allowlist config
 * 2. Dynamic worker calls fetch('https://api.github.com/...')
 * 3. Because `globalOutbound` is set to FetchProxy, the request comes here
 * 4. FetchProxy reads the allowlist from the headers
 * 5. FetchProxy checks the URL against the allowlist
 * 6. If allowed, FetchProxy strips the headers and proxies the request
 * 7. If blocked, FetchProxy returns a 403 error response
 *
 * Note: We pass the allowlist via headers because WorkerEntrypoint props may not be
 * preserved when the instance is used as globalOutbound.
 */
export class FetchProxy extends WorkerEntrypoint {
  /**
   * Handle fetch requests from dynamic workers
   *
   * This is the HTTP interface - when a dynamic worker's globalOutbound is set
   * to this FetchProxy, their fetch() calls arrive here as HTTP requests.
   */
  async fetch(request: Request): Promise<Response> {
    // Read allowlist configuration from headers (set by dynamic worker's fetch wrapper)
    const allowedHostsHeader =
      request.headers.get('X-MCPflare-Allowed-Hosts') || ''
    const allowLocalhostHeader =
      request.headers.get('X-MCPflare-Allow-Localhost') || 'false'

    const allowedHosts: string[] = allowedHostsHeader
      ? allowedHostsHeader
          .split(',')
          .map((h) => h.trim())
          .filter((h) => h)
      : []
    const allowLocalhost: boolean = allowLocalhostHeader === 'true'

    // Parse the target URL from the request
    const url = new URL(request.url)
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')

    // Check if it's a loopback address
    const isLoopback =
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'

    // Check localhost access
    if (isLoopback && !allowLocalhost) {
      return new Response(
        JSON.stringify({
          error: `MCPflare network policy: localhost blocked (${hostname})`,
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // Check allowlist for non-localhost requests
    if (!isLoopback && allowedHosts.length > 0) {
      const isAllowed = this.isHostAllowed(hostname, allowedHosts)
      if (!isAllowed) {
        return new Response(
          JSON.stringify({
            error: `MCPflare network policy: ${hostname} is not in the allowed hosts list`,
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
    }

    // Host is allowed - proxy the request
    // Strip the MCPflare headers before forwarding
    const forwardHeaders = new Headers(request.headers)
    forwardHeaders.delete('X-MCPflare-Allowed-Hosts')
    forwardHeaders.delete('X-MCPflare-Allow-Localhost')

    return fetch(request.url, {
      method: request.method,
      headers: forwardHeaders,
      body: request.body,
      redirect: request.redirect,
    })
  }

  /**
   * Check if a hostname is allowed by the allowlist
   * Supports wildcard subdomains (e.g., *.github.com matches api.github.com)
   */
  private isHostAllowed(hostname: string, allowedHosts: string[]): boolean {
    for (const entryRaw of allowedHosts) {
      const entry = entryRaw.toLowerCase().replace(/\.$/, '')
      if (!entry) continue

      // Check for wildcard subdomain (*.example.com)
      if (entry.startsWith('*.') && entry.length > 2) {
        const suffix = entry.slice(2)
        if (hostname === suffix || hostname.endsWith(`.${suffix}`)) {
          return true
        }
      } else if (hostname === entry) {
        return true
      }
    }
    return false
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

        // Use ctx.exports to create Service Bindings
        // ctx.exports contains exported WorkerEntrypoint classes
        // Reference: https://developers.cloudflare.com/workers/runtime-apis/context/#exports
        const mcpBinding = ctx.exports.MCPBridge({
          props: { mcpId, rpcUrl },
        })

        // Create FetchProxy Service Binding if network access is enabled
        // The FetchProxy will be used as globalOutbound, making the dynamic worker's
        // fetch() calls automatically go through FetchProxy for allowlist enforcement.
        // Note: Allowlist is passed via headers from the dynamic worker, not props.
        const needsFetchProxy = workerCode.env?.NETWORK_ENABLED === 'true'

        // Create FetchProxy if network is enabled (no props needed - allowlist comes via headers)
        const fetchProxy =
          needsFetchProxy &&
          'FetchProxy' in ctx.exports &&
          ctx.exports.FetchProxy
            ? ctx.exports.FetchProxy({})
            : undefined

        // Replace env with Service Bindings instead of passing strings
        // The Service Bindings allow dynamic workers to access MCP tools
        const env: Record<string, unknown> = {
          ...workerCode.env,
          MCP: mcpBinding,
        }

        // Set globalOutbound to FetchProxy when network is enabled
        // This makes the dynamic worker's fetch() go through FetchProxy automatically
        // instead of being blocked (when null) or unrestricted (when undefined)
        const globalOutbound = fetchProxy || null

        return {
          ...workerCode,
          env,
          globalOutbound,
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
      // Log stack trace internally but don't expose it in the response
      // Note: logger not available in Worker runtime, so we log to console.error
      console.error(
        'Failed to execute code in Worker isolate:',
        errorMessage,
        errorStack,
      )
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to execute code in Worker isolate',
          message: errorMessage,
          // Don't expose stack traces in API responses - security risk
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
