import { ConfigManager } from '../../src/utils/config-manager.js'
import { WorkerManager } from '../../src/server/worker-manager.js'

/**
 * Known test MCP config names that should be cleaned up
 * These are the names used in tests that might get saved to the real config file
 */
const TEST_CONFIG_NAMES = [
  'filesystem-test',
  'memory-test',
  'fetch-test',
  'test-mcp',
  'test-id',
  'simple',
  'no-env',
  'tool1',
  'tool2',
  'test',
  'nested',
  'missing',
  'github',
  'imported_tool',
  'tool',
] as const

/**
 * Test helper to track and clean up MCP configs created during tests
 */
export class TestConfigCleanup {
  private configManager: ConfigManager
  private testConfigNames: Set<string> = new Set()

  constructor() {
    this.configManager = new ConfigManager()
  }

  /**
   * Track an MCP config name that was created during tests
   */
  trackConfig(mcpName: string): void {
    this.testConfigNames.add(mcpName)
  }

  /**
   * Clean up all tracked test configs AND known test config names
   * This ensures we clean up configs even if tracking failed
   */
  cleanup(): void {
    const configsToDelete = new Set<string>()

    // Add tracked configs
    for (const name of this.testConfigNames) {
      configsToDelete.add(name)
    }

    // Add known test config names
    for (const name of TEST_CONFIG_NAMES) {
      configsToDelete.add(name)
    }

    // Also check the actual config file for any test configs
    // This catches configs that were saved even if tracking failed
    try {
      const savedConfigs = this.configManager.getSavedConfigs()
      for (const name of Object.keys(savedConfigs)) {
        // If it matches a test pattern, add it
        const lowerName = name.toLowerCase()
        if (
          TEST_CONFIG_NAMES.includes(name as any) ||
          lowerName.includes('-test') ||
          lowerName === 'test' ||
          lowerName.startsWith('test-') ||
          lowerName.includes('test-') ||
          // Also catch common test patterns
          lowerName === 'simple' ||
          lowerName === 'no-env' ||
          lowerName === 'tool1' ||
          lowerName === 'tool2' ||
          lowerName === 'nested' ||
          lowerName === 'missing' ||
          lowerName === 'github' ||
          lowerName === 'tool' ||
          lowerName === 'imported_tool' ||
          lowerName.startsWith('filesystem') ||
          lowerName.startsWith('memory')
        ) {
          configsToDelete.add(name)
        }
      }
    } catch (error) {
      // Ignore errors when reading configs
    }

    // Delete all identified test configs
    let deletedCount = 0
    for (const mcpName of configsToDelete) {
      try {
        const deleted = this.configManager.deleteConfig(mcpName)
        if (deleted) {
          deletedCount++
        }
      } catch (error) {
        // Ignore cleanup errors (config might not exist or already deleted)
      }
    }

    this.testConfigNames.clear()
  }

  /**
   * Get all tracked config names
   */
  getTrackedConfigs(): string[] {
    return Array.from(this.testConfigNames)
  }
}

/**
 * Global test config cleanup instance
 * Tests should use this to track configs they create
 */
export const testConfigCleanup = new TestConfigCleanup()

/**
 * Global WorkerManager instances created during tests
 * Used to ensure all processes are cleaned up
 */
const testWorkerManagers: Set<WorkerManager> = new Set()

/**
 * Track a WorkerManager instance for cleanup
 */
export function trackWorkerManager(manager: WorkerManager): void {
  testWorkerManagers.add(manager)
}

/**
 * Clean up all WorkerManager instances (kills all processes)
 */
export async function cleanupWorkerManagers(): Promise<void> {
  const cleanupPromises = Array.from(testWorkerManagers).map(
    async (manager) => {
      try {
        await manager.shutdown()
      } catch (error) {
        // Ignore cleanup errors
      }
    },
  )

  await Promise.allSettled(cleanupPromises)
  testWorkerManagers.clear()
}
