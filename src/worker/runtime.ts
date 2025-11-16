/**
 * Parent Worker Runtime
 * 
 * This Worker uses the Worker Loader API to spawn dynamic Worker isolates
 * that execute AI-generated TypeScript code with access to MCP server bindings.
 * 
 * Reference: https://blog.cloudflare.com/code-mode/
 * Reference: https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/
 */

import { WorkerCode } from '../types/worker.js';

interface Env {
  LOADER: {
    get(
      id: string,
      getCodeCallback: () => Promise<WorkerCode>
    ): {
      getEntrypoint(name?: string, options?: { props?: any }): {
        fetch(request: Request): Promise<Response>;
      };
    };
  };
  [key: string]: any; // MCP bindings and other env vars
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
      const { 
        workerId, 
        workerCode, 
        executionRequest 
      } = await request.json() as { 
        workerId: string;
        workerCode: WorkerCode;
        executionRequest: {
          code: string;
          timeout?: number;
        };
      };

      if (!env.LOADER) {
        throw new Error('Worker Loader binding not available. Ensure [[worker_loaders]] is configured in wrangler.toml');
      }

      // Use Worker Loader API to spawn a dynamic Worker isolate
      // Reference: https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/
      // Following Cloudflare's Code Mode pattern: https://blog.cloudflare.com/code-mode/
      const dynamicWorker = env.LOADER.get(workerId, async () => {
        // Note: Functions cannot be passed via env (they can't be cloned)
        // Instead, we pass the RPC URL and MCP ID as strings
        // The worker code will generate a binding function that uses these values
        // The actual RPC call will be made by embedding the URL in the generated code
        // Since globalOutbound is null, we need to allow fetch to the RPC server specifically
        // For now, keep MCP_RPC_URL and MCP_ID as strings - they'll be used in generated code
        return workerCode;
      });

      // Get the default entrypoint of the dynamic Worker
      const entrypoint = dynamicWorker.getEntrypoint();

      // Forward the execution request to the dynamic Worker
      const executionRequestPayload = JSON.stringify(executionRequest);
      const workerResponse = await entrypoint.fetch(new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: executionRequestPayload,
      }));

      // Return the response from the dynamic Worker with CORS headers
      const responseBody = await workerResponse.text();
      return new Response(responseBody, {
        status: workerResponse.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });

    } catch (error: any) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to execute code in Worker isolate',
        message: error.message,
        stack: error.stack,
      }), {
        status: 500,
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

