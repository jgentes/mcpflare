/**
 * Token Calculator
 *
 * Utilities for calculating token savings and assessing MCP token usage.
 * Used by CLI to display token savings information.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import type { MCPConfig, MCPTool } from '../types/mcp.js'

/**
 * Token metrics for an MCP
 */
export interface MCPTokenMetrics {
  /** Number of tools available in this MCP */
  toolCount: number
  /** Total characters in the tool schemas (JSON) */
  schemaChars: number
  /** Estimated tokens (schemaChars / 3.5) */
  estimatedTokens: number
  /** When this assessment was performed */
  assessedAt: string
}

/**
 * Token savings summary
 */
export interface TokenSavingsSummary {
  /** Total tokens that would be used without MCPflare */
  totalTokensWithoutGuard: number
  /** Tokens used by MCPflare itself (~500 for its tools) */
  mcpflareTokens: number
  /** Net tokens saved */
  tokensSaved: number
  /** Number of MCPs with assessed token metrics */
  assessedMCPs: number
  /** Number of guarded MCPs contributing to savings */
  guardedMCPs: number
  /** Per-MCP breakdown */
  mcpBreakdown: Array<{
    name: string
    isGuarded: boolean
    isAssessed: boolean
    tokens: number
    toolCount: number
  }>
  /** Whether some guarded MCPs are using estimated tokens */
  hasEstimates?: boolean
}

/**
 * Estimate tokens from character count
 * JSON/structured data typically tokenizes at ~3-4 chars/token
 * Using 3.5 as a middle ground
 */
function estimateTokens(chars: number): number {
  return Math.round(chars / 3.5)
}

/**
 * MCPflare's own tools (approximate schema size)
 * These tools are always loaded regardless of how many MCPs are guarded
 */
export const MCPFLARE_BASELINE_TOKENS = 500

/**
 * Default estimate for MCPs that can't be assessed
 */
export const DEFAULT_UNASSESSED_TOKENS = 800

/**
 * Assess token usage for a command-based MCP by spawning it temporarily
 * Returns null if assessment fails
 */
export async function assessCommandBasedMCP(
  _mcpName: string,
  config: MCPConfig,
  timeoutMs = 15000,
): Promise<MCPTokenMetrics | null> {
  if (!('command' in config)) {
    return null
  }

  return new Promise((resolve) => {
    let mcpProcess: ChildProcess | null = null
    let resolved = false
    let stdoutBuffer = ''

    const cleanup = () => {
      if (mcpProcess && !mcpProcess.killed) {
        try {
          mcpProcess.kill('SIGTERM')
        } catch {
          // Ignore
        }
      }
    }

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        cleanup()
        resolve(null)
      }
    }, timeoutMs)

    try {
      const command =
        process.platform === 'win32' && config.command === 'npx'
          ? 'npx.cmd'
          : config.command

      mcpProcess = spawn(command, config.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...config.env },
        shell: process.platform === 'win32',
      })

      // Send initialize request
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mcpflare-cli', version: '1.0.0' },
        },
      }

      mcpProcess.stdin?.write(`${JSON.stringify(initRequest)}\n`)

      mcpProcess.stdout?.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString()

        const lines = stdoutBuffer.split('\n')
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim()
          if (!line) continue

          try {
            const response = JSON.parse(line)

            // Handle initialize response
            if (response.id === 1 && response.result) {
              const toolsRequest = {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {},
              }
              mcpProcess?.stdin?.write(`${JSON.stringify(toolsRequest)}\n`)
            }

            // Handle tools/list response
            if (response.id === 2 && response.result?.tools) {
              const tools = response.result.tools as MCPTool[]
              const schemaChars = JSON.stringify(tools).length
              const estimatedTokensValue = estimateTokens(schemaChars)

              if (!resolved) {
                resolved = true
                clearTimeout(timeout)
                cleanup()
                resolve({
                  toolCount: tools.length,
                  schemaChars,
                  estimatedTokens: estimatedTokensValue,
                  assessedAt: new Date().toISOString(),
                })
              }
            }
          } catch {
            // Not complete JSON yet
          }
        }
        stdoutBuffer = lines[lines.length - 1]
      })

      mcpProcess.on('error', () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve(null)
        }
      })

      mcpProcess.on('exit', () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve(null)
        }
      })
    } catch {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve(null)
      }
    }
  })
}

/**
 * Calculate token savings summary from assessed MCPs
 */
export function calculateTokenSavings(
  mcps: Array<{
    name: string
    isGuarded: boolean
    metrics?: MCPTokenMetrics
    toolCount?: number
  }>,
): TokenSavingsSummary {
  let totalTokensWithoutGuard = 0
  let assessedMCPs = 0
  let guardedMCPs = 0
  let unassessedGuardedMCPs = 0

  const mcpBreakdown = mcps.map((mcp) => {
    const isGuarded = mcp.isGuarded
    const isAssessed = !!mcp.metrics
    let tokens = 0

    if (isGuarded) {
      guardedMCPs++
      if (mcp.metrics) {
        assessedMCPs++
        tokens = mcp.metrics.estimatedTokens
        totalTokensWithoutGuard += tokens
      } else {
        unassessedGuardedMCPs++
        tokens = DEFAULT_UNASSESSED_TOKENS
        totalTokensWithoutGuard += tokens
      }
    } else if (mcp.metrics) {
      assessedMCPs++
    }

    return {
      name: mcp.name,
      isGuarded,
      isAssessed,
      tokens,
      toolCount: mcp.metrics?.toolCount || mcp.toolCount || 0,
    }
  })

  const tokensSaved = Math.max(
    0,
    totalTokensWithoutGuard - MCPFLARE_BASELINE_TOKENS,
  )

  return {
    totalTokensWithoutGuard,
    mcpflareTokens: MCPFLARE_BASELINE_TOKENS,
    tokensSaved,
    assessedMCPs,
    guardedMCPs,
    mcpBreakdown,
    hasEstimates: unassessedGuardedMCPs > 0,
  }
}

/**
 * Format token number with comma separators
 */
export function formatTokens(tokens: number): string {
  return tokens.toLocaleString()
}

/**
 * Calculate percentage
 */
export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0
  return Math.round((part / total) * 100)
}
