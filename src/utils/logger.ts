import pino from 'pino'

// Determine log level - CLI mode is quieter by default
// Check for CLI mode: script name includes 'cli', or CLI_MODE env var is set
const isCLIMode =
  process.argv[1]?.includes('cli') ||
  process.env.CLI_MODE === 'true'
// In test environment, silence all logs unless LOG_LEVEL is explicitly set
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || process.argv[1]?.includes('vitest')
const defaultLevel = isTestEnv ? 'silent' : (isCLIMode ? 'warn' : 'info') // Silent in tests, warn in CLI, info otherwise

// When running as an MCP server via stdio, we MUST write logs to stderr
// to avoid interfering with stdout JSON-RPC protocol communication
// pino-pretty transport spawns a child process that writes to stdout by default,
// so we disable it in server mode and write JSON directly to stderr instead
const loggerConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || defaultLevel,
}

// Only use pino-pretty in CLI mode (where stdout isn't used for protocol)
// In server mode, write JSON logs to stderr (standard practice for servers)
if (isCLIMode) {
  // Disable pino-pretty in CLI mode for cleaner output
  // (already writing to stderr above)
} else {
  // In server mode, don't use pino-pretty transport as it writes to stdout
  // JSON logs to stderr is the standard approach for servers
  // Users can pipe stderr through pino-pretty if they want formatted output
}

// Always write to stderr to avoid interfering with stdout (used for MCP protocol)
const logger = pino(loggerConfig, process.stderr)

// In CLI mode, disable pino-pretty and use stderr for cleaner output
// The logger will still work, but we'll suppress most logs by default

export default logger
