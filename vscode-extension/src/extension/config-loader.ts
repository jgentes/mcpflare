/**
 * Configuration Loader
 *
 * Loads MCP configurations from various IDE config files
 * and provides functions to disable/enable MCPs for MCPflare integration.
 *
 * Supports Claude Code, GitHub Copilot, and Cursor IDEs.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { MCPServerInfo } from './types'

/**
 * IDE configuration file format (matches Cursor/Claude Code format)
 */
interface MCPServersConfig {
  mcpServers: Record<string, unknown>
  // MCPflare metadata: stores disabled MCPs that should be guarded
  _mcpflare_disabled?: Record<string, unknown>
  _mcpflare_metadata?: {
    version?: string
    disabled_at?: string
  }
}

/**
 * IDE configuration file locations
 * Claude Code is checked first as it has highest priority
 */
const IDE_CONFIG_PATHS = {
  claude: [
    // Claude Code primary paths (cross-platform)
    path.join(os.homedir(), '.claude', 'mcp.json'),
    path.join(os.homedir(), '.claude', 'mcp.jsonc'),
    // Claude Code on Windows (AppData)
    path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Claude Code',
      'User',
      'globalStorage',
      'mcp.json',
    ),
    path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Claude Code',
      'User',
      'globalStorage',
      'mcp.jsonc',
    ),
    // Claude Code on macOS (Application Support)
    path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Claude Code',
      'User',
      'globalStorage',
      'mcp.json',
    ),
    path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Claude Code',
      'User',
      'globalStorage',
      'mcp.jsonc',
    ),
    // Claude Code on Linux (.config)
    path.join(
      os.homedir(),
      '.config',
      'Claude Code',
      'User',
      'globalStorage',
      'mcp.json',
    ),
    path.join(
      os.homedir(),
      '.config',
      'Claude Code',
      'User',
      'globalStorage',
      'mcp.jsonc',
    ),
  ],
  copilot: [
    // GitHub Copilot MCP config (primary paths)
    path.join(os.homedir(), '.github', 'copilot', 'mcp.json'),
    path.join(os.homedir(), '.github', 'copilot', 'mcp.jsonc'),
    // GitHub Copilot on Windows (VS Code extension storage)
    path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Code',
      'User',
      'globalStorage',
      'github.copilot',
      'mcp.json',
    ),
    path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Code',
      'User',
      'globalStorage',
      'github.copilot',
      'mcp.jsonc',
    ),
    // GitHub Copilot on macOS (VS Code extension storage)
    path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Code',
      'User',
      'globalStorage',
      'github.copilot',
      'mcp.json',
    ),
    path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Code',
      'User',
      'globalStorage',
      'github.copilot',
      'mcp.jsonc',
    ),
    // GitHub Copilot on Linux (VS Code extension storage)
    path.join(
      os.homedir(),
      '.config',
      'Code',
      'User',
      'globalStorage',
      'github.copilot',
      'mcp.json',
    ),
    path.join(
      os.homedir(),
      '.config',
      'Code',
      'User',
      'globalStorage',
      'github.copilot',
      'mcp.jsonc',
    ),
  ],
  cursor: [
    // Cursor MCP config (primary paths)
    path.join(os.homedir(), '.cursor', 'mcp.json'),
    path.join(os.homedir(), '.cursor', 'mcp.jsonc'),
    // Cursor on Windows (AppData)
    path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Cursor',
      'User',
      'globalStorage',
      'mcp.json',
    ),
    path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Cursor',
      'User',
      'globalStorage',
      'mcp.jsonc',
    ),
    // Cursor on macOS (Application Support)
    path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Cursor',
      'User',
      'globalStorage',
      'mcp.json',
    ),
    path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Cursor',
      'User',
      'globalStorage',
      'mcp.jsonc',
    ),
    // Cursor on Linux (.config)
    path.join(
      os.homedir(),
      '.config',
      'Cursor',
      'User',
      'globalStorage',
      'mcp.json',
    ),
    path.join(
      os.homedir(),
      '.config',
      'Cursor',
      'User',
      'globalStorage',
      'mcp.jsonc',
    ),
  ],
}

/**
 * Check if a file exists and is readable
 */
function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Safely parse JSON from a file
 */
function safeParseJSON(filePath: string): unknown | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * Type for MCP server configuration in IDE config files
 */
type MCPServerConfig = {
  command?: string
  args?: string[]
  url?: string
  headers?: Record<string, string>
  env?: Record<string, string>
  disabled?: boolean
}

/**
 * Type for IDE config file structure
 */
type IDEConfig = {
  mcpServers?: Record<string, MCPServerConfig>
  _mcpflare_disabled?: Record<string, Omit<MCPServerConfig, 'disabled'>>
} | null

/**
 * Load MCPs from an IDE config file
 * Supports both active MCPs and disabled MCPs from _mcpflare_disabled section
 * Also supports legacy `disabled: true` property for backwards compatibility
 */
function loadIDEConfig(
  ide: 'claude' | 'copilot' | 'cursor',
): MCPServerInfo[] {
  const mcps: MCPServerInfo[] = []
  const paths = IDE_CONFIG_PATHS[ide]

  for (const configPath of paths) {
    if (!fileExists(configPath)) {
      continue
    }

    const config = safeParseJSON(configPath) as IDEConfig
    if (!config) {
      continue
    }

    if (config.mcpServers) {
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        if (name === 'mcpflare') {
          continue
        }

        mcps.push({
          name,
          command: serverConfig.command,
          args: serverConfig.args,
          url: serverConfig.url,
          headers: serverConfig.headers,
          env: serverConfig.env,
          source: ide,
          enabled: !serverConfig.disabled,
        })
      }
    }

    if (config._mcpflare_disabled) {
      for (const [name, serverConfig] of Object.entries(
        config._mcpflare_disabled,
      )) {
        if (name === 'mcpflare') {
          continue
        }

        mcps.push({
          name,
          command: serverConfig.command,
          args: serverConfig.args,
          url: serverConfig.url,
          headers: serverConfig.headers,
          env: serverConfig.env,
          source: ide,
          enabled: false,
        })
      }
    }

    break
  }

  return mcps
}

/**
 * Load MCPs from Claude Code config
 */
function loadClaudeConfig(): MCPServerInfo[] {
  return loadIDEConfig('claude')
}

/**
 * Load MCPs from GitHub Copilot config
 */
function loadCopilotConfig(): MCPServerInfo[] {
  return loadIDEConfig('copilot')
}

/**
 * Load MCPs from Cursor config
 */
function loadCursorConfig(): MCPServerInfo[] {
  return loadIDEConfig('cursor')
}

/**
 * Load all MCP servers from all IDE configs
 */
export function loadAllMCPServers(): MCPServerInfo[] {
  const mcps: MCPServerInfo[] = []
  const seenNames = new Set<string>()

  // Load from each IDE in priority order: Claude > Cursor > Copilot
  const sources = [loadClaudeConfig(), loadCursorConfig(), loadCopilotConfig()]

  for (const source of sources) {
    for (const mcp of source) {
      // Deduplicate by name (prefer earlier sources)
      if (!seenNames.has(mcp.name)) {
        seenNames.add(mcp.name)
        mcps.push(mcp)
      }
    }
  }

  return mcps
}

/**
 * Get the path to the MCPflare settings file
 */
export function getSettingsPath(): string {
  const configDir = path.join(os.homedir(), '.mcpflare')

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }

  return path.join(configDir, 'settings.json')
}

/**
 * Get the list of detected IDE config paths
 */
export function getDetectedConfigs(): { ide: string; path: string }[] {
  const detected: { ide: string; path: string }[] = []

  for (const [ide, paths] of Object.entries(IDE_CONFIG_PATHS)) {
    for (const configPath of paths) {
      if (fileExists(configPath)) {
        detected.push({ ide, path: configPath })
        break // Only include first found for each IDE
      }
    }
  }

  return detected
}

// ============================================================================
// IDE Config Manipulation Functions (for Guard toggle integration)
// ============================================================================

/**
 * Find the first existing IDE config path for a given IDE
 */
function findIDEConfigPath(
  ide: 'claude' | 'copilot' | 'cursor',
): string | null {
  const paths = IDE_CONFIG_PATHS[ide]
  for (const configPath of paths) {
    if (fileExists(configPath)) {
      return configPath
    }
  }
  return null
}

/**
 * Get the primary IDE config path (priority: Claude > Cursor > Copilot)
 */
export function getPrimaryIDEConfigPath(): string | null {
  // Priority order: Claude > Cursor > Copilot
  const claudePath = findIDEConfigPath('claude')
  if (claudePath) return claudePath

  const cursorPath = findIDEConfigPath('cursor')
  if (cursorPath) return cursorPath

  const copilotPath = findIDEConfigPath('copilot')
  if (copilotPath) return copilotPath

  return null
}

/**
 * Get config path for a specific IDE source
 */
export function getIDEConfigPath(
  source: 'claude' | 'copilot' | 'cursor' | 'unknown',
): string | null {
  if (source === 'unknown') {
    return getPrimaryIDEConfigPath()
  }
  return findIDEConfigPath(source)
}

/**
 * Read raw config file (including disabled MCPs section)
 */
function readRawConfigFile(filePath: string): MCPServersConfig | null {
  if (!fileExists(filePath)) {
    return null
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const config = JSON.parse(content) as MCPServersConfig

    if (!config || typeof config !== 'object') {
      console.error('MCPflare: Invalid config file format')
      return null
    }

    // Ensure mcpServers exists
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      config.mcpServers = {}
    }

    return config
  } catch (error) {
    console.error('MCPflare: Failed to read config file:', error)
    return null
  }
}

/**
 * Write config file
 */
function writeConfigFile(filePath: string, config: MCPServersConfig): boolean {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const content = JSON.stringify(config, null, 2)
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch (error) {
    console.error('MCPflare: Failed to write config file:', error)
    return false
  }
}

/**
 * Check if an MCP is disabled (in the _mcpflare_disabled section)
 */
/**
 * Check if an MCP is disabled (guarded) in the IDE config
 * @param mcpName Name of the MCP to check
 * @param source Optional source IDE - if provided, checks that IDE's config; otherwise uses primary
 */
export function isMCPDisabled(
  mcpName: string,
  source?: 'claude' | 'copilot' | 'cursor',
): boolean {
  const configPath = source
    ? getIDEConfigPath(source)
    : getPrimaryIDEConfigPath()
  if (!configPath) return false

  const rawConfig = readRawConfigFile(configPath)
  if (!rawConfig) return false

  return !!rawConfig._mcpflare_disabled?.[mcpName]
}

/**
 * Disable an MCP by moving it to the _mcpflare_disabled section
 * This prevents the IDE from loading it directly, ensuring MCPflare proxies it instead
 * @param mcpName Name of the MCP to disable
 * @param source Optional source IDE - if provided, modifies that IDE's config; otherwise uses primary
 */
export function disableMCPInIDE(
  mcpName: string,
  source?: 'claude' | 'copilot' | 'cursor',
): {
  success: boolean
  message: string
  requiresRestart: boolean
} {
  const configPath = source
    ? getIDEConfigPath(source)
    : getPrimaryIDEConfigPath()
  if (!configPath) {
    return {
      success: false,
      message: source
        ? `No ${source} config file found`
        : 'No IDE config file found',
      requiresRestart: false,
    }
  }

  const rawConfig = readRawConfigFile(configPath)
  if (!rawConfig) {
    return {
      success: false,
      message: 'Failed to read IDE config',
      requiresRestart: false,
    }
  }

  // Check if MCP exists and is not already disabled
  if (!rawConfig.mcpServers[mcpName]) {
    if (rawConfig._mcpflare_disabled?.[mcpName]) {
      return {
        success: true,
        message: 'MCP is already disabled',
        requiresRestart: false,
      }
    }
    return {
      success: false,
      message: 'MCP not found in IDE config',
      requiresRestart: false,
    }
  }

  // Move MCP to disabled section
  const mcpConfig = rawConfig.mcpServers[mcpName]
  delete rawConfig.mcpServers[mcpName]

  // Initialize disabled section if needed
  if (!rawConfig._mcpflare_disabled) {
    rawConfig._mcpflare_disabled = {}
  }
  rawConfig._mcpflare_disabled[mcpName] = mcpConfig

  // Update metadata
  if (!rawConfig._mcpflare_metadata) {
    rawConfig._mcpflare_metadata = {}
  }
  rawConfig._mcpflare_metadata.disabled_at = new Date().toISOString()

  if (!writeConfigFile(configPath, rawConfig)) {
    return {
      success: false,
      message: 'Failed to write config file',
      requiresRestart: false,
    }
  }

  console.log(`MCPflare: Disabled ${mcpName} in IDE config`)
  return {
    success: true,
    message: `${mcpName} disabled - will be proxied through MCPflare`,
    requiresRestart: false,
  }
}

/**
 * Enable a previously disabled MCP by moving it back to active config
 * @param mcpName Name of the MCP to enable
 * @param source Optional source IDE - if provided, modifies that IDE's config; otherwise uses primary
 */
export function enableMCPInIDE(
  mcpName: string,
  source?: 'claude' | 'copilot' | 'cursor',
): {
  success: boolean
  message: string
  requiresRestart: boolean
} {
  const configPath = source
    ? getIDEConfigPath(source)
    : getPrimaryIDEConfigPath()
  if (!configPath) {
    return {
      success: false,
      message: source
        ? `No ${source} config file found`
        : 'No IDE config file found',
      requiresRestart: false,
    }
  }

  const rawConfig = readRawConfigFile(configPath)
  if (!rawConfig) {
    return {
      success: false,
      message: 'Failed to read IDE config',
      requiresRestart: false,
    }
  }

  // Check if MCP is in disabled list
  if (!rawConfig._mcpflare_disabled?.[mcpName]) {
    // Check if it's already active
    if (rawConfig.mcpServers[mcpName]) {
      return {
        success: true,
        message: 'MCP is already enabled',
        requiresRestart: false,
      }
    }
    return {
      success: false,
      message: 'MCP not found in disabled list',
      requiresRestart: false,
    }
  }

  // Move MCP back to active config
  const mcpConfig = rawConfig._mcpflare_disabled[mcpName]
  delete rawConfig._mcpflare_disabled[mcpName]

  // Ensure mcpServers exists
  if (!rawConfig.mcpServers) {
    rawConfig.mcpServers = {}
  }
  rawConfig.mcpServers[mcpName] = mcpConfig

  // Clean up disabled section if empty
  if (
    rawConfig._mcpflare_disabled &&
    Object.keys(rawConfig._mcpflare_disabled).length === 0
  ) {
    delete rawConfig._mcpflare_disabled
  }

  if (!writeConfigFile(configPath, rawConfig)) {
    return {
      success: false,
      message: 'Failed to write config file',
      requiresRestart: false,
    }
  }

  console.log(`MCPflare: Enabled ${mcpName} in IDE config`)
  return {
    success: true,
    message: `${mcpName} restored to active config`,
    requiresRestart: false,
  }
}

/**
 * Ensure mcpflare is in the IDE config
 * If not present, adds it with the bundled server path
 */
export function ensureMCPflareInConfig(extensionPath: string): {
  success: boolean
  message: string
  added: boolean
} {
  const configPath = getPrimaryIDEConfigPath()

  // If no config exists, we need to create one
  if (!configPath) {
    // Try to create Cursor config as default
    const cursorConfigDir = path.join(os.homedir(), '.cursor')
    const cursorConfigPath = path.join(cursorConfigDir, 'mcp.json')

    try {
      if (!fs.existsSync(cursorConfigDir)) {
        fs.mkdirSync(cursorConfigDir, { recursive: true })
      }

      const serverPath = path.join(
        extensionPath,
        '..',
        'dist',
        'server',
        'index.js',
      )
      const newConfig: MCPServersConfig = {
        mcpServers: {
          mcpflare: {
            command: 'node',
            args: [serverPath],
          },
        },
      }

      if (!writeConfigFile(cursorConfigPath, newConfig)) {
        return {
          success: false,
          message: 'Failed to create config file',
          added: false,
        }
      }

      console.log('MCPflare: Created IDE config with mcpflare entry')
      return {
        success: true,
        message: 'Created IDE config with mcpflare',
        added: true,
      }
    } catch {
      return {
        success: false,
        message: 'Failed to create config directory',
        added: false,
      }
    }
  }

  const rawConfig = readRawConfigFile(configPath)
  if (!rawConfig) {
    return {
      success: false,
      message: 'Failed to read IDE config',
      added: false,
    }
  }

  // Check if mcpflare already exists
  if (rawConfig.mcpServers['mcpflare']) {
    return {
      success: true,
      message: 'mcpflare already in config',
      added: false,
    }
  }

  // Check if it's in disabled section (shouldn't be, but just in case)
  if (rawConfig._mcpflare_disabled?.['mcpflare']) {
    // Move it back to active
    const mcpConfig = rawConfig._mcpflare_disabled['mcpflare']
    delete rawConfig._mcpflare_disabled['mcpflare']
    rawConfig.mcpServers['mcpflare'] = mcpConfig

    if (!writeConfigFile(configPath, rawConfig)) {
      return {
        success: false,
        message: 'Failed to write config file',
        added: false,
      }
    }

    console.log('MCPflare: Restored mcpflare from disabled section')
    return {
      success: true,
      message: 'Restored mcpflare to active config',
      added: true,
    }
  }

  // Add mcpflare entry pointing to the bundled server
  const serverPath = path.join(
    extensionPath,
    '..',
    'dist',
    'server',
    'index.js',
  )
  rawConfig.mcpServers['mcpflare'] = {
    command: 'node',
    args: [serverPath],
  }

  if (!writeConfigFile(configPath, rawConfig)) {
    return {
      success: false,
      message: 'Failed to write config file',
      added: false,
    }
  }

  console.log('MCPflare: Added mcpflare to IDE config')
  return { success: true, message: 'Added mcpflare to IDE config', added: true }
}

/**
 * Remove mcpflare from the IDE config
 * Used when MCPflare is globally disabled
 */
export function removeMCPflareFromConfig(): {
  success: boolean
  message: string
} {
  const configPath = getPrimaryIDEConfigPath()
  if (!configPath) {
    return { success: false, message: 'No IDE config file found' }
  }

  const rawConfig = readRawConfigFile(configPath)
  if (!rawConfig) {
    return { success: false, message: 'Failed to read IDE config' }
  }

  // Check if mcpflare exists in active config
  if (!rawConfig.mcpServers['mcpflare']) {
    return { success: true, message: 'mcpflare not in config' }
  }

  // Remove mcpflare from active config
  delete rawConfig.mcpServers['mcpflare']

  if (!writeConfigFile(configPath, rawConfig)) {
    return { success: false, message: 'Failed to write config file' }
  }

  console.log('MCPflare: Removed mcpflare from IDE config')
  return { success: true, message: 'Removed mcpflare from IDE config' }
}

/**
 * Get the status of an MCP (active, disabled, or not found)
 */
export function getMCPStatus(
  mcpName: string,
): 'active' | 'disabled' | 'not_found' {
  const configPath = getPrimaryIDEConfigPath()
  if (!configPath) return 'not_found'

  const rawConfig = readRawConfigFile(configPath)
  if (!rawConfig) return 'not_found'

  if (rawConfig.mcpServers[mcpName]) {
    return 'active'
  }

  if (rawConfig._mcpflare_disabled?.[mcpName]) {
    return 'disabled'
  }

  return 'not_found'
}

/**
 * Get all configured MCP names (both active and disabled)
 */
export function getAllConfiguredMCPNames(): string[] {
  const mcps = loadAllMCPServers()
  return mcps.map((m) => m.name)
}

/**
 * Invalidate cache for a specific MCP
 * Call this when an MCP is deleted, modified, or its guard status changes
 * This forces a fresh assessment on the next load AND clears the schema cache
 * so that the MCPflare server will re-fetch tools from the MCP
 */
export function invalidateMCPCache(mcpName: string): {
  success: boolean
  message: string
} {
  const settingsPath = getSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    return { success: true, message: 'No settings file exists' }
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(content)
    let changed = false
    const clearedCaches: string[] = []

    // Clear token metrics cache for this MCP
    if (settings.tokenMetricsCache?.[mcpName]) {
      delete settings.tokenMetricsCache[mcpName]
      changed = true
      clearedCaches.push('tokenMetrics')
    }

    // Clear assessment errors cache for this MCP
    if (settings.assessmentErrorsCache?.[mcpName]) {
      delete settings.assessmentErrorsCache[mcpName]
      changed = true
      clearedCaches.push('assessmentErrors')
    }

    // Clear MCP schema cache for this MCP
    // Schema cache keys are in format "mcpName:configHash", so we need to find and remove all matching entries
    // This is CRITICAL - without this, the MCPflare server will continue using cached (possibly empty) schemas
    if (settings.mcpSchemaCache) {
      const keysToRemove = Object.keys(settings.mcpSchemaCache).filter((key) =>
        key.startsWith(`${mcpName}:`),
      )
      for (const key of keysToRemove) {
        delete settings.mcpSchemaCache[key]
        changed = true
      }
      if (keysToRemove.length > 0) {
        clearedCaches.push(`mcpSchema (${keysToRemove.length} entries)`)
      }
    }

    if (changed) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
      console.log(
        `MCPflare: Invalidated cache for ${mcpName} - cleared: ${clearedCaches.join(', ')}`,
      )
      return {
        success: true,
        message: `Cache invalidated for ${mcpName}: ${clearedCaches.join(', ')}`,
      }
    }

    return { success: true, message: `No cache entries found for ${mcpName}` }
  } catch (error) {
    console.error(
      `MCPflare: Failed to invalidate cache for ${mcpName}:`,
      error,
    )
    return { success: false, message: `Failed to invalidate cache: ${error}` }
  }
}

/**
 * Clean up token metrics cache for MCPs that no longer exist in IDE config
 * Call this periodically to prevent accumulation of stale cache entries
 */
export function cleanupTokenMetricsCache(): { removed: string[] } {
  const settingsPath = getSettingsPath()
  const removed: string[] = []

  if (!fs.existsSync(settingsPath)) {
    return { removed }
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(content)

    if (!settings.tokenMetricsCache) {
      return { removed }
    }

    const configuredMCPs = new Set(getAllConfiguredMCPNames())

    for (const mcpName of Object.keys(settings.tokenMetricsCache)) {
      if (!configuredMCPs.has(mcpName)) {
        delete settings.tokenMetricsCache[mcpName]
        removed.push(mcpName)
      }
    }

    // Also clean up assessment errors cache
    if (settings.assessmentErrorsCache) {
      for (const mcpName of Object.keys(settings.assessmentErrorsCache)) {
        if (!configuredMCPs.has(mcpName)) {
          delete settings.assessmentErrorsCache[mcpName]
          if (!removed.includes(mcpName)) {
            removed.push(mcpName)
          }
        }
      }
    }

    if (removed.length > 0) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
      console.log(
        `MCPflare: Cleaned up cache entries for removed MCPs: ${removed.join(', ')}`,
      )
    }

    return { removed }
  } catch (error) {
    console.error('MCPflare: Failed to clean up token metrics cache:', error)
    return { removed }
  }
}

/**
 * MCP configuration for adding a new MCP
 */
export interface MCPConfigInput {
  /** Command to run the MCP server (for command-based MCPs) */
  command?: string
  /** Arguments for the command */
  args?: string[]
  /** URL for URL-based MCPs */
  url?: string
  /** HTTP headers for URL-based MCPs */
  headers?: Record<string, string>
  /** Environment variables */
  env?: Record<string, string>
}

/**
 * Add a new MCP to the IDE config
 * @param mcpName Name for the new MCP server
 * @param config MCP configuration (command-based or URL-based)
 * @returns Success status and message
 */
export function addMCPToIDE(
  mcpName: string,
  config: MCPConfigInput,
): { success: boolean; message: string } {
  const configPath = getPrimaryIDEConfigPath()

  // If no config exists, create the default Cursor config
  if (!configPath) {
    const cursorConfigDir = path.join(os.homedir(), '.cursor')
    const cursorConfigPath = path.join(cursorConfigDir, 'mcp.json')

    try {
      if (!fs.existsSync(cursorConfigDir)) {
        fs.mkdirSync(cursorConfigDir, { recursive: true })
      }

      const newConfig: MCPServersConfig = {
        mcpServers: {
          [mcpName]: config,
        },
      }

      fs.writeFileSync(cursorConfigPath, JSON.stringify(newConfig, null, 2))
      console.log(`MCPflare: Created IDE config with ${mcpName}`)
      return { success: true, message: `Created IDE config with ${mcpName}` }
    } catch (error) {
      console.error('MCPflare: Failed to create config file:', error)
      return { success: false, message: 'Failed to create config directory' }
    }
  }

  const rawConfig = readRawConfigFile(configPath)
  if (!rawConfig) {
    return { success: false, message: 'Failed to read IDE config' }
  }

  // Check if MCP already exists (in active or disabled section)
  if (rawConfig.mcpServers[mcpName]) {
    return {
      success: false,
      message: `MCP "${mcpName}" already exists in IDE config`,
    }
  }
  if (rawConfig._mcpflare_disabled?.[mcpName]) {
    return {
      success: false,
      message: `MCP "${mcpName}" already exists (currently guarded)`,
    }
  }

  // Add the new MCP
  rawConfig.mcpServers[mcpName] = config

  if (!writeConfigFile(configPath, rawConfig)) {
    return { success: false, message: 'Failed to write config file' }
  }

  console.log(`MCPflare: Added ${mcpName} to IDE config`)
  return { success: true, message: `Added ${mcpName} to IDE config` }
}

/**
 * Delete an MCP from the IDE config entirely
 * Removes from both active and disabled sections
 * @param mcpName Name of the MCP server to delete
 * @returns Success status and message
 */
/**
 * Delete an MCP from the IDE config entirely
 * @param mcpName Name of the MCP to delete
 * @param source Optional source IDE - if provided, modifies that IDE's config; otherwise uses primary
 */
export function deleteMCPFromIDE(
  mcpName: string,
  source?: 'claude' | 'copilot' | 'cursor',
): {
  success: boolean
  message: string
} {
  const configPath = source
    ? getIDEConfigPath(source)
    : getPrimaryIDEConfigPath()
  if (!configPath) {
    return {
      success: false,
      message: source
        ? `No ${source} config file found`
        : 'No IDE config file found',
    }
  }

  const rawConfig = readRawConfigFile(configPath)
  if (!rawConfig) {
    return { success: false, message: 'Failed to read IDE config' }
  }

  let deleted = false

  // Remove from active MCPs
  if (rawConfig.mcpServers[mcpName]) {
    delete rawConfig.mcpServers[mcpName]
    deleted = true
  }

  // Remove from disabled MCPs
  if (rawConfig._mcpflare_disabled?.[mcpName]) {
    delete rawConfig._mcpflare_disabled[mcpName]
    deleted = true

    // Clean up disabled section if empty
    if (Object.keys(rawConfig._mcpflare_disabled).length === 0) {
      delete rawConfig._mcpflare_disabled
    }
  }

  if (!deleted) {
    return {
      success: false,
      message: `MCP "${mcpName}" not found in IDE config`,
    }
  }

  if (!writeConfigFile(configPath, rawConfig)) {
    return { success: false, message: 'Failed to write config file' }
  }

  // Also invalidate the cache for this MCP
  invalidateMCPCache(mcpName)

  console.log(`MCPflare: Deleted ${mcpName} from IDE config`)
  return { success: true, message: `Deleted ${mcpName} from IDE config` }
}
