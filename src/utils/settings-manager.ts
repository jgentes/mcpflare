/**
 * Settings Manager
 *
 * Utilities for managing MCPflare settings stored in ~/.mcpflare/settings.json
 * This file is shared between the CLI and VSCode extension to provide a
 * unified cache for token metrics and assessment results.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { MCPTokenMetrics } from './token-calculator.js'

/**
 * Settings file structure (shared with VSCode extension)
 */
interface SettingsFile {
  enabled?: boolean
  tokenMetricsCache?: Record<string, MCPTokenMetrics>
  assessmentErrorsCache?: Record<string, unknown>
  contextWindowSize?: number
  // ... other fields managed by extension
  [key: string]: unknown
}

/**
 * Get the path to the MCPflare settings file
 * Creates the directory if it doesn't exist
 */
export function getSettingsPath(): string {
  const configDir = path.join(os.homedir(), '.mcpflare')

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }

  return path.join(configDir, 'settings.json')
}

/**
 * Load settings from disk
 * Returns empty object if file doesn't exist or can't be parsed
 */
export function loadSettings(): SettingsFile {
  const settingsPath = getSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    return {}
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    return JSON.parse(content) as SettingsFile
  } catch (error) {
    console.warn('Failed to load settings:', error)
    return {}
  }
}

/**
 * Save settings to disk
 * Creates directory and file if they don't exist
 */
export function saveSettings(settings: SettingsFile): void {
  const settingsPath = getSettingsPath()
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
}

/**
 * Load token metrics cache from disk
 * Returns Map for convenient lookup
 */
export function loadTokenMetrics(): Map<string, MCPTokenMetrics> {
  const settings = loadSettings()
  const cache = new Map<string, MCPTokenMetrics>()

  if (settings.tokenMetricsCache) {
    for (const [name, metrics] of Object.entries(settings.tokenMetricsCache)) {
      cache.set(name, metrics)
    }
  }

  return cache
}

/**
 * Save token metrics cache to disk
 * Preserves other settings in the file
 */
export function saveTokenMetrics(cache: Map<string, MCPTokenMetrics>): void {
  const settings = loadSettings()

  if (!settings.tokenMetricsCache) {
    settings.tokenMetricsCache = {}
  }

  // Clear existing cache and repopulate from Map
  settings.tokenMetricsCache = {}
  for (const [name, metrics] of cache.entries()) {
    settings.tokenMetricsCache[name] = metrics
  }

  saveSettings(settings)
}

/**
 * Get cached metrics for a specific MCP
 * Returns undefined if not cached
 */
export function getCachedMetrics(mcpName: string): MCPTokenMetrics | undefined {
  const cache = loadTokenMetrics()
  return cache.get(mcpName)
}

/**
 * Set cached metrics for a specific MCP
 * Creates settings file if it doesn't exist
 */
export function setCachedMetrics(
  mcpName: string,
  metrics: MCPTokenMetrics,
): void {
  const cache = loadTokenMetrics()
  cache.set(mcpName, metrics)
  saveTokenMetrics(cache)
}

/**
 * Invalidate cache for a specific MCP
 * Call this when an MCP is deleted, modified, or its guard status changes
 */
export function invalidateMetricsCache(mcpName: string): void {
  const settings = loadSettings()

  let changed = false

  if (settings.tokenMetricsCache?.[mcpName]) {
    delete settings.tokenMetricsCache[mcpName]
    changed = true
  }

  if (settings.assessmentErrorsCache?.[mcpName]) {
    delete settings.assessmentErrorsCache[mcpName]
    changed = true
  }

  if (changed) {
    saveSettings(settings)
  }
}

/**
 * Get all cached MCP names
 * Useful for cleanup operations
 */
export function getCachedMCPNames(): string[] {
  const cache = loadTokenMetrics()
  return Array.from(cache.keys())
}
