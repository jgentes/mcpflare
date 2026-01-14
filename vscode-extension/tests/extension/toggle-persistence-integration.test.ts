/**
 * Integration test for toggle persistence
 * Simulates the exact user workflow: toggle → save → unmount → remount → verify
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  MCPflareSettings,
  MCPflareSettingsStored,
  MCPSecurityConfig,
  MCPSecurityConfigStored,
} from '../../src/extension/types'
import {
  DEFAULT_SECURITY_CONFIG,
  DEFAULT_SETTINGS,
} from '../../src/extension/types'

/**
 * Simulate the backend's dehydration logic (removing isGuarded before save)
 */
function dehydrateConfig(config: MCPSecurityConfig): MCPSecurityConfigStored {
  const { isGuarded: _, ...stored } = config
  return stored
}

/**
 * Simulate the backend's hydration logic (adding isGuarded from IDE config)
 */
function hydrateConfig(
  storedConfig: MCPSecurityConfigStored,
  isGuardedInIDE: boolean = false,
): MCPSecurityConfig {
  return {
    ...storedConfig,
    isGuarded: isGuardedInIDE,
  }
}

/**
 * Simulate backend save operation
 */
function saveSettingsToBackend(
  settingsPath: string,
  settings: MCPflareSettings,
): void {
  const storedSettings: MCPflareSettingsStored = {
    enabled: settings.enabled,
    defaults: settings.defaults,
    mcpConfigs: settings.mcpConfigs.map(dehydrateConfig),
    tokenMetricsCache: settings.tokenMetricsCache,
    assessmentErrorsCache: settings.assessmentErrorsCache,
    contextWindowSize: settings.contextWindowSize,
  }

  fs.writeFileSync(settingsPath, JSON.stringify(storedSettings, null, 2))
}

/**
 * Simulate backend load operation
 */
function loadSettingsFromBackend(
  settingsPath: string,
  ideConfig: Record<string, boolean> = {},
): MCPflareSettings {
  if (!fs.existsSync(settingsPath)) {
    return {
      ...DEFAULT_SETTINGS,
      mcpConfigs: [],
    }
  }

  const content = fs.readFileSync(settingsPath, 'utf-8')
  const storedSettings = JSON.parse(content) as MCPflareSettingsStored

  // Hydrate configs with isGuarded from IDE config
  const hydratedConfigs = storedSettings.mcpConfigs.map((stored) =>
    hydrateConfig(stored, ideConfig[stored.mcpName] || false),
  )

  return {
    ...storedSettings,
    mcpConfigs: hydratedConfigs,
  }
}

describe('Toggle Persistence Integration', () => {
  let tempDir: string
  let settingsPath: string
  let ideConfig: Record<string, boolean>

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpflare-integration-'))
    settingsPath = path.join(tempDir, 'settings.json')
    ideConfig = {}
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should persist network.enabled toggle through full save/load cycle', () => {
    // Step 1: Initial state - no config exists
    const initialSettings: MCPflareSettings = {
      ...DEFAULT_SETTINGS,
      mcpConfigs: [],
    }
    saveSettingsToBackend(settingsPath, initialSettings)

    // Step 2: User views MCP card - component creates default config
    const serverName = 'github'
    const defaultConfig: MCPSecurityConfig = {
      id: `config-${serverName}`,
      mcpName: serverName,
      isGuarded: false,
      ...DEFAULT_SECURITY_CONFIG,
      lastModified: new Date().toISOString(),
    }

    // Verify default: network is disabled
    expect(defaultConfig.network.enabled).toBe(false)

    // Step 3: User toggles network access ON
    const updatedConfig: MCPSecurityConfig = {
      ...defaultConfig,
      network: {
        ...defaultConfig.network,
        enabled: true, // TOGGLE ON
      },
      lastModified: new Date().toISOString(),
    }

    // Step 4: Frontend optimistic update (simulated by saveMCPConfig hook)
    const currentSettings = loadSettingsFromBackend(settingsPath, ideConfig)
    const existingIndex = currentSettings.mcpConfigs.findIndex(
      (c) => c.id === updatedConfig.id || c.mcpName === updatedConfig.mcpName,
    )
    if (existingIndex >= 0) {
      currentSettings.mcpConfigs[existingIndex] = updatedConfig
    } else {
      currentSettings.mcpConfigs.push(updatedConfig)
    }

    // Step 5: Backend saves (simulated by webview-provider._saveMCPConfig)
    // Backend reloads settings from disk
    const backendSettings = loadSettingsFromBackend(settingsPath, ideConfig)

    // Backend updates config
    const backendExistingIndex = backendSettings.mcpConfigs.findIndex(
      (c) => c.id === updatedConfig.id || c.mcpName === updatedConfig.mcpName,
    )
    if (backendExistingIndex >= 0) {
      backendSettings.mcpConfigs[backendExistingIndex] = {
        ...updatedConfig,
        isGuarded: ideConfig[updatedConfig.mcpName] || false,
      }
    } else {
      backendSettings.mcpConfigs.push({
        ...updatedConfig,
        isGuarded: ideConfig[updatedConfig.mcpName] || false,
      })
    }

    // Backend saves to disk
    saveSettingsToBackend(settingsPath, backendSettings)

    // Step 6: Backend sends updated settings back (now happens with fix)
    const updatedSettingsFromBackend = loadSettingsFromBackend(
      settingsPath,
      ideConfig,
    )

    // Step 7: User closes card (component unmounts)
    // (no action needed for test)

    // Step 8: User reopens card (component remounts with settings from backend)
    const configForComponent = updatedSettingsFromBackend.mcpConfigs.find(
      (c) => c.mcpName === serverName,
    )

    // VERIFY: The toggle value should be persisted
    expect(configForComponent).toBeDefined()
    expect(configForComponent!.network.enabled).toBe(true)
  })

  it('should handle toggle OFF correctly', () => {
    // Start with network enabled
    const initialConfig: MCPSecurityConfig = {
      id: 'config-github',
      mcpName: 'github',
      isGuarded: false,
      network: {
        enabled: true, // Initially ON
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
      lastModified: new Date().toISOString(),
    }

    const initialSettings: MCPflareSettings = {
      ...DEFAULT_SETTINGS,
      mcpConfigs: [initialConfig],
    }
    saveSettingsToBackend(settingsPath, initialSettings)

    // User toggles network OFF
    const updatedConfig: MCPSecurityConfig = {
      ...initialConfig,
      network: {
        ...initialConfig.network,
        enabled: false, // TOGGLE OFF
      },
      lastModified: new Date().toISOString(),
    }

    // Simulate backend save
    const backendSettings = loadSettingsFromBackend(settingsPath, ideConfig)
    const existingIndex = backendSettings.mcpConfigs.findIndex(
      (c) => c.id === updatedConfig.id || c.mcpName === updatedConfig.mcpName,
    )
    backendSettings.mcpConfigs[existingIndex] = {
      ...updatedConfig,
      isGuarded: ideConfig[updatedConfig.mcpName] || false,
    }
    saveSettingsToBackend(settingsPath, backendSettings)

    // Reload and verify
    const reloadedSettings = loadSettingsFromBackend(settingsPath, ideConfig)
    const reloadedConfig = reloadedSettings.mcpConfigs.find(
      (c) => c.mcpName === 'github',
    )

    expect(reloadedConfig).toBeDefined()
    expect(reloadedConfig!.network.enabled).toBe(false)
  })

  it('should handle rapid toggles (ON → OFF → ON)', () => {
    const serverName = 'github'
    let currentConfig: MCPSecurityConfig = {
      id: `config-${serverName}`,
      mcpName: serverName,
      isGuarded: false,
      ...DEFAULT_SECURITY_CONFIG,
      lastModified: new Date().toISOString(),
    }

    // Initial state: network OFF
    expect(currentConfig.network.enabled).toBe(false)

    // Toggle 1: ON
    currentConfig = {
      ...currentConfig,
      network: { ...currentConfig.network, enabled: true },
      lastModified: new Date().toISOString(),
    }

    let settings = { ...DEFAULT_SETTINGS, mcpConfigs: [currentConfig] }
    saveSettingsToBackend(settingsPath, settings)
    let reloaded = loadSettingsFromBackend(settingsPath, ideConfig)
    expect(reloaded.mcpConfigs[0].network.enabled).toBe(true)

    // Toggle 2: OFF
    currentConfig = {
      ...currentConfig,
      network: { ...currentConfig.network, enabled: false },
      lastModified: new Date().toISOString(),
    }

    settings = { ...DEFAULT_SETTINGS, mcpConfigs: [currentConfig] }
    saveSettingsToBackend(settingsPath, settings)
    reloaded = loadSettingsFromBackend(settingsPath, ideConfig)
    expect(reloaded.mcpConfigs[0].network.enabled).toBe(false)

    // Toggle 3: ON
    currentConfig = {
      ...currentConfig,
      network: { ...currentConfig.network, enabled: true },
      lastModified: new Date().toISOString(),
    }

    settings = { ...DEFAULT_SETTINGS, mcpConfigs: [currentConfig] }
    saveSettingsToBackend(settingsPath, settings)
    reloaded = loadSettingsFromBackend(settingsPath, ideConfig)
    expect(reloaded.mcpConfigs[0].network.enabled).toBe(true)
  })

  it('should persist fileSystem.enabled toggle', () => {
    const serverName = 'filesystem-test'
    const initialConfig: MCPSecurityConfig = {
      id: `config-${serverName}`,
      mcpName: serverName,
      isGuarded: false,
      ...DEFAULT_SECURITY_CONFIG,
      lastModified: new Date().toISOString(),
    }

    // Initially filesystem is disabled
    expect(initialConfig.fileSystem.enabled).toBe(false)

    // Toggle filesystem ON
    const updatedConfig: MCPSecurityConfig = {
      ...initialConfig,
      fileSystem: {
        ...initialConfig.fileSystem,
        enabled: true,
      },
      lastModified: new Date().toISOString(),
    }

    // Save and reload
    const settings = { ...DEFAULT_SETTINGS, mcpConfigs: [updatedConfig] }
    saveSettingsToBackend(settingsPath, settings)
    const reloaded = loadSettingsFromBackend(settingsPath, ideConfig)

    expect(reloaded.mcpConfigs[0].fileSystem.enabled).toBe(true)
  })

  it('should persist allowLocalhost toggle', () => {
    const serverName = 'localhost-test'
    const initialConfig: MCPSecurityConfig = {
      id: `config-${serverName}`,
      mcpName: serverName,
      isGuarded: false,
      network: {
        enabled: true, // Network is enabled
        allowlist: [],
        allowLocalhost: false, // But localhost is disabled
      },
      fileSystem: DEFAULT_SECURITY_CONFIG.fileSystem,
      resourceLimits: DEFAULT_SECURITY_CONFIG.resourceLimits,
      lastModified: new Date().toISOString(),
    }

    // Toggle allowLocalhost ON
    const updatedConfig: MCPSecurityConfig = {
      ...initialConfig,
      network: {
        ...initialConfig.network,
        allowLocalhost: true,
      },
      lastModified: new Date().toISOString(),
    }

    // Save and reload
    const settings = { ...DEFAULT_SETTINGS, mcpConfigs: [updatedConfig] }
    saveSettingsToBackend(settingsPath, settings)
    const reloaded = loadSettingsFromBackend(settingsPath, ideConfig)

    expect(reloaded.mcpConfigs[0].network.allowLocalhost).toBe(true)
  })
})


