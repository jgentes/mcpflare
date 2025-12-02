import type { WorkerManager } from '../../src/server/worker-manager.js'
import { ConfigManager } from '../../src/utils/config-manager.js'

/**
 * Prefix that ALL test MCP config names MUST use
 * This ensures test configs never conflict with real user configurations
 */
export const TEST_MCP_PREFIX = '__TEST__'

/**
 * Validate that an MCP name uses the test prefix
 * Throws an error if the name doesn't start with the prefix
 */
export function validateTestMCPName(mcpName: string): void {
  if (!mcpName.startsWith(TEST_MCP_PREFIX)) {
    throw new Error(
      `Test MCP name "${mcpName}" must start with "${TEST_MCP_PREFIX}" to prevent conflicts with real configs. ` +
        `Use "${TEST_MCP_PREFIX}${mcpName}" instead.`,
    )
  }
}

/**
 * Test helper to track and clean up MCP configs created during tests
 *
 * IMPORTANT: Only configs explicitly tracked via trackConfig() will be deleted.
 * This prevents accidentally deleting real user configurations.
 * Tests MUST call trackConfig() for every config they create.
 * 
 * ALL test MCP names MUST use the TEST_MCP_PREFIX to prevent conflicts.
 */
export class TestConfigCleanup {
  private configManager: ConfigManager
  private testConfigNames: Set<string> = new Set()

  constructor() {
    this.configManager = new ConfigManager()
  }

  /**
   * Track an MCP config name that was created during tests
   * This config will be deleted during cleanup.
   *
   * Tests MUST call this for every config they create to prevent
   * accidentally deleting real user configurations.
   * 
   * The MCP name MUST start with TEST_MCP_PREFIX to prevent conflicts.
   */
  trackConfig(mcpName: string): void {
    validateTestMCPName(mcpName)
    this.testConfigNames.add(mcpName)
  }

  /**
   * Clean up all tracked test configs ONLY
   *
   * This only deletes configs that were explicitly tracked via trackConfig().
   * We do NOT use string matching or heuristics to avoid accidentally
   * deleting real user configurations (e.g., a real "github" MCP).
   * 
   * Also validates that all tracked names use the test prefix as a safety check.
   */
  cleanup(): void {
    if (this.testConfigNames.size === 0) {
      return
    }

    // Double-check all names use the prefix (safety check)
    for (const mcpName of this.testConfigNames) {
      if (!mcpName.startsWith(TEST_MCP_PREFIX)) {
        console.error(
          `WARNING: Attempting to cleanup non-test MCP "${mcpName}". Skipping to prevent data loss.`,
        )
        continue
      }
    }

    // Delete only tracked configs that use the test prefix
    for (const mcpName of this.testConfigNames) {
      if (!mcpName.startsWith(TEST_MCP_PREFIX)) {
        continue // Skip non-prefixed names
      }
      try {
        this.configManager.deleteConfig(mcpName)
      } catch {
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
      } catch {
        // Ignore cleanup errors
      }
    },
  )

  await Promise.allSettled(cleanupPromises)
  testWorkerManagers.clear()
}
