#!/usr/bin/env tsx
/**
 * Cleanup script to remove any leftover test MCP configs
 * 
 * This script finds and removes all MCP configs that start with __TEST__
 * from your IDE configuration file. Use this if tests were interrupted
 * and left test configs behind.
 */

import { ConfigManager } from '../src/utils/config-manager.js'
import { TEST_MCP_PREFIX } from '../tests/helpers/config-cleanup.js'

const configManager = new ConfigManager()
const configPath = configManager.getCursorConfigPath()

if (!configPath) {
  console.log('No MCP configuration file found.')
  process.exit(0)
}

console.log(`Checking config file: ${configPath}`)

const allConfigs = configManager.getSavedConfigs()
const disabledMCPs = configManager.getDisabledMCPs()

const testConfigs: string[] = []

// Find test configs in active configs
for (const [mcpName] of Object.entries(allConfigs)) {
  if (mcpName.startsWith(TEST_MCP_PREFIX)) {
    testConfigs.push(mcpName)
  }
}

// Find test configs in disabled configs
for (const mcpName of disabledMCPs) {
  if (mcpName.startsWith(TEST_MCP_PREFIX)) {
    testConfigs.push(mcpName)
  }
}

if (testConfigs.length === 0) {
  console.log('✅ No test configs found. Your config is clean!')
  process.exit(0)
}

console.log(`\nFound ${testConfigs.length} test config(s):`)
testConfigs.forEach((name) => console.log(`  - ${name}`))

console.log(`\nRemoving test configs...`)

let removed = 0
for (const mcpName of testConfigs) {
  try {
    // If it's disabled, enable it first
    if (configManager.isMCPDisabled(mcpName)) {
      configManager.enableMCP(mcpName)
    }
    // Then delete it
    if (configManager.deleteConfig(mcpName)) {
      console.log(`  ✓ Removed: ${mcpName}`)
      removed++
    }
  } catch (error) {
    console.error(`  ✗ Failed to remove ${mcpName}:`, error)
  }
}

console.log(`\n✅ Cleanup complete! Removed ${removed} test config(s).`)

