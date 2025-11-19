import { testConfigCleanup, cleanupWorkerManagers } from './config-cleanup.js';

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
  } catch (error) {
    // Ensure teardown doesn't fail silently
    console.error('Error in global teardown:', error);
    throw error;
  }
}
