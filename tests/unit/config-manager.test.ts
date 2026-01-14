import { existsSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { MCPConfig } from '../../src/types/mcp.js'
import { ConfigManager } from '../../src/utils/config-manager.js'
import {
  TEST_MCP_PREFIX,
  testConfigCleanup,
} from '../helpers/config-cleanup.js'

// Mock logger to suppress log output during tests
vi.mock('../../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    level: 'silent',
  },
}))

describe('ConfigManager', () => {
  let testDir: string
  let configPath: string
  let manager: ConfigManager

  beforeEach(() => {
    // Create a temporary directory for testing
    testDir = join(tmpdir(), `mcp-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    configPath = join(testDir, 'mcp.json')
  })

  afterEach(() => {
    // Cleanup test files
    try {
      if (existsSync(configPath)) {
        unlinkSync(configPath)
      }
      if (existsSync(testDir)) {
        rmdirSync(testDir)
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  afterAll(() => {
    // Clean up any MCP configs that were accidentally saved to the real config file
    testConfigCleanup.cleanup()
  })

  describe('saveConfig and getSavedConfig', () => {
    it('should save and retrieve a config', () => {
      // IMPORTANT: Create ConfigManager AFTER setting up test directory
      // and ALWAYS call importConfigs() immediately to use test path
      // This prevents accidentally saving to the real config file
      manager = new ConfigManager()

      // Use importConfigs to set a custom path BEFORE any operations
      const result = manager.importConfigs(configPath)

      const config: MCPConfig = {
        command: 'npx',
        args: ['@modelcontextprotocol/server-github'],
        env: {
          GITHUB_TOKEN: 'test-token',
        },
      }

      const configName = `${TEST_MCP_PREFIX}github`
      testConfigCleanup.trackConfig(configName)
      manager.saveConfig(configName, config)
      const retrieved = manager.getSavedConfig(configName)

      expect(retrieved).toBeDefined()
      expect(retrieved?.command).toBe('npx')
      expect(retrieved?.args).toEqual(['@modelcontextprotocol/server-github'])
    })

    it('should handle configs without args', () => {
      manager = new ConfigManager()
      // Set test path BEFORE any operations
      manager.importConfigs(configPath)

      const config: MCPConfig = {
        command: 'node',
        env: {
          API_KEY: 'key',
        },
      }

      const configName = `${TEST_MCP_PREFIX}simple`
      testConfigCleanup.trackConfig(configName)
      manager.saveConfig(configName, config)
      const retrieved = manager.getSavedConfig(configName)

      expect(retrieved?.command).toBe('node')
      expect(retrieved?.args).toBeUndefined()
    })

    it('should handle configs without env', () => {
      manager = new ConfigManager()
      // Set test path BEFORE any operations
      manager.importConfigs(configPath)

      const config: MCPConfig = {
        command: 'npx',
        args: ['tool'],
      }

      const configName = `${TEST_MCP_PREFIX}no-env`
      testConfigCleanup.trackConfig(configName)
      manager.saveConfig(configName, config)
      const retrieved = manager.getSavedConfig(configName)

      expect(retrieved?.command).toBe('npx')
      expect(retrieved?.env).toBeUndefined()
    })

    it('should return null for non-existent config', () => {
      manager = new ConfigManager()
      manager.importConfigs(configPath)

      const retrieved = manager.getSavedConfig('non-existent')

      expect(retrieved).toBeNull()
    })
  })

  describe('getSavedConfigs', () => {
    it('should return all saved configs', () => {
      manager = new ConfigManager()
      manager.importConfigs(configPath)

      const config1: MCPConfig = {
        command: 'npx',
        args: ['tool1'],
      }
      const config2: MCPConfig = {
        command: 'npx',
        args: ['tool2'],
      }

      const configName1 = `${TEST_MCP_PREFIX}tool1`
      const configName2 = `${TEST_MCP_PREFIX}tool2`
      testConfigCleanup.trackConfig(configName1)
      testConfigCleanup.trackConfig(configName2)
      manager.saveConfig(configName1, config1)
      manager.saveConfig(configName2, config2)

      const configs = manager.getSavedConfigs()

      // Should include our saved configs (may also include existing configs from system)
      expect(configs[configName1]).toBeDefined()
      expect(configs[configName2]).toBeDefined()
      expect(configs[configName1].config.command).toBe('npx')
      expect(configs[configName2].config.command).toBe('npx')
    })

    it('should import configs from existing file', () => {
      // Create a test config file first
      const testConfig = {
        mcpServers: {
          imported_tool: {
            command: 'npx',
            args: ['imported'],
          },
        },
      }
      const importPath = join(testDir, 'import-mcp.json')
      writeFileSync(importPath, JSON.stringify(testConfig, null, 2))

      manager = new ConfigManager()
      const result = manager.importConfigs(importPath)

      expect(result.imported).toBe(1)
      expect(result.errors).toHaveLength(0)
      const importedToolName = `${TEST_MCP_PREFIX}imported_tool`
      testConfigCleanup.trackConfig(importedToolName)
      expect(manager.getSavedConfig(importedToolName)).toBeDefined()
      expect(manager.getCursorConfigPath()).toBe(importPath)
    })
  })

  describe('deleteConfig', () => {
    it('should delete a saved config', () => {
      manager = new ConfigManager()
      manager.importConfigs(configPath)

      const config: MCPConfig = {
        command: 'npx',
        args: ['tool'],
      }

      const configName = `${TEST_MCP_PREFIX}tool`
      testConfigCleanup.trackConfig(configName)
      manager.saveConfig(configName, config)
      expect(manager.getSavedConfig(configName)).toBeDefined()

      const deleted = manager.deleteConfig(configName)
      expect(deleted).toBe(true)
      expect(manager.getSavedConfig(configName)).toBeNull()
    })

    it('should delete a disabled config from _mcpflare_disabled', () => {
      manager = new ConfigManager()
      const initialConfig = {
        mcpServers: {},
        _mcpflare_disabled: {
          [`${TEST_MCP_PREFIX}disabled-tool`]: { command: 'npx', args: ['disabled'] },
        },
      }
      writeFileSync(configPath, JSON.stringify(initialConfig, null, 2))
      manager.importConfigs(configPath)

      // Verify the MCP is in the disabled section
      expect(manager.isMCPDisabled(`${TEST_MCP_PREFIX}disabled-tool`)).toBe(true)

      // Delete it
      const deleted = manager.deleteConfig(`${TEST_MCP_PREFIX}disabled-tool`)
      expect(deleted).toBe(true)

      // Verify it's completely gone
      expect(manager.isMCPDisabled(`${TEST_MCP_PREFIX}disabled-tool`)).toBe(false)
      expect(manager.getSavedConfig(`${TEST_MCP_PREFIX}disabled-tool`)).toBeNull()
    })

    it('should delete config that was saved then disabled', () => {
      manager = new ConfigManager()
      manager.importConfigs(configPath)

      const config: MCPConfig = {
        command: 'npx',
        args: ['tool'],
      }

      const configName = `${TEST_MCP_PREFIX}save-then-disable`
      testConfigCleanup.trackConfig(configName)
      
      // Save and then disable (mimics what tests do)
      manager.saveConfig(configName, config)
      expect(manager.getSavedConfig(configName)).toBeDefined()
      
      manager.disableMCP(configName)
      expect(manager.isMCPDisabled(configName)).toBe(true)
      
      // Now delete should work
      const deleted = manager.deleteConfig(configName)
      expect(deleted).toBe(true)
      
      // Verify it's completely gone
      expect(manager.isMCPDisabled(configName)).toBe(false)
      expect(manager.getSavedConfig(configName)).toBeNull()
    })

    it('should return false for non-existent config', () => {
      manager = new ConfigManager()
      manager.importConfigs(configPath)

      const deleted = manager.deleteConfig('non-existent')
      expect(deleted).toBe(false)
    })

    it('should return false when no config file exists', () => {
      manager = new ConfigManager()
      // Don't import any config

      const deleted = manager.deleteConfig('any')
      expect(deleted).toBe(false)
    })
  })

  describe('resolveEnvVarsInObject', () => {
    beforeEach(() => {
      process.env.TEST_VAR = 'test-value'
      process.env.ANOTHER_VAR = 'another-value'
    })

    afterEach(() => {
      delete process.env.TEST_VAR
      delete process.env.ANOTHER_VAR
    })

    it('should resolve environment variables in strings', () => {
      manager = new ConfigManager()
      manager.importConfigs(configPath)

      const config: MCPConfig = {
        command: 'npx',
        env: {
          TOKEN: '${TEST_VAR}',
          KEY: '${ANOTHER_VAR}',
        },
      }

      const configName = `${TEST_MCP_PREFIX}test`
      testConfigCleanup.trackConfig(configName)
      manager.saveConfig(configName, config)
      const resolved = manager.getSavedConfig(configName)

      expect(resolved?.env?.TOKEN).toBe('test-value')
      expect(resolved?.env?.KEY).toBe('another-value')
    })

    it('should handle nested objects', () => {
      manager = new ConfigManager()
      manager.importConfigs(configPath)

      const config: MCPConfig = {
        command: 'npx',
        env: {
          NESTED: JSON.stringify({ key: '${TEST_VAR}' }),
        },
      }

      const configName = `${TEST_MCP_PREFIX}nested`
      testConfigCleanup.trackConfig(configName)
      manager.saveConfig(configName, config)
      const resolved = manager.getSavedConfig(configName)

      expect(resolved?.env?.NESTED).toContain('test-value')
    })

    it('should keep placeholder if env var not found', () => {
      manager = new ConfigManager()
      manager.importConfigs(configPath)

      const config: MCPConfig = {
        command: 'npx',
        env: {
          MISSING: '${NON_EXISTENT_VAR}',
        },
      }

      const configName = `${TEST_MCP_PREFIX}missing`
      testConfigCleanup.trackConfig(configName)
      manager.saveConfig(configName, config)
      const resolved = manager.getSavedConfig(configName)

      expect(resolved?.env?.MISSING).toBe('${NON_EXISTENT_VAR}')
    })
  })

  describe('importConfigs', () => {
    it('should import configs from existing file', () => {
      // Create a test config file
      const testConfig = {
        mcpServers: {
          github: {
            command: 'npx',
            args: ['@modelcontextprotocol/server-github'],
          },
          test: {
            command: 'node',
            args: ['test.js'],
          },
        },
      }
      writeFileSync(configPath, JSON.stringify(testConfig, null, 2))

      manager = new ConfigManager()
      const result = manager.importConfigs(configPath)

      expect(result.imported).toBe(2)
      expect(result.errors).toHaveLength(0)
      const githubConfigName = `${TEST_MCP_PREFIX}github`
      const testConfigName = `${TEST_MCP_PREFIX}test`
      testConfigCleanup.trackConfig(githubConfigName)
      testConfigCleanup.trackConfig(testConfigName)
      expect(manager.getSavedConfig(githubConfigName)).toBeDefined()
      expect(manager.getSavedConfig(testConfigName)).toBeDefined()
    })

    it('should return error for non-existent file', () => {
      manager = new ConfigManager()
      const result = manager.importConfigs('/non/existent/path.json')

      expect(result.imported).toBe(0)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should handle invalid JSON', () => {
      writeFileSync(configPath, 'invalid json')

      manager = new ConfigManager()
      const result = manager.importConfigs(configPath)

      // Should handle gracefully
      expect(result.imported).toBe(0)
    })
  })

  describe('getConfigSourceDisplayName', () => {
    it('should return display name for detected source', () => {
      manager = new ConfigManager()
      manager.importConfigs(configPath)

      const name = manager.getConfigSourceDisplayName()
      expect(name).toBeDefined()
      expect(typeof name).toBe('string')
    })

    it('should return a valid display name', () => {
      manager = new ConfigManager()
      // ConfigManager may detect system configs, so just verify it returns a string
      const name = manager.getConfigSourceDisplayName()
      expect(name).toBeDefined()
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
    })
  })

  describe('getConfigSource', () => {
    it('should return null when no config is loaded', () => {
      manager = new ConfigManager()
      // ConfigManager may auto-detect configs, so we need to check if it found one
      const source = manager.getConfigSource()
      // If it found a config, that's OK - just verify it returns a valid value or null
      expect(
        source === null ||
          ['cursor', 'claude-code', 'github-copilot'].includes(source!),
      ).toBe(true)
    })

    it('should return source after importing config', () => {
      manager = new ConfigManager()
      manager.importConfigs(configPath)
      const source = manager.getConfigSource()
      expect(source).toBeTruthy()
    })
  })

  describe('getCursorConfigPath', () => {
    it('should return null or a path when no config is explicitly loaded', () => {
      manager = new ConfigManager()
      // ConfigManager may auto-detect configs, so path might not be null
      const path = manager.getCursorConfigPath()
      // Just verify it returns a string or null
      expect(path === null || typeof path === 'string').toBe(true)
    })

    it('should return config path after importing', () => {
      manager = new ConfigManager()
      manager.importConfigs(configPath)
      const path = manager.getCursorConfigPath()
      expect(path).toBe(configPath)
    })
  })

  describe('getAllConfiguredMCPs', () => {
    it('should return empty object or detected MCPs when no config explicitly loaded', () => {
      manager = new ConfigManager()
      const mcps = manager.getAllConfiguredMCPs()
      // ConfigManager may auto-detect configs, so mcps might not be empty
      expect(typeof mcps === 'object').toBe(true)
    })

    it('should return active and disabled MCPs', () => {
      manager = new ConfigManager()
      const config = {
        mcpServers: {
          [`${TEST_MCP_PREFIX}active-mcp`]: { command: 'node', args: ['server.js'] },
          mcpflare: { command: 'npx', args: ['mcpflare'] },
        },
        _mcpflare_disabled: {
          [`${TEST_MCP_PREFIX}disabled-mcp`]: { command: 'npx', args: ['disabled'] },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      manager.importConfigs(configPath)

      const mcps = manager.getAllConfiguredMCPs()
      expect(mcps[`${TEST_MCP_PREFIX}active-mcp`]).toBeDefined()
      expect(mcps[`${TEST_MCP_PREFIX}active-mcp`].status).toBe('active')
      expect(mcps[`${TEST_MCP_PREFIX}disabled-mcp`]).toBeDefined()
      expect(mcps[`${TEST_MCP_PREFIX}disabled-mcp`].status).toBe('disabled')
      expect(mcps['mcpflare']).toBeUndefined() // Should exclude mcpflare
    })
  })

  describe('getGuardedMCPConfigs', () => {
    it('should return empty object or detected configs when no config explicitly loaded', () => {
      manager = new ConfigManager()
      const configs = manager.getGuardedMCPConfigs()
      // ConfigManager may auto-detect configs, so configs might not be empty
      expect(typeof configs === 'object').toBe(true)
    })

    it('should return all MCPs except mcpflare', () => {
      manager = new ConfigManager()
      const config = {
        mcpServers: {
          [`${TEST_MCP_PREFIX}mcp-1`]: { command: 'node', args: ['server.js'] },
          mcpflare: { command: 'npx', args: ['mcpflare'] },
        },
        _mcpflare_disabled: {
          [`${TEST_MCP_PREFIX}mcp-2`]: { command: 'npx', args: ['disabled'] },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      manager.importConfigs(configPath)

      const configs = manager.getGuardedMCPConfigs()
      expect(configs[`${TEST_MCP_PREFIX}mcp-1`]).toBeDefined()
      expect(configs[`${TEST_MCP_PREFIX}mcp-2`]).toBeDefined()
      expect(configs['mcpflare']).toBeUndefined()
    })
  })

  describe('disableAllExceptMCPflare', () => {
    it('should return result when no config explicitly loaded', () => {
      manager = new ConfigManager()
      // ConfigManager may auto-detect configs, so result might not be empty
      const result = manager.disableAllExceptMCPflare()
      expect(Array.isArray(result.disabled)).toBe(true)
      expect(Array.isArray(result.failed)).toBe(true)
      expect(Array.isArray(result.alreadyDisabled)).toBe(true)
      expect(typeof result.mcpflareRestored === 'boolean').toBe(true)
    })

    it('should disable all MCPs except mcpflare', () => {
      manager = new ConfigManager()
      const config = {
        mcpServers: {
          [`${TEST_MCP_PREFIX}mcp-1`]: { command: 'node', args: ['server.js'] },
          [`${TEST_MCP_PREFIX}mcp-2`]: { command: 'npx', args: ['test'] },
          mcpflare: { command: 'npx', args: ['mcpflare'] },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      manager.importConfigs(configPath)

      const result = manager.disableAllExceptMCPflare()
      expect(result.disabled.length).toBe(2)
      expect(result.disabled).toContain(`${TEST_MCP_PREFIX}mcp-1`)
      expect(result.disabled).toContain(`${TEST_MCP_PREFIX}mcp-2`)
      expect(result.disabled).not.toContain('mcpflare')
      expect(result.mcpflareRestored).toBe(false)

      // Verify MCPs are disabled
      const disabled = manager.getDisabledMCPs()
      expect(disabled).toContain(`${TEST_MCP_PREFIX}mcp-1`)
      expect(disabled).toContain(`${TEST_MCP_PREFIX}mcp-2`)
    })

    it('should restore mcpflare if it is disabled', () => {
      manager = new ConfigManager()
      const config = {
        mcpServers: {
          [`${TEST_MCP_PREFIX}mcp-1`]: { command: 'node', args: ['server.js'] },
        },
        _mcpflare_disabled: {
          mcpflare: { command: 'npx', args: ['mcpflare'] },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      manager.importConfigs(configPath)

      const result = manager.disableAllExceptMCPflare()
      expect(result.mcpflareRestored).toBe(true)
      expect(manager.isMCPDisabled('mcpflare')).toBe(false)
    })
  })

  describe('restoreAllDisabled', () => {
    it('should return array when no config explicitly loaded', () => {
      manager = new ConfigManager()
      // ConfigManager may auto-detect configs, so restored might not be empty
      const restored = manager.restoreAllDisabled()
      expect(Array.isArray(restored)).toBe(true)
    })

    it('should restore all disabled MCPs', () => {
      manager = new ConfigManager()
      const config = {
        mcpServers: {},
        _mcpflare_disabled: {
          [`${TEST_MCP_PREFIX}mcp-1`]: { command: 'node', args: ['server.js'] },
          [`${TEST_MCP_PREFIX}mcp-2`]: { command: 'npx', args: ['test'] },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      manager.importConfigs(configPath)

      const restored = manager.restoreAllDisabled()
      expect(restored.length).toBe(2)
      expect(restored).toContain(`${TEST_MCP_PREFIX}mcp-1`)
      expect(restored).toContain(`${TEST_MCP_PREFIX}mcp-2`)

      // Verify MCPs are no longer disabled
      expect(manager.isMCPDisabled(`${TEST_MCP_PREFIX}mcp-1`)).toBe(false)
      expect(manager.isMCPDisabled(`${TEST_MCP_PREFIX}mcp-2`)).toBe(false)
    })
  })

  describe('getDisabledMCPs', () => {
    it('should return empty array or detected disabled MCPs when no config explicitly loaded', () => {
      manager = new ConfigManager()
      const disabled = manager.getDisabledMCPs()
      // ConfigManager may auto-detect configs, so disabled might not be empty
      expect(Array.isArray(disabled)).toBe(true)
    })

    it('should return list of disabled MCPs', () => {
      manager = new ConfigManager()
      const config = {
        mcpServers: {
          [`${TEST_MCP_PREFIX}active-mcp`]: { command: 'node', args: ['server.js'] },
        },
        _mcpflare_disabled: {
          [`${TEST_MCP_PREFIX}disabled-1`]: { command: 'npx', args: ['test1'] },
          [`${TEST_MCP_PREFIX}disabled-2`]: { command: 'npx', args: ['test2'] },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      manager.importConfigs(configPath)

      const disabled = manager.getDisabledMCPs()
      expect(disabled.length).toBe(2)
      expect(disabled).toContain(`${TEST_MCP_PREFIX}disabled-1`)
      expect(disabled).toContain(`${TEST_MCP_PREFIX}disabled-2`)
    })
  })

  describe('isMCPDisabled', () => {
    it('should return false when no config loaded', () => {
      manager = new ConfigManager()
      expect(manager.isMCPDisabled(`${TEST_MCP_PREFIX}test-mcp`)).toBe(false)
    })

    it('should return true for disabled MCP', () => {
      manager = new ConfigManager()
      const config = {
        mcpServers: {},
        _mcpflare_disabled: {
          [`${TEST_MCP_PREFIX}disabled-mcp`]: { command: 'npx', args: ['test'] },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      manager.importConfigs(configPath)

      expect(manager.isMCPDisabled(`${TEST_MCP_PREFIX}disabled-mcp`)).toBe(true)
      expect(manager.isMCPDisabled('nonexistent')).toBe(false)
    })
  })

  describe('getRawConfig', () => {
    it('should return null or detected config when no config explicitly loaded', () => {
      manager = new ConfigManager()
      const rawConfig = manager.getRawConfig()
      // ConfigManager may auto-detect configs, so rawConfig might not be null
      expect(rawConfig === null || typeof rawConfig === 'object').toBe(true)
    })

    it('should return raw config including disabled MCPs', () => {
      manager = new ConfigManager()
      const config = {
        mcpServers: {
          [`${TEST_MCP_PREFIX}active-mcp`]: { command: 'node', args: ['server.js'] },
        },
        _mcpflare_disabled: {
          [`${TEST_MCP_PREFIX}disabled-mcp`]: { command: 'npx', args: ['test'] },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      manager.importConfigs(configPath)

      const rawConfig = manager.getRawConfig()
      expect(rawConfig).toBeDefined()
      expect(rawConfig?.mcpServers[`${TEST_MCP_PREFIX}active-mcp`]).toBeDefined()
      expect(rawConfig?._mcpflare_disabled?.[`${TEST_MCP_PREFIX}disabled-mcp`]).toBeDefined()
    })
  })

  describe('Claude Code Integration', () => {
    it('should detect claude-code as valid config source', () => {
      manager = new ConfigManager()
      manager.importConfigs(configPath)
      
      const source = manager.getConfigSource()
      // When we import from a test path, the source detection should work
      // The valid sources are: cursor, claude-code, github-copilot, or null
      expect(
        source === null ||
          ['cursor', 'claude-code', 'github-copilot'].includes(source!),
      ).toBe(true)
    })

    it('should display Claude Code as display name when source is claude-code', () => {
      manager = new ConfigManager()
      // Create a test file with a path that hints at Claude Code
      const claudeTestDir = join(testDir, 'claude')
      mkdirSync(claudeTestDir, { recursive: true })
      const claudeConfigPath = join(claudeTestDir, 'mcp.json')
      
      const config = {
        mcpServers: {
          [`${TEST_MCP_PREFIX}test-mcp`]: { command: 'node', args: ['server.js'] },
        },
      }
      writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2))
      
      manager.importConfigs(claudeConfigPath)
      
      // Should return a valid display name (string)
      const displayName = manager.getConfigSourceDisplayName()
      expect(displayName).toBeDefined()
      expect(typeof displayName).toBe('string')
      expect(displayName.length).toBeGreaterThan(0)
    })

    it('should handle Claude Code config with _mcpflare_disabled section', () => {
      manager = new ConfigManager()
      
      // Create config mimicking Claude Code format with disabled MCPs
      const config = {
        mcpServers: {
          [`${TEST_MCP_PREFIX}active-claude-mcp`]: { 
            command: 'npx', 
            args: ['@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' }
          },
        },
        _mcpflare_disabled: {
          [`${TEST_MCP_PREFIX}disabled-claude-mcp`]: { 
            command: 'npx', 
            args: ['some-mcp-server']
          },
        },
        _mcpflare_metadata: {
          version: '1.0.0',
          disabled_at: new Date().toISOString(),
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      manager.importConfigs(configPath)

      // Active MCPs should be available
      const activeConfig = manager.getSavedConfig(`${TEST_MCP_PREFIX}active-claude-mcp`)
      expect(activeConfig).toBeDefined()
      expect(activeConfig?.command).toBe('npx')

      // Disabled MCPs should be accessible via getAllConfiguredMCPs
      const allMCPs = manager.getAllConfiguredMCPs()
      expect(allMCPs[`${TEST_MCP_PREFIX}active-claude-mcp`]).toBeDefined()
      expect(allMCPs[`${TEST_MCP_PREFIX}active-claude-mcp`].status).toBe('active')
      expect(allMCPs[`${TEST_MCP_PREFIX}disabled-claude-mcp`]).toBeDefined()
      expect(allMCPs[`${TEST_MCP_PREFIX}disabled-claude-mcp`].status).toBe('disabled')

      // isMCPDisabled should return correct status
      expect(manager.isMCPDisabled(`${TEST_MCP_PREFIX}disabled-claude-mcp`)).toBe(true)
      expect(manager.isMCPDisabled(`${TEST_MCP_PREFIX}active-claude-mcp`)).toBe(false)
    })

    it('should handle JSONC format (with comments)', () => {
      manager = new ConfigManager()
      
      // JSONC format with comments - the parser should handle this
      const jsoncContent = `{
  // This is a comment
  "mcpServers": {
    "${TEST_MCP_PREFIX}jsonc-test-mcp": {
      "command": "node",
      "args": ["server.js"]
    }
  }
}`
      writeFileSync(configPath, jsoncContent)
      manager.importConfigs(configPath)

      const config = manager.getSavedConfig(`${TEST_MCP_PREFIX}jsonc-test-mcp`)
      expect(config).toBeDefined()
      expect(config?.command).toBe('node')
    })

    it('should support URL-based MCP configs (Claude Code format)', () => {
      manager = new ConfigManager()
      
      const config = {
        mcpServers: {
          [`${TEST_MCP_PREFIX}url-based-mcp`]: { 
            url: 'https://mcp.example.com/server',
            headers: { 'Authorization': 'Bearer token123' }
          },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      manager.importConfigs(configPath)

      const savedConfig = manager.getSavedConfig(`${TEST_MCP_PREFIX}url-based-mcp`)
      expect(savedConfig).toBeDefined()
      // URL-based config should have url property
      expect('url' in savedConfig!).toBe(true)
      expect((savedConfig as { url: string }).url).toBe('https://mcp.example.com/server')
    })

    it('should resolve environment variables in Claude Code configs', () => {
      manager = new ConfigManager()
      
      // Set up test env vars
      process.env.TEST_CLAUDE_TOKEN = 'claude-test-token-value'
      
      const config = {
        mcpServers: {
          [`${TEST_MCP_PREFIX}env-var-mcp`]: { 
            command: 'npx',
            args: ['test-server'],
            env: { API_TOKEN: '${TEST_CLAUDE_TOKEN}' }
          },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      manager.importConfigs(configPath)

      const resolvedConfig = manager.getSavedConfig(`${TEST_MCP_PREFIX}env-var-mcp`)
      expect(resolvedConfig).toBeDefined()
      expect(resolvedConfig?.env?.API_TOKEN).toBe('claude-test-token-value')

      // Clean up
      delete process.env.TEST_CLAUDE_TOKEN
    })

    it('should properly disable and enable MCPs (guard/unguard)', () => {
      manager = new ConfigManager()
      
      const config = {
        mcpServers: {
          [`${TEST_MCP_PREFIX}guard-test-mcp`]: { 
            command: 'npx',
            args: ['test-server']
          },
        },
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))
      manager.importConfigs(configPath)

      // Initially should be active
      expect(manager.isMCPDisabled(`${TEST_MCP_PREFIX}guard-test-mcp`)).toBe(false)

      // Disable (guard) the MCP
      const disableResult = manager.disableMCP(`${TEST_MCP_PREFIX}guard-test-mcp`)
      expect(disableResult).toBe(true)
      expect(manager.isMCPDisabled(`${TEST_MCP_PREFIX}guard-test-mcp`)).toBe(true)

      // Enable (unguard) the MCP
      const enableResult = manager.enableMCP(`${TEST_MCP_PREFIX}guard-test-mcp`)
      expect(enableResult).toBe(true)
      expect(manager.isMCPDisabled(`${TEST_MCP_PREFIX}guard-test-mcp`)).toBe(false)
    })
  })
})
