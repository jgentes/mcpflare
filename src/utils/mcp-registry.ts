/**
 * MCP Registry
 *
 * Reads security isolation settings from the MCPflare Manager VS Code extension
 * and provides them to the Worker Manager for configuring Worker isolates.
 *
 * IMPORTANT: The `isGuarded` state is derived from the IDE config (whether the MCP
 * is in `_mcpflare_disabled`), NOT stored in this settings file. This ensures a
 * single source of truth for MCP guarded state.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ConfigManager } from './config-manager.js'
import logger from './logger.js'

/**
 * Network access configuration
 */
export interface NetworkConfig {
  enabled: boolean
  allowlist: string[]
  allowLocalhost: boolean
}

/**
 * File system access configuration
 */
export interface FileSystemConfig {
  enabled: boolean
  readPaths: string[]
  writePaths: string[]
}

/**
 * Resource limits configuration
 */
export interface ResourceLimits {
  maxExecutionTimeMs: number
  maxMemoryMB: number
  maxMCPCalls: number
}

/**
 * Security configuration for an MCP server (stored in settings.json)
 * Note: isGuarded is computed from IDE config, not stored here
 */
export interface MCPSecurityConfigStored {
  id: string
  mcpName: string
  // isGuarded is NOT stored - it's derived from IDE config
  network: NetworkConfig
  fileSystem: FileSystemConfig
  resourceLimits: ResourceLimits
  lastModified: string
}

/**
 * Security configuration for an MCP server (with computed isGuarded)
 * This is what API consumers see - isGuarded is derived from IDE config
 */
export interface MCPSecurityConfig extends MCPSecurityConfigStored {
  /** Computed from IDE config - true if MCP is in _mcpflare_disabled */
  isGuarded: boolean
}

/**
 * Global MCPflare settings (stored format)
 */
/** Cached MCP schema entry (stored in settings.json) */
export interface MCPSchemaCacheEntry {
  mcpName: string
  configHash: string
  tools: unknown[] // MCPTool array (avoid import cycle)
  prompts?: unknown[] // MCPPrompt array (avoid import cycle)
  toolNames: string[]
  promptNames?: string[]
  toolCount: number
  promptCount?: number
  typescriptApi?: string // Optional, can omit to save disk space
  cachedAt: string
}

/** MCP schema cache (keyed by mcpName:configHash) */
export interface MCPSchemaCache {
  [cacheKey: string]: MCPSchemaCacheEntry
}

/**
 * Global MCPflare settings (stored format)
 */
export interface MCPflareSettingsStored {
  enabled: boolean
  defaults: Omit<MCPSecurityConfigStored, 'id' | 'mcpName' | 'lastModified'>
  mcpConfigs: MCPSecurityConfigStored[]
  /** Cached token metrics for MCPs */
  tokenMetricsCache?: Record<
    string,
    {
      toolCount: number
      schemaChars: number
      estimatedTokens: number
      assessedAt: string
    }
  >
  /** Cached MCP schemas for fast tool discovery */
  mcpSchemaCache?: MCPSchemaCache
}

/**
 * Global MCPflare settings (with computed isGuarded)
 */
export interface MCPflareSettings {
  enabled: boolean
  defaults: Omit<
    MCPSecurityConfig,
    'id' | 'mcpName' | 'isGuarded' | 'lastModified'
  >
  mcpConfigs: MCPSecurityConfig[]
  /** Cached token metrics for MCPs */
  tokenMetricsCache?: Record<
    string,
    {
      toolCount: number
      schemaChars: number
      estimatedTokens: number
      assessedAt: string
    }
  >
  /** Cached MCP schemas for fast tool discovery */
  mcpSchemaCache?: MCPSchemaCache
}

/**
 * Worker isolation configuration for runtime use
 */
export interface WorkerIsolationConfig {
  mcpName: string
  isGuarded: boolean
  outbound: {
    allowedHosts: string[] | null
    allowLocalhost: boolean
  }
  fileSystem: {
    enabled: boolean
    readPaths: string[]
    writePaths: string[]
  }
  limits: {
    cpuMs: number
    memoryMB: number
    subrequests: number
  }
}

/**
 * Default security configuration
 */
const DEFAULT_SECURITY_CONFIG: Omit<
  MCPSecurityConfigStored,
  'id' | 'mcpName' | 'lastModified'
> = {
  network: {
    enabled: false,
    allowlist: [],
    allowLocalhost: false,
  },
  fileSystem: {
    enabled: false,
    readPaths: [],
    writePaths: [],
  },
  resourceLimits: {
    maxExecutionTimeMs: 30000,
    maxMemoryMB: 128,
    maxMCPCalls: 100,
  },
}

/**
 * Default global settings (stored format)
 */
const DEFAULT_SETTINGS_STORED: MCPflareSettingsStored = {
  enabled: true,
  defaults: DEFAULT_SECURITY_CONFIG,
  mcpConfigs: [],
}

// Singleton ConfigManager instance for deriving isGuarded state
let configManagerInstance: ConfigManager | null = null

/**
 * Get or create the ConfigManager instance
 */
function getConfigManager(): ConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager()
  }
  return configManagerInstance
}

/**
 * Check if an MCP is guarded by looking at the IDE config
 * An MCP is guarded if it's in the _mcpflare_disabled section
 */
function isMCPflareedInIDEConfig(mcpName: string): boolean {
  const configManager = getConfigManager()
  return configManager.isMCPDisabled(mcpName)
}

/**
 * Add isGuarded to a stored config by deriving it from IDE config
 */
function hydrateConfig(
  storedConfig: MCPSecurityConfigStored,
): MCPSecurityConfig {
  return {
    ...storedConfig,
    isGuarded: isMCPflareedInIDEConfig(storedConfig.mcpName),
  }
}

/**
 * Remove isGuarded from a config for storage
 */
function dehydrateConfig(config: MCPSecurityConfig): MCPSecurityConfigStored {
  const { isGuarded: _, ...stored } = config
  return stored
}

/**
 * Get the path to the MCPflare settings file
 */
export function getSettingsPath(): string {
  const configDir = join(homedir(), '.mcpflare')

  // Ensure directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  return join(configDir, 'settings.json')
}

/**
 * Load MCPflare settings from disk
 * Computes isGuarded for each config from IDE config state
 */
export function loadSettings(): MCPflareSettings {
  const settingsPath = getSettingsPath()

  if (!existsSync(settingsPath)) {
    logger.debug(
      { settingsPath },
      'No MCPflare settings file found, using defaults',
    )
    return {
      ...DEFAULT_SETTINGS_STORED,
      mcpConfigs: [],
    }
  }

  try {
    const content = readFileSync(settingsPath, 'utf-8')
    const storedSettings = JSON.parse(content) as MCPflareSettingsStored

    // Hydrate configs with computed isGuarded from IDE config
    const hydratedConfigs = storedSettings.mcpConfigs.map(hydrateConfig)

    const settings: MCPflareSettings = {
      ...storedSettings,
      mcpConfigs: hydratedConfigs,
    }

    logger.debug(
      { settingsPath, mcpCount: settings.mcpConfigs.length },
      'Loaded MCPflare settings',
    )
    return settings
  } catch (error) {
    logger.warn(
      { error, settingsPath },
      'Failed to load MCPflare settings, using defaults',
    )
    return {
      ...DEFAULT_SETTINGS_STORED,
      mcpConfigs: [],
    }
  }
}

/**
 * Save MCPflare settings to disk
 * Does NOT save isGuarded - it's derived from IDE config
 */
export function saveSettings(settings: MCPflareSettings): void {
  const settingsPath = getSettingsPath()

  try {
    // Dehydrate configs before saving (remove isGuarded)
    const storedSettings: MCPflareSettingsStored = {
      enabled: settings.enabled,
      defaults: settings.defaults,
      mcpConfigs: settings.mcpConfigs.map(dehydrateConfig),
      tokenMetricsCache: settings.tokenMetricsCache,
      mcpSchemaCache: settings.mcpSchemaCache,
    }

    writeFileSync(settingsPath, JSON.stringify(storedSettings, null, 2))
    logger.debug({ settingsPath }, 'Saved MCPflare settings')
  } catch (error) {
    logger.error({ error, settingsPath }, 'Failed to save MCPflare settings')
    throw error
  }
}

/**
 * Convert MCPSecurityConfig to WorkerIsolationConfig
 */
export function toWorkerIsolationConfig(
  config: MCPSecurityConfig,
): WorkerIsolationConfig {
  return {
    mcpName: config.mcpName,
    isGuarded: config.isGuarded,
    outbound: {
      allowedHosts:
        config.network.enabled && config.network.allowlist.length > 0
          ? config.network.allowlist
          : null,
      allowLocalhost: config.network.enabled && config.network.allowLocalhost,
    },
    fileSystem: {
      enabled: config.fileSystem.enabled,
      readPaths: config.fileSystem.readPaths,
      writePaths: config.fileSystem.writePaths,
    },
    limits: {
      cpuMs: config.resourceLimits.maxExecutionTimeMs,
      memoryMB: config.resourceLimits.maxMemoryMB,
      subrequests: config.resourceLimits.maxMCPCalls,
    },
  }
}

/**
 * Get isolation configuration for a specific MCP
 * Returns undefined if no configuration exists or MCPflare is disabled
 * isGuarded is derived from IDE config, not stored in settings
 */
export function getIsolationConfigForMCP(
  mcpName: string,
): WorkerIsolationConfig | undefined {
  const settings = loadSettings()

  // Check if MCPflare is globally enabled
  if (!settings.enabled) {
    logger.debug({ mcpName }, 'MCPflare is globally disabled')
    return undefined
  }

  // Check if MCP is guarded (in _mcpflare_disabled in IDE config)
  const isGuarded = isMCPflareedInIDEConfig(mcpName)
  if (!isGuarded) {
    logger.debug({ mcpName }, 'MCP is not guarded (not in _mcpflare_disabled)')
    return undefined
  }

  // Find config for this MCP (may not exist, use defaults)
  const config = settings.mcpConfigs.find((c) => c.mcpName === mcpName)

  if (!config) {
    // Use default config for guarded MCP without explicit settings
    logger.debug(
      { mcpName },
      'No MCPflare config found for guarded MCP, using defaults',
    )
    const defaultConfig: MCPSecurityConfig = {
      id: `config-${mcpName}-default`,
      mcpName,
      isGuarded: true,
      ...settings.defaults,
      lastModified: new Date().toISOString(),
    }
    return toWorkerIsolationConfig(defaultConfig)
  }

  return toWorkerIsolationConfig(config)
}

/**
 * Get all guarded MCP configurations
 * Derives guarded status from IDE config
 */
export function getAllGuardedMCPs(): Map<string, WorkerIsolationConfig> {
  const settings = loadSettings()
  const configs = new Map<string, WorkerIsolationConfig>()

  if (!settings.enabled) {
    return configs
  }

  // Get list of guarded MCPs from IDE config
  const configManager = getConfigManager()
  const disabledMCPs = configManager.getDisabledMCPs()

  for (const mcpName of disabledMCPs) {
    // Find config for this MCP (use defaults if not found)
    const config = settings.mcpConfigs.find((c) => c.mcpName === mcpName)

    if (config) {
      configs.set(mcpName, toWorkerIsolationConfig(config))
    } else {
      // Use default config for guarded MCP without explicit settings
      const defaultConfig: MCPSecurityConfig = {
        id: `config-${mcpName}-default`,
        mcpName,
        isGuarded: true,
        ...settings.defaults,
        lastModified: new Date().toISOString(),
      }
      configs.set(mcpName, toWorkerIsolationConfig(defaultConfig))
    }
  }

  logger.debug({ count: configs.size }, 'Loaded guarded MCP configurations')
  return configs
}

/**
 * Check if an MCP should be guarded
 * Derives guarded status from IDE config (_mcpflare_disabled section)
 */
export function isMCPflareed(mcpName: string): boolean {
  const settings = loadSettings()

  if (!settings.enabled) {
    return false
  }

  // Guarded status comes from IDE config, not settings
  return isMCPflareedInIDEConfig(mcpName)
}

/**
 * Create a default configuration for an MCP
 * isGuarded is computed from IDE config
 */
export function createDefaultConfig(mcpName: string): MCPSecurityConfig {
  const settings = loadSettings()

  return {
    id: `config-${mcpName}-${Date.now()}`,
    mcpName,
    isGuarded: isMCPflareedInIDEConfig(mcpName),
    ...settings.defaults,
    lastModified: new Date().toISOString(),
  }
}

/**
 * Add or update an MCP configuration
 * Note: isGuarded is NOT saved - it's derived from IDE config
 * To change isGuarded, use ConfigManager.disableMCP() or enableMCP()
 */
export function upsertMCPConfig(config: MCPSecurityConfig): void {
  const settings = loadSettings()

  const existingIndex = settings.mcpConfigs.findIndex(
    (c) => c.mcpName === config.mcpName,
  )

  if (existingIndex >= 0) {
    settings.mcpConfigs[existingIndex] = config
  } else {
    settings.mcpConfigs.push(config)
  }

  saveSettings(settings)
  // isGuarded is derived from IDE config, so log the actual guarded state
  const actualGuarded = isMCPflareedInIDEConfig(config.mcpName)
  logger.info(
    { mcpName: config.mcpName, isGuarded: actualGuarded },
    'Updated MCP configuration',
  )
}

/**
 * Remove an MCP configuration
 */
export function removeMCPConfig(mcpName: string): void {
  const settings = loadSettings()

  settings.mcpConfigs = settings.mcpConfigs.filter((c) => c.mcpName !== mcpName)

  // Also clean up token metrics cache
  if (settings.tokenMetricsCache?.[mcpName]) {
    delete settings.tokenMetricsCache[mcpName]
  }

  saveSettings(settings)
  logger.info({ mcpName }, 'Removed MCP configuration')
}

/**
 * Clean up token metrics cache for MCPs that no longer exist in IDE config
 * This ensures the cache doesn't accumulate stale entries
 */
export function cleanupTokenMetricsCache(): { removed: string[] } {
  const settings = loadSettings()
  const configManager = getConfigManager()
  const allMCPs = configManager.getAllConfiguredMCPs()
  const removed: string[] = []

  if (settings.tokenMetricsCache) {
    for (const mcpName of Object.keys(settings.tokenMetricsCache)) {
      if (!allMCPs[mcpName]) {
        delete settings.tokenMetricsCache[mcpName]
        removed.push(mcpName)
      }
    }

    if (removed.length > 0) {
      saveSettings(settings)
      logger.info({ removed }, 'Cleaned up stale token metrics cache entries')
    }
  }

  return { removed }
}

/**
 * Get MCP schema from persistent cache
 */
export function getCachedSchema(
  mcpName: string,
  configHash: string,
): MCPSchemaCacheEntry | null {
  const settings = loadSettings()
  const cacheKey = `${mcpName}:${configHash}`
  return settings.mcpSchemaCache?.[cacheKey] || null
}

/**
 * Save MCP schema to persistent cache
 */
export function saveCachedSchema(entry: MCPSchemaCacheEntry): void {
  const settings = loadSettings()
  const cacheKey = `${entry.mcpName}:${entry.configHash}`

  if (!settings.mcpSchemaCache) {
    settings.mcpSchemaCache = {}
  }

  settings.mcpSchemaCache[cacheKey] = entry
  saveSettings(settings)

  logger.debug(
    { mcpName: entry.mcpName, cacheKey, toolCount: entry.toolCount },
    'Saved MCP schema to persistent cache',
  )
}

/**
 * Clean up schema cache for MCPs that no longer exist or have config changes
 */
export function cleanupSchemaCache(): { removed: string[] } {
  const settings = loadSettings()
  const configManager = getConfigManager()
  const allMCPs = configManager.getAllConfiguredMCPs() || {}
  const removed: string[] = []

  if (settings.mcpSchemaCache) {
    for (const cacheKey of Object.keys(settings.mcpSchemaCache)) {
      const [mcpName] = cacheKey.split(':')
      const mcpConfig = allMCPs[mcpName]

      // Remove if MCP no longer exists
      if (!mcpConfig) {
        delete settings.mcpSchemaCache[cacheKey]
        removed.push(cacheKey)
        logger.debug({ cacheKey }, 'Removed schema cache entry for deleted MCP')
      }
      // Note: Config hash changes are handled automatically - new hash = new cache key
    }

    if (removed.length > 0) {
      saveSettings(settings)
      logger.info({ removed }, 'Cleaned up stale schema cache entries')
    }
  }

  return { removed }
}

/**
 * Clear schema cache for a specific MCP
 * Call this when an MCP's tools need to be re-fetched (e.g., after auth fix, re-enable, etc.)
 * @param mcpName The name of the MCP to clear cache for
 * @returns Object with removed cache keys and success status
 */
export function clearMCPSchemaCache(mcpName: string): {
  removed: string[]
  success: boolean
} {
  const settings = loadSettings()
  const removed: string[] = []

  if (settings.mcpSchemaCache) {
    // Schema cache keys are in format "mcpName:configHash"
    // Find and remove all entries for this MCP
    for (const cacheKey of Object.keys(settings.mcpSchemaCache)) {
      if (cacheKey.startsWith(`${mcpName}:`)) {
        delete settings.mcpSchemaCache[cacheKey]
        removed.push(cacheKey)
      }
    }

    if (removed.length > 0) {
      try {
        saveSettings(settings)
        logger.info(
          { mcpName, removed },
          'Cleared schema cache entries for MCP - will re-fetch tools on next connection',
        )
      } catch (error) {
        logger.error(
          { error, mcpName, removed },
          'Failed to persist schema cache clear for MCP',
        )
        return { removed, success: false }
      }
    } else {
      logger.debug({ mcpName }, 'No schema cache entries found for MCP')
    }
  }

  return { removed, success: true }
}

/**
 * Re-export the guarded check function for use by other modules
 */
export { isMCPflareedInIDEConfig as isGuardedInIDEConfig }
