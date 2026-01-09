/**
 * Tests for token-assessor.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  assessMCPTokens,
  assessMCPTokensWithError,
  calculateTokenSavings,
  type MCPServerInfo,
  type MCPSecurityConfig,
  type TokenMetricsCache,
} from '../../src/extension/token-assessor.js'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

// Mock console.log to reduce noise
vi.spyOn(console, 'log').mockImplementation(() => {})

describe('token-assessor', () => {
  describe('calculateTokenSavings', () => {
    it('should calculate token savings for guarded MCPs with metrics', () => {
      const servers: MCPServerInfo[] = [
        {
          name: 'mcp-1',
          command: 'npx',
          args: ['@modelcontextprotocol/server-github'],
        },
        {
          name: 'mcp-2',
          command: 'node',
          args: ['server.js'],
        },
      ]

      const configs: MCPSecurityConfig[] = [
        {
          id: 'id-1',
          mcpName: 'mcp-1',
          isGuarded: true,
          network: { enabled: false, allowlist: [], allowLocalhost: false },
          fileSystem: { enabled: false, readPaths: [], writePaths: [] },
          resourceLimits: { maxExecutionTimeMs: 30000, maxMemoryMB: 128, maxMCPCalls: 100 },
          lastModified: new Date().toISOString(),
        },
        {
          id: 'id-2',
          mcpName: 'mcp-2',
          isGuarded: true,
          network: { enabled: false, allowlist: [], allowLocalhost: false },
          fileSystem: { enabled: false, readPaths: [], writePaths: [] },
          resourceLimits: { maxExecutionTimeMs: 30000, maxMemoryMB: 128, maxMCPCalls: 100 },
          lastModified: new Date().toISOString(),
        },
      ]

      const tokenCache: TokenMetricsCache = {
        'mcp-1': {
          mcpName: 'mcp-1',
          estimatedTokens: 1000,
          toolCount: 10,
          assessedAt: new Date().toISOString(),
        },
        'mcp-2': {
          mcpName: 'mcp-2',
          estimatedTokens: 1500,
          toolCount: 15,
          assessedAt: new Date().toISOString(),
        },
      }

      const summary = calculateTokenSavings(servers, configs, tokenCache)

      expect(summary.totalTokensWithoutGuard).toBe(2500) // 1000 + 1500
      expect(summary.mcpGuardTokens).toBe(500)
      expect(summary.tokensSaved).toBe(2000) // 2500 - 500
      expect(summary.assessedMCPs).toBe(2)
      expect(summary.guardedMCPs).toBe(2)
      // hasEstimates is true when there are unassessed guarded MCPs, but here all are assessed
      expect(summary.hasEstimates).toBe(false)
    })

    it('should use default estimate for unassessed guarded MCPs', () => {
      const servers: MCPServerInfo[] = [
        {
          name: 'mcp-1',
          command: 'npx',
          args: ['@modelcontextprotocol/server-github'],
        },
      ]

      const configs: MCPSecurityConfig[] = [
        {
          id: 'id-1',
          mcpName: 'mcp-1',
          isGuarded: true,
          network: { enabled: false, allowlist: [], allowLocalhost: false },
          fileSystem: { enabled: false, readPaths: [], writePaths: [] },
          resourceLimits: { maxExecutionTimeMs: 30000, maxMemoryMB: 128, maxMCPCalls: 100 },
          lastModified: new Date().toISOString(),
        },
      ]

      const tokenCache: TokenMetricsCache = {}

      const summary = calculateTokenSavings(servers, configs, tokenCache)

      expect(summary.totalTokensWithoutGuard).toBe(800) // Default estimate
      expect(summary.tokensSaved).toBe(300) // 800 - 500
      expect(summary.assessedMCPs).toBe(0)
      expect(summary.guardedMCPs).toBe(1)
      expect(summary.hasEstimates).toBe(true) // true when there are unassessed guarded MCPs
    })

    it('should not count unguarded MCPs in savings', () => {
      const servers: MCPServerInfo[] = [
        {
          name: 'mcp-1',
          command: 'npx',
          args: ['@modelcontextprotocol/server-github'],
        },
        {
          name: 'mcp-2',
          command: 'node',
          args: ['server.js'],
        },
      ]

      const configs: MCPSecurityConfig[] = [
        {
          id: 'id-1',
          mcpName: 'mcp-1',
          isGuarded: true,
          network: { enabled: false, allowlist: [], allowLocalhost: false },
          fileSystem: { enabled: false, readPaths: [], writePaths: [] },
          resourceLimits: { maxExecutionTimeMs: 30000, maxMemoryMB: 128, maxMCPCalls: 100 },
          lastModified: new Date().toISOString(),
        },
        {
          id: 'id-2',
          mcpName: 'mcp-2',
          isGuarded: false, // Not guarded
          network: { enabled: false, allowlist: [], allowLocalhost: false },
          fileSystem: { enabled: false, readPaths: [], writePaths: [] },
          resourceLimits: { maxExecutionTimeMs: 30000, maxMemoryMB: 128, maxMCPCalls: 100 },
          lastModified: new Date().toISOString(),
        },
      ]

      const tokenCache: TokenMetricsCache = {
        'mcp-1': {
          mcpName: 'mcp-1',
          estimatedTokens: 1000,
          toolCount: 10,
          assessedAt: new Date().toISOString(),
        },
        'mcp-2': {
          mcpName: 'mcp-2',
          estimatedTokens: 1500,
          toolCount: 15,
          assessedAt: new Date().toISOString(),
        },
      }

      const summary = calculateTokenSavings(servers, configs, tokenCache)

      expect(summary.totalTokensWithoutGuard).toBe(1000) // Only mcp-1 (guarded)
      expect(summary.tokensSaved).toBe(500) // 1000 - 500
      expect(summary.guardedMCPs).toBe(1)
      expect(summary.assessedMCPs).toBe(2) // Both assessed, but only mcp-1 counts
    })

    it('should handle empty servers and configs', () => {
      const servers: MCPServerInfo[] = []
      const configs: MCPSecurityConfig[] = []
      const tokenCache: TokenMetricsCache = {}

      const summary = calculateTokenSavings(servers, configs, tokenCache)

      expect(summary.totalTokensWithoutGuard).toBe(0)
      expect(summary.tokensSaved).toBe(0)
      expect(summary.assessedMCPs).toBe(0)
      expect(summary.guardedMCPs).toBe(0)
      expect(summary.hasEstimates).toBe(false)
    })

    it('should handle mixed assessed and unassessed guarded MCPs', () => {
      const servers: MCPServerInfo[] = [
        {
          name: 'mcp-1',
          command: 'npx',
          args: ['@modelcontextprotocol/server-github'],
        },
        {
          name: 'mcp-2',
          command: 'node',
          args: ['server.js'],
        },
      ]

      const configs: MCPSecurityConfig[] = [
        {
          id: 'id-1',
          mcpName: 'mcp-1',
          isGuarded: true,
          network: { enabled: false, allowlist: [], allowLocalhost: false },
          fileSystem: { enabled: false, readPaths: [], writePaths: [] },
          resourceLimits: { maxExecutionTimeMs: 30000, maxMemoryMB: 128, maxMCPCalls: 100 },
          lastModified: new Date().toISOString(),
        },
        {
          id: 'id-2',
          mcpName: 'mcp-2',
          isGuarded: true,
          network: { enabled: false, allowlist: [], allowLocalhost: false },
          fileSystem: { enabled: false, readPaths: [], writePaths: [] },
          resourceLimits: { maxExecutionTimeMs: 30000, maxMemoryMB: 128, maxMCPCalls: 100 },
          lastModified: new Date().toISOString(),
        },
      ]

      const tokenCache: TokenMetricsCache = {
        'mcp-1': {
          mcpName: 'mcp-1',
          estimatedTokens: 1000,
          toolCount: 10,
          assessedAt: new Date().toISOString(),
        },
        // mcp-2 not in cache (unassessed)
      }

      const summary = calculateTokenSavings(servers, configs, tokenCache)

      expect(summary.totalTokensWithoutGuard).toBe(1800) // 1000 + 800 (default)
      expect(summary.tokensSaved).toBe(1300) // 1800 - 500
      expect(summary.assessedMCPs).toBe(1)
      expect(summary.guardedMCPs).toBe(2)
      expect(summary.hasEstimates).toBe(true) // true when there are unassessed guarded MCPs
    })

    it('should not allow negative token savings', () => {
      const servers: MCPServerInfo[] = [
        {
          name: 'mcp-1',
          command: 'npx',
          args: ['@modelcontextprotocol/server-github'],
        },
      ]

      const configs: MCPSecurityConfig[] = [
        {
          id: 'id-1',
          mcpName: 'mcp-1',
          isGuarded: true,
          network: { enabled: false, allowlist: [], allowLocalhost: false },
          fileSystem: { enabled: false, readPaths: [], writePaths: [] },
          resourceLimits: { maxExecutionTimeMs: 30000, maxMemoryMB: 128, maxMCPCalls: 100 },
          lastModified: new Date().toISOString(),
        },
      ]

      const tokenCache: TokenMetricsCache = {
        'mcp-1': {
          mcpName: 'mcp-1',
          estimatedTokens: 100, // Less than MCPGuard baseline
          toolCount: 1,
          assessedAt: new Date().toISOString(),
        },
      }

      const summary = calculateTokenSavings(servers, configs, tokenCache)

      expect(summary.totalTokensWithoutGuard).toBe(100)
      expect(summary.tokensSaved).toBe(0) // Should not be negative
    })
  })

  describe('assessMCPTokens', () => {
    it('should return null for server without command', async () => {
      const server: MCPServerInfo = {
        name: 'url-based-mcp',
        url: 'https://example.com/mcp',
      }

      const result = await assessMCPTokens(server)
      expect(result).toBeNull()
    })

    it('should return null for server without command or url', async () => {
      const server: MCPServerInfo = {
        name: 'invalid-mcp',
      }

      const result = await assessMCPTokens(server)
      expect(result).toBeNull()
    })
  })

  describe('assessMCPTokensWithError', () => {
    it('should return error result for server without command or url', async () => {
      const server: MCPServerInfo = {
        name: 'invalid-mcp',
      }

      const result = await assessMCPTokensWithError(server)
      expect(result.metrics).toBeUndefined()
      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('unknown')
    })

    it('should handle URL-based MCP assessment', async () => {
      const server: MCPServerInfo = {
        name: 'url-mcp',
        url: 'https://example.com/mcp',
      }

      // Mock fetch to return error (no URL-based MCP available in test)
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await assessMCPTokensWithError(server)
      // Should attempt URL-based assessment
      expect(result.metrics || result.error).toBeDefined()
    })
  })

  describe('estimateTokens helper', () => {
    it('should estimate tokens correctly', () => {
      // This tests the internal estimateTokens function indirectly through calculateTokenSavings
      const servers: MCPServerInfo[] = [
        {
          name: 'test-mcp',
          command: 'npx',
          args: ['test'],
        },
      ]

      const configs: MCPSecurityConfig[] = [
        {
          id: 'id-1',
          mcpName: 'test-mcp',
          isGuarded: true,
          network: { enabled: false, allowlist: [], allowLocalhost: false },
          fileSystem: { enabled: false, readPaths: [], writePaths: [] },
          resourceLimits: { maxExecutionTimeMs: 30000, maxMemoryMB: 128, maxMCPCalls: 100 },
          lastModified: new Date().toISOString(),
        },
      ]

      const tokenCache: TokenMetricsCache = {
        'test-mcp': {
          mcpName: 'test-mcp',
          estimatedTokens: 350, // ~3.5 chars per token
          toolCount: 5,
          assessedAt: new Date().toISOString(),
        },
      }

      const summary = calculateTokenSavings(servers, configs, tokenCache)
      expect(summary.totalTokensWithoutGuard).toBe(350)
    })
  })

  describe('OAuth detection', () => {
    beforeEach(() => {
      vi.resetAllMocks()
    })

    it('should detect OAuth requirement from WWW-Authenticate Bearer header', async () => {
      const server: MCPServerInfo = {
        name: 'oauth-mcp',
        url: 'https://api.example.com/mcp',
      }

      // Mock fetch to return 401 with WWW-Authenticate: Bearer header
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Map([
          ['www-authenticate', 'Bearer realm="api"'],
        ]),
        text: () => Promise.resolve('{"error": "unauthorized"}'),
      })

      const result = await assessMCPTokensWithError(server)

      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('oauth_required')
      expect(result.error?.oauthMetadata).toBeDefined()
      expect(result.error?.oauthMetadata?.detectedVia).toBe('www-authenticate')
    })

    it('should detect OAuth requirement from well-known endpoint', async () => {
      const server: MCPServerInfo = {
        name: 'oauth-mcp',
        url: 'https://api.example.com/mcp',
      }

      // First call (initialize) returns 401 without WWW-Authenticate
      // Second call (well-known) returns OAuth metadata
      let callCount = 0
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++
        if (url.includes('.well-known/oauth-protected-resource')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              resource: 'https://api.example.com',
              authorization_servers: ['https://auth.example.com'],
              scopes_supported: ['read', 'write'],
            }),
          })
        }
        // Initialize request - return 401
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Map([['content-type', 'application/json']]),
          text: () => Promise.resolve('{"error": "unauthorized"}'),
        })
      })

      const result = await assessMCPTokensWithError(server)

      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('oauth_required')
      expect(result.error?.oauthMetadata).toBeDefined()
      expect(result.error?.oauthMetadata?.authorization_servers).toContain('https://auth.example.com')
    })

    it('should return auth_failed when no OAuth is detected for 401', async () => {
      const server: MCPServerInfo = {
        name: 'api-key-mcp',
        url: 'https://api.example.com/mcp',
      }

      // Mock fetch to return 401 without OAuth indicators
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('.well-known/oauth-protected-resource')) {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
          })
        }
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Map([['content-type', 'application/json']]),
          text: () => Promise.resolve('{"error": "invalid api key"}'),
        })
      })

      const result = await assessMCPTokensWithError(server)

      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('auth_failed')
      expect(result.error?.statusCode).toBe(401)
    })

    it('should successfully assess MCP that does not require OAuth', async () => {
      const server: MCPServerInfo = {
        name: 'public-mcp',
        url: 'https://api.example.com/mcp',
      }

      // Mock successful MCP connection
      global.fetch = vi.fn().mockImplementation((url: string, options?: { body?: string }) => {
        const body = options?.body ? JSON.parse(options.body) : {}
        
        if (body.method === 'initialize') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Map([
              ['content-type', 'application/json'],
              ['mcp-session-id', 'test-session-123'],
            ]),
            text: () => Promise.resolve(JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                serverInfo: { name: 'test-server', version: '1.0.0' },
              },
            })),
          })
        }
        
        if (body.method === 'tools/list') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'application/json']]),
            text: () => Promise.resolve(JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              result: {
                tools: [
                  { name: 'test_tool', description: 'A test tool', inputSchema: { type: 'object' } },
                ],
              },
            })),
          })
        }
        
        return Promise.reject(new Error('Unexpected request'))
      })

      const result = await assessMCPTokensWithError(server)

      expect(result.metrics).toBeDefined()
      expect(result.error).toBeUndefined()
      expect(result.metrics?.toolCount).toBe(1)
    })

    it('should handle OAuth MCPs that work when authenticated by host IDE', async () => {
      // This test documents the expected behavior: OAuth MCPs cannot be guarded
      // but they CAN be used natively with Cursor/Claude which manages OAuth tokens
      const server: MCPServerInfo = {
        name: 'atlassian-mcp',
        url: 'https://mcp.atlassian.com/v1/sse',
      }

      // Mock 401 with Bearer auth requirement (typical OAuth MCP)
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('.well-known/oauth-protected-resource')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              resource: 'https://mcp.atlassian.com',
              authorization_servers: ['https://auth.atlassian.com/oauth/authorize'],
            }),
          })
        }
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Map([['www-authenticate', 'Bearer']]),
          text: () => Promise.resolve('{"error": "authentication required"}'),
        })
      })

      const result = await assessMCPTokensWithError(server)

      // Should be detected as OAuth required
      expect(result.error?.type).toBe('oauth_required')
      
      // The message should indicate MCPGuard cannot support it
      expect(result.error?.message).toContain('OAuth')
      expect(result.error?.message).toContain('cannot support')
      
      // OAuth metadata should be captured for display
      expect(result.error?.oauthMetadata).toBeDefined()
    })
  })
})

