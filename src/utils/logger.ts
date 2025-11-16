import pino from 'pino';

// Determine log level - CLI mode is quieter by default
// Check for CLI mode: script name includes 'cli', or CLI_MODE env var is set, or script is test-mcp-directly
const isCLIMode = process.argv[1]?.includes('cli') || 
                  process.env.CLI_MODE === 'true' ||
                  process.argv[1]?.includes('test-mcp-directly');
const defaultLevel = isCLIMode ? 'warn' : 'info'; // Only warnings/errors in CLI by default

const logger = pino({
  level: process.env.LOG_LEVEL || defaultLevel,
  // In CLI mode, write to stderr and use minimal formatting
  ...(isCLIMode && { 
    destination: process.stderr,
    // Disable pino-pretty in CLI mode for cleaner output
    transport: undefined,
  }),
  // Use pino-pretty only in non-CLI mode
  ...(!isCLIMode && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }),
});

// In CLI mode, disable pino-pretty and use stderr for cleaner output
// The logger will still work, but we'll suppress most logs by default

export default logger;

