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

// Enhanced error response structure
export interface EnhancedErrorResponse {
  error_code: string;
  error_message: string;
  suggested_action?: string;
  context?: any;
  details?: any;
}

// Enhanced load MCP response
export interface EnhancedLoadMCPResponse {
  success: boolean;
  mcp_id: string;
  mcp_name: string;
  status: string;
  tools_count: number;
  typescript_api: string;
  available_tools: string[];
  load_time_ms: number;
  usage_example?: string;
  example_code?: string;
}

// Enhanced get schema response
export interface EnhancedGetSchemaResponse {
  mcp_id: string;
  mcp_name: string;
  typescript_api: string;
  tools: MCPTool[];
  common_patterns?: string[];
}

// Saved MCP Config Entry
export interface SavedMCPConfig {
  mcp_name: string;
  config: MCPConfig;
  source: 'cursor' | 'claude-code' | 'github-copilot';
}

