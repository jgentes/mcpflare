#!/usr/bin/env node

import { MCPHandler } from './mcp-handler.js';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  try {
    logger.info('Starting MCP Isolate Runner...');

    const handler = new MCPHandler();
    await handler.start();

    logger.info('MCP Isolate Runner is ready to accept connections');
  } catch (error: any) {
    logger.error({ error }, 'Failed to start MCP Isolate Runner');
    process.exit(1);
  }
}

main();

