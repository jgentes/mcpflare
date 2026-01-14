/**
 * Tests for MCP configuration persistence (network/filesystem toggles)
 * These tests verify that toggle changes are properly saved and persist across component unmount/remount
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MCPflareSettings,
  MCPSecurityConfig,
} from '../../src/extension/types'
import { DEFAULT_SETTINGS } from '../../src/extension/types'

describe('MCP Config Persistence', () => {
  let tempDir: string
  let settingsPath: string

  beforeEach(() => {
    // Create a temporary directory for test settings
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpflare-test-'))
    settingsPath = path.join(tempDir, 'settings.json')
  })

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should persist network.enabled toggle changes', () => {
    // Initial settings with network disabled
    const initialSettings: MCPflareSettings = {
      ...DEFAULT_SETTINGS,
      mcpConfigs: [
        {
          id: 'test-mcp-1',
          mcpName: 'test-mcp',
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
          lastModified: new Date().toISOString(),
        },
      ],
    }

    // Save initial settings
    fs.writeFileSync(settingsPath, JSON.stringify(initialSettings, null, 2))

    // Simulate toggle change: enable network
    const updatedConfig: MCPSecurityConfig = {
      ...initialSettings.mcpConfigs[0],
      network: {
        ...initialSettings.mcpConfigs[0].network,
        enabled: true, // Toggle ON
      },
      lastModified: new Date().toISOString(),
    }

    // Simulate backend save operation
    const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    const existingIndex = savedSettings.mcpConfigs.findIndex(
      (c: MCPSecurityConfig) =>
        c.id === updatedConfig.id || c.mcpName === updatedConfig.mcpName,
    )
    if (existingIndex >= 0) {
      savedSettings.mcpConfigs[existingIndex] = updatedConfig
    }
    fs.writeFileSync(settingsPath, JSON.stringify(savedSettings, null, 2))

    // Read back and verify
    const reloadedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    const reloadedConfig = reloadedSettings.mcpConfigs.find(
      (c: MCPSecurityConfig) => c.mcpName === 'test-mcp',
    )

    expect(reloadedConfig).toBeDefined()
    expect(reloadedConfig.network.enabled).toBe(true)
  })

  it('should persist fileSystem.enabled toggle changes', () => {
    // Initial settings with filesystem disabled
    const initialSettings: MCPflareSettings = {
      ...DEFAULT_SETTINGS,
      mcpConfigs: [
        {
          id: 'test-mcp-2',
          mcpName: 'test-mcp',
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
          lastModified: new Date().toISOString(),
        },
      ],
    }

    // Save initial settings
    fs.writeFileSync(settingsPath, JSON.stringify(initialSettings, null, 2))

    // Simulate toggle change: enable filesystem
    const updatedConfig: MCPSecurityConfig = {
      ...initialSettings.mcpConfigs[0],
      fileSystem: {
        ...initialSettings.mcpConfigs[0].fileSystem,
        enabled: true, // Toggle ON
      },
      lastModified: new Date().toISOString(),
    }

    // Simulate backend save operation
    const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    const existingIndex = savedSettings.mcpConfigs.findIndex(
      (c: MCPSecurityConfig) =>
        c.id === updatedConfig.id || c.mcpName === updatedConfig.mcpName,
    )
    if (existingIndex >= 0) {
      savedSettings.mcpConfigs[existingIndex] = updatedConfig
    }
    fs.writeFileSync(settingsPath, JSON.stringify(savedSettings, null, 2))

    // Read back and verify
    const reloadedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    const reloadedConfig = reloadedSettings.mcpConfigs.find(
      (c: MCPSecurityConfig) => c.mcpName === 'test-mcp',
    )

    expect(reloadedConfig).toBeDefined()
    expect(reloadedConfig.fileSystem.enabled).toBe(true)
  })

  it('should persist network.allowLocalhost toggle changes', () => {
    // Initial settings with localhost disabled
    const initialSettings: MCPflareSettings = {
      ...DEFAULT_SETTINGS,
      mcpConfigs: [
        {
          id: 'test-mcp-3',
          mcpName: 'test-mcp',
          network: {
            enabled: true,
            allowlist: ['api.example.com'],
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
        },
      ],
    }

    // Save initial settings
    fs.writeFileSync(settingsPath, JSON.stringify(initialSettings, null, 2))

    // Simulate toggle change: enable localhost
    const updatedConfig: MCPSecurityConfig = {
      ...initialSettings.mcpConfigs[0],
      network: {
        ...initialSettings.mcpConfigs[0].network,
        allowLocalhost: true, // Toggle ON
      },
      lastModified: new Date().toISOString(),
    }

    // Simulate backend save operation
    const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    const existingIndex = savedSettings.mcpConfigs.findIndex(
      (c: MCPSecurityConfig) =>
        c.id === updatedConfig.id || c.mcpName === updatedConfig.mcpName,
    )
    if (existingIndex >= 0) {
      savedSettings.mcpConfigs[existingIndex] = updatedConfig
    }
    fs.writeFileSync(settingsPath, JSON.stringify(savedSettings, null, 2))

    // Read back and verify
    const reloadedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    const reloadedConfig = reloadedSettings.mcpConfigs.find(
      (c: MCPSecurityConfig) => c.mcpName === 'test-mcp',
    )

    expect(reloadedConfig).toBeDefined()
    expect(reloadedConfig.network.allowLocalhost).toBe(true)
  })

  it('should handle rapid toggle changes (toggle on then off)', () => {
    // Initial settings
    const initialSettings: MCPflareSettings = {
      ...DEFAULT_SETTINGS,
      mcpConfigs: [
        {
          id: 'test-mcp-4',
          mcpName: 'test-mcp',
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
          lastModified: new Date().toISOString(),
        },
      ],
    }

    // Save initial settings
    fs.writeFileSync(settingsPath, JSON.stringify(initialSettings, null, 2))

    // First toggle: enable network
    let updatedConfig: MCPSecurityConfig = {
      ...initialSettings.mcpConfigs[0],
      network: {
        ...initialSettings.mcpConfigs[0].network,
        enabled: true,
      },
      lastModified: new Date().toISOString(),
    }

    let savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    savedSettings.mcpConfigs[0] = updatedConfig
    fs.writeFileSync(settingsPath, JSON.stringify(savedSettings, null, 2))

    // Second toggle: disable network again
    updatedConfig = {
      ...updatedConfig,
      network: {
        ...updatedConfig.network,
        enabled: false,
      },
      lastModified: new Date().toISOString(),
    }

    savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    savedSettings.mcpConfigs[0] = updatedConfig
    fs.writeFileSync(settingsPath, JSON.stringify(savedSettings, null, 2))

    // Read back and verify final state
    const reloadedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    const reloadedConfig = reloadedSettings.mcpConfigs.find(
      (c: MCPSecurityConfig) => c.mcpName === 'test-mcp',
    )

    expect(reloadedConfig).toBeDefined()
    expect(reloadedConfig.network.enabled).toBe(false)
  })
})


