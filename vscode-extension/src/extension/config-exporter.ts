/**
 * Configuration Exporter
 * 
 * Exports MCPflare settings in a format that can be used by the MCPflare runtime
 * when starting Worker isolates with Wrangler.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MCPflareSettings, MCPSecurityConfig } from './types';
import { getSettingsPath } from './config-loader';

/**
 * Worker configuration for an MCP that can be used by Wrangler
 */
export interface WorkerIsolationConfig {
  /** MCP name */
  mcpName: string;
  
  /** Whether MCPflare is enabled for this MCP */
  isGuarded: boolean;
  
  /** Network outbound configuration */
  outbound: {
    /** If null, no outbound access. If array, only these hosts are allowed */
    allowedHosts: string[] | null;
    /** Whether localhost is allowed */
    allowLocalhost: boolean;
  };
  
  /** File system bindings (for future Durable Objects or R2 integration) */
  fileSystem: {
    /** Whether file system access is enabled */
    enabled: boolean;
    /** Read-only paths */
    readPaths: string[];
    /** Read-write paths */
    writePaths: string[];
  };
  
  /** Resource limits */
  limits: {
    /** Maximum CPU time in milliseconds */
    cpuMs: number;
    /** Maximum memory in MB */
    memoryMB: number;
    /** Maximum number of subrequests (MCP calls) */
    subrequests: number;
  };
}

/**
 * Convert MCPSecurityConfig to WorkerIsolationConfig
 */
export function toWorkerIsolationConfig(config: MCPSecurityConfig): WorkerIsolationConfig {
  return {
    mcpName: config.mcpName,
    isGuarded: config.isGuarded,
    outbound: {
      // If network is disabled, set allowedHosts to null (complete isolation)
      // If enabled but empty allowlist, still null (no external access)
      // If enabled with allowlist, use the allowlist
      allowedHosts: config.network.enabled && config.network.allowlist.length > 0 
        ? config.network.allowlist 
        : null,
      allowLocalhost: config.network.enabled && config.network.allowLocalhost,
    },
    fileSystem: {
      enabled: config.fileSystem.enabled,
      readPaths: config.fileSystem.readPaths,
      writePaths: config.fileSystem.writePaths,
    },
    limits: {
      cpuMs: config.resourceLimits.maxExecutionTimeMs,
      memoryMB: config.resourceLimits.maxMemoryMB,
      subrequests: config.resourceLimits.maxMCPCalls,
    },
  };
}

/**
 * Load MCPflare settings and convert to worker isolation configs
 */
export function loadWorkerIsolationConfigs(): Map<string, WorkerIsolationConfig> {
  const configs = new Map<string, WorkerIsolationConfig>();
  
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return configs;
  }
  
  try {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as MCPflareSettings;
    
    // Only process if MCPflare is globally enabled
    if (!settings.enabled) {
      return configs;
    }
    
    for (const config of settings.mcpConfigs) {
      if (config.isGuarded) {
        configs.set(config.mcpName, toWorkerIsolationConfig(config));
      }
    }
  } catch (error) {
    console.error('Failed to load MCPflare settings:', error);
  }
  
  return configs;
}

/**
 * Get isolation config for a specific MCP
 */
export function getIsolationConfigForMCP(mcpName: string): WorkerIsolationConfig | undefined {
  const configs = loadWorkerIsolationConfigs();
  return configs.get(mcpName);
}

/**
 * Generate Wrangler-compatible outbound rules from isolation config
 * This can be used to dynamically configure Worker isolation
 */
export function generateOutboundRules(config: WorkerIsolationConfig): string {
  if (!config.outbound.allowedHosts && !config.outbound.allowLocalhost) {
    // Complete network isolation
    return 'globalOutbound: null';
  }
  
  const rules: string[] = [];
  
  if (config.outbound.allowLocalhost) {
    rules.push('- localhost');
    rules.push('- 127.0.0.1');
  }
  
  if (config.outbound.allowedHosts) {
    for (const host of config.outbound.allowedHosts) {
      rules.push(`- ${host}`);
    }
  }
  
  if (rules.length === 0) {
    return 'globalOutbound: null';
  }
  
  return `outbound_rules:\n${rules.map(r => `  ${r}`).join('\n')}`;
}

/**
 * Export settings to a JSON file for the MCPflare runtime to consume
 */
export function exportSettingsForRuntime(outputPath?: string): void {
  const configs = loadWorkerIsolationConfigs();
  const output: Record<string, WorkerIsolationConfig> = {};
  
  for (const [name, config] of configs) {
    output[name] = config;
  }
  
  const targetPath = outputPath || path.join(path.dirname(getSettingsPath()), 'isolation-configs.json');
  fs.writeFileSync(targetPath, JSON.stringify(output, null, 2));
}








