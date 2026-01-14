#!/usr/bin/env node
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import { MCPHandler } from './mcp-handler.js';
dotenv.config();
async function main() {
    try {
        logger.info('Starting MCPflare...');
        const handler = new MCPHandler();
        await handler.start();
        logger.info('MCPflare is ready to accept connections');
    }
    catch (error) {
        logger.error({ error }, 'Failed to start MCPflare');
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map