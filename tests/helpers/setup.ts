/**
 * Global test setup
 * Sets environment variables to silence logger during tests
 */
export default async function globalSetup() {
  // Set environment variables to silence logger
  // The logger will detect NODE_ENV=test and VITEST=true
  process.env.NODE_ENV = 'test';
  process.env.VITEST = 'true';
  if (!process.env.LOG_LEVEL) {
    process.env.LOG_LEVEL = 'silent';
  }
}

