/**
 * MCP Registry
 * 
 * Reads security isolation settings from the MCP Guard Manager VS Code extension
 * and provides them to the Worker Manager for configuring Worker isolates.
 * 
 * IMPORTANT: The `isGuarded` state is derived from the IDE config (whether the MCP
 * is in `_mcpguard_disabled`), NOT stored in this settings file. This ensures a
 * single source of truth for MCP guarded state.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import logger from './logger.js'
import { ConfigManager } from './config-manager.js'

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
  /** Computed from IDE config - true if MCP is in _mcpguard_disabled */
  isGuarded: boolean
}

/**
 * Global MCP Guard settings (stored format)
 */
export interface MCPGuardSettingsStored {
  enabled: boolean
  defaults: Omit<MCPSecurityConfigStored, 'id' | 'mcpName' | 'lastModified'>
  mcpConfigs: MCPSecurityConfigStored[]
  /** Cached token metrics for MCPs */
  tokenMetricsCache?: Record<string, { toolCount: number; schemaChars: number; estimatedTokens: number; assessedAt: string }>
}

/**
 * Global MCP Guard settings (with computed isGuarded)
 */
export interface MCPGuardSettings {
  enabled: boolean
  defaults: Omit<MCPSecurityConfig, 'id' | 'mcpName' | 'isGuarded' | 'lastModified'>
  mcpConfigs: MCPSecurityConfig[]
  /** Cached token metrics for MCPs */
  tokenMetricsCache?: Record<string, { toolCount: number; schemaChars: number; estimatedTokens: number; assessedAt: string }>
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
const DEFAULT_SECURITY_CONFIG: Omit<MCPSecurityConfigStored, 'id' | 'mcpName' | 'lastModified'> = {
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
const DEFAULT_SETTINGS_STORED: MCPGuardSettingsStored = {
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
 * An MCP is guarded if it's in the _mcpguard_disabled section
 */
function isMCPGuardedInIDEConfig(mcpName: string): boolean {
  const configManager = getConfigManager()
  return configManager.isMCPDisabled(mcpName)
}

/**
 * Add isGuarded to a stored config by deriving it from IDE config
 */
function hydrateConfig(storedConfig: MCPSecurityConfigStored): MCPSecurityConfig {
  return {
    ...storedConfig,
    isGuarded: isMCPGuardedInIDEConfig(storedConfig.mcpName),
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
 * Get the path to the MCP Guard settings file
 */
export function getSettingsPath(): string {
  const configDir = join(homedir(), '.mcpguard')
  
  // Ensure directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  
  return join(configDir, 'settings.json')
}

/**
 * Load MCP Guard settings from disk
 * Computes isGuarded for each config from IDE config state
 */
export function loadSettings(): MCPGuardSettings {
  const settingsPath = getSettingsPath()
  
  if (!existsSync(settingsPath)) {
    logger.debug({ settingsPath }, 'No MCP Guard settings file found, using defaults')
    return {
      ...DEFAULT_SETTINGS_STORED,
      mcpConfigs: [],
    }
  }
  
  try {
    const content = readFileSync(settingsPath, 'utf-8')
    const storedSettings = JSON.parse(content) as MCPGuardSettingsStored
    
    // Hydrate configs with computed isGuarded from IDE config
    const hydratedConfigs = storedSettings.mcpConfigs.map(hydrateConfig)
    
    const settings: MCPGuardSettings = {
      ...storedSettings,
      mcpConfigs: hydratedConfigs,
    }
    
    logger.debug({ settingsPath, mcpCount: settings.mcpConfigs.length }, 'Loaded MCP Guard settings')
    return settings
  } catch (error) {
    logger.warn({ error, settingsPath }, 'Failed to load MCP Guard settings, using defaults')
    return {
      ...DEFAULT_SETTINGS_STORED,
      mcpConfigs: [],
    }
  }
}

/**
 * Save MCP Guard settings to disk
 * Does NOT save isGuarded - it's derived from IDE config
 */
export function saveSettings(settings: MCPGuardSettings): void {
  const settingsPath = getSettingsPath()
  
  try {
    // Dehydrate configs before saving (remove isGuarded)
    const storedSettings: MCPGuardSettingsStored = {
      enabled: settings.enabled,
      defaults: settings.defaults,
      mcpConfigs: settings.mcpConfigs.map(dehydrateConfig),
      tokenMetricsCache: settings.tokenMetricsCache,
    }
    
    writeFileSync(settingsPath, JSON.stringify(storedSettings, null, 2))
    logger.debug({ settingsPath }, 'Saved MCP Guard settings')
  } catch (error) {
    logger.error({ error, settingsPath }, 'Failed to save MCP Guard settings')
    throw error
  }
}

/**
 * Convert MCPSecurityConfig to WorkerIsolationConfig
 */
export function toWorkerIsolationConfig(config: MCPSecurityConfig): WorkerIsolationConfig {
  return {
    mcpName: config.mcpName,
    isGuarded: config.isGuarded,
    outbound: {
      allowedHosts: config.network.enabled && config.network.allowlist.length > 0 
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
 * Returns undefined if no configuration exists or MCP Guard is disabled
 * isGuarded is derived from IDE config, not stored in settings
 */
export function getIsolationConfigForMCP(mcpName: string): WorkerIsolationConfig | undefined {
  const settings = loadSettings()
  
  // Check if MCP Guard is globally enabled
  if (!settings.enabled) {
    logger.debug({ mcpName }, 'MCP Guard is globally disabled')
    return undefined
  }
  
  // Check if MCP is guarded (in _mcpguard_disabled in IDE config)
  const isGuarded = isMCPGuardedInIDEConfig(mcpName)
  if (!isGuarded) {
    logger.debug({ mcpName }, 'MCP is not guarded (not in _mcpguard_disabled)')
    return undefined
  }
  
  // Find config for this MCP (may not exist, use defaults)
  const config = settings.mcpConfigs.find(c => c.mcpName === mcpName)
  
  if (!config) {
    // Use default config for guarded MCP without explicit settings
    logger.debug({ mcpName }, 'No MCP Guard config found for guarded MCP, using defaults')
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
    const config = settings.mcpConfigs.find(c => c.mcpName === mcpName)
    
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
 * Derives guarded status from IDE config (_mcpguard_disabled section)
 */
export function isMCPGuarded(mcpName: string): boolean {
  const settings = loadSettings()
  
  if (!settings.enabled) {
    return false
  }
  
  // Guarded status comes from IDE config, not settings
  return isMCPGuardedInIDEConfig(mcpName)
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
    isGuarded: isMCPGuardedInIDEConfig(mcpName),
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
  
  const existingIndex = settings.mcpConfigs.findIndex(c => c.mcpName === config.mcpName)
  
  if (existingIndex >= 0) {
    settings.mcpConfigs[existingIndex] = config
  } else {
    settings.mcpConfigs.push(config)
  }
  
  saveSettings(settings)
  // isGuarded is derived from IDE config, so log the actual guarded state
  const actualGuarded = isMCPGuardedInIDEConfig(config.mcpName)
  logger.info({ mcpName: config.mcpName, isGuarded: actualGuarded }, 'Updated MCP configuration')
}

/**
 * Remove an MCP configuration
 */
export function removeMCPConfig(mcpName: string): void {
  const settings = loadSettings()
  
  settings.mcpConfigs = settings.mcpConfigs.filter(c => c.mcpName !== mcpName)
  
  // Also clean up token metrics cache
  if (settings.tokenMetricsCache && settings.tokenMetricsCache[mcpName]) {
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
 * Re-export the guarded check function for use by other modules
 */
export { isMCPGuardedInIDEConfig as isGuardedInIDEConfig }








