import { ConfigManager } from '../../src/utils/config-manager.js';
import { TEST_MCP_PREFIX, testConfigCleanup, cleanupWorkerManagers } from './config-cleanup.js';

/**
 * Global teardown hook for Vitest
 * Ensures all test-created MCP configs and processes are cleaned up even if tests fail
 */
export default async function globalTeardown() {
  try {
    // Clean up all WorkerManager instances (kills all Wrangler and MCP processes)
    await cleanupWorkerManagers();
    
    // Wait longer for processes to terminate (Wrangler processes can take time to die)
    // The killProcessTree method uses taskkill on Windows which kills child processes
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    // Clean up any MCP configs that were saved during tests
    testConfigCleanup.cleanup();
    
    // Safety net: Also clean up any configs with the test prefix that might have been missed
    // This is a fallback in case trackConfig() wasn't called for some reason
    try {
      const configManager = new ConfigManager();
      const allConfigs = configManager.getSavedConfigs();
      for (const [mcpName] of Object.entries(allConfigs)) {
        if (mcpName.startsWith(TEST_MCP_PREFIX)) {
          console.log(`[Global Teardown] Cleaning up leftover test config: ${mcpName}`);
          try {
            configManager.deleteConfig(mcpName);
          } catch {
            // Ignore errors (config might already be deleted)
          }
        }
      }
      
      // Also check disabled MCPs
      const disabledMCPs = configManager.getDisabledMCPs();
      for (const mcpName of disabledMCPs) {
        if (mcpName.startsWith(TEST_MCP_PREFIX)) {
          console.log(`[Global Teardown] Cleaning up leftover disabled test config: ${mcpName}`);
          try {
            // Re-enable it first, then delete it
            configManager.enableMCP(mcpName);
            configManager.deleteConfig(mcpName);
          } catch {
            // Ignore errors
          }
        }
      }
    } catch (error) {
      // Don't fail teardown if cleanup fails
      console.warn('[Global Teardown] Error during safety net cleanup:', error);
    }
  } catch (error) {
    // Ensure teardown doesn't fail silently
    console.error('Error in global teardown:', error);
    throw error;
  }
}
