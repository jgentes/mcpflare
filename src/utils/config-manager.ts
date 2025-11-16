import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { parse as parseJSONC } from 'jsonc-parser';
import { MCPConfig } from '../types/mcp.js';
import logger from './logger.js';

/**
 * Standard MCP configuration file format (matches Cursor/Claude Desktop format)
 */
export interface MCPServersConfig {
  mcpServers: Record<string, MCPConfig>;
}

/**
 * IDE configuration definition
 */
interface IDEDefinition {
  id: 'claude-code' | 'cursor' | 'github-copilot';
  displayName: string;
  priority: number; // Lower number = higher priority
  paths: {
    windows: string[];
    macos: string[];
    linux: string[];
    default: string; // Default path to create if none exists
  };
}

/**
 * Configuration manager for MCP server configurations
 * Uses standard MCP configuration format (Cursor/Claude Desktop format)
 * Auto-detects IDE (Claude Code, Cursor, or GitHub Copilot) and uses the appropriate config file
 * Resolves environment variables from .env file
 */
export class ConfigManager {
  private configPath: string | null = null;
  private configSource: 'cursor' | 'claude-code' | 'github-copilot' | null = null;

  // IDE definitions - ordered by priority (lower = higher priority)
  private readonly ideDefinitions: IDEDefinition[] = [
    {
      id: 'claude-code',
      displayName: 'Claude Code',
      priority: 1,
      paths: {
        windows: [
          join(homedir(), '.claude', 'mcp.json'),
          join(homedir(), '.claude', 'mcp.jsonc'),
          join(homedir(), 'AppData', 'Roaming', 'Claude Code', 'User', 'globalStorage', 'mcp.json'),
          join(homedir(), 'AppData', 'Roaming', 'Claude Code', 'User', 'globalStorage', 'mcp.jsonc'),
        ],
        macos: [
          join(homedir(), '.claude', 'mcp.json'),
          join(homedir(), '.claude', 'mcp.jsonc'),
          join(homedir(), 'Library', 'Application Support', 'Claude Code', 'User', 'globalStorage', 'mcp.json'),
          join(homedir(), 'Library', 'Application Support', 'Claude Code', 'User', 'globalStorage', 'mcp.jsonc'),
        ],
        linux: [
          join(homedir(), '.claude', 'mcp.json'),
          join(homedir(), '.claude', 'mcp.jsonc'),
          join(homedir(), '.config', 'Claude Code', 'User', 'globalStorage', 'mcp.json'),
          join(homedir(), '.config', 'Claude Code', 'User', 'globalStorage', 'mcp.jsonc'),
        ],
        default: join(homedir(), '.claude', 'mcp.jsonc'),
      },
    },
    {
      id: 'github-copilot',
      displayName: 'GitHub Copilot',
      priority: 2,
      paths: {
        windows: [
          join(homedir(), '.github', 'copilot', 'mcp.json'),
          join(homedir(), '.github', 'copilot', 'mcp.jsonc'),
          join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'github.copilot', 'mcp.json'),
          join(homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'github.copilot', 'mcp.jsonc'),
          join(homedir(), 'AppData', 'Roaming', 'GitHub Copilot', 'mcp.json'),
          join(homedir(), 'AppData', 'Roaming', 'GitHub Copilot', 'mcp.jsonc'),
        ],
        macos: [
          join(homedir(), '.github', 'copilot', 'mcp.json'),
          join(homedir(), '.github', 'copilot', 'mcp.jsonc'),
          join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'github.copilot', 'mcp.json'),
          join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'github.copilot', 'mcp.jsonc'),
          join(homedir(), 'Library', 'Application Support', 'GitHub Copilot', 'mcp.json'),
          join(homedir(), 'Library', 'Application Support', 'GitHub Copilot', 'mcp.jsonc'),
        ],
        linux: [
          join(homedir(), '.github', 'copilot', 'mcp.json'),
          join(homedir(), '.github', 'copilot', 'mcp.jsonc'),
          join(homedir(), '.config', 'Code', 'User', 'globalStorage', 'github.copilot', 'mcp.json'),
          join(homedir(), '.config', 'Code', 'User', 'globalStorage', 'github.copilot', 'mcp.jsonc'),
          join(homedir(), '.config', 'GitHub Copilot', 'mcp.json'),
          join(homedir(), '.config', 'GitHub Copilot', 'mcp.jsonc'),
        ],
        default: join(homedir(), '.github', 'copilot', 'mcp.jsonc'),
      },
    },
    {
      id: 'cursor',
      displayName: 'Cursor',
      priority: 3,
      paths: {
        windows: [
          join(homedir(), '.cursor', 'mcp.json'),
          join(homedir(), '.cursor', 'mcp.jsonc'),
          join(homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'mcp.json'),
          join(homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'mcp.jsonc'),
        ],
        macos: [
          join(homedir(), '.cursor', 'mcp.json'),
          join(homedir(), '.cursor', 'mcp.jsonc'),
          join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'mcp.json'),
          join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'mcp.jsonc'),
        ],
        linux: [
          join(homedir(), '.cursor', 'mcp.json'),
          join(homedir(), '.cursor', 'mcp.jsonc'),
          join(homedir(), '.config', 'Cursor', 'User', 'globalStorage', 'mcp.json'),
          join(homedir(), '.config', 'Cursor', 'User', 'globalStorage', 'mcp.jsonc'),
        ],
        default: join(homedir(), '.cursor', 'mcp.jsonc'),
      },
    },
  ];

  constructor() {
    // Find config file in standard locations (checks IDEs in priority order)
    const result = this.findConfigFile();
    this.configPath = result.path;
    this.configSource = result.source;
  }

  /**
   * Get platform-specific paths for an IDE
   */
  private getPlatformPaths(ide: IDEDefinition): string[] {
    const platform = process.platform;
    if (platform === 'win32') {
      return ide.paths.windows;
    } else if (platform === 'darwin') {
      return ide.paths.macos;
    } else {
      return ide.paths.linux;
    }
  }

  /**
   * Find MCP configuration file in standard locations
   * Checks IDEs in priority order (lower priority number = checked first)
   */
  private findConfigFile(): { path: string | null; source: 'cursor' | 'claude-code' | 'github-copilot' | null } {
    // Sort by priority (lower number = higher priority)
    const sortedIDEs = [...this.ideDefinitions].sort((a, b) => a.priority - b.priority);

    for (const ide of sortedIDEs) {
      const paths = this.getPlatformPaths(ide);
      for (const path of paths) {
        if (existsSync(path)) {
          logger.info({ path, ide: ide.id }, `Found ${ide.displayName} MCP config file`);
          return { path, source: ide.id };
        }
      }
    }

    logger.warn('MCP config file not found in standard locations for any supported IDE');
    return { path: null, source: null };
  }

  /**
   * Resolve environment variables in a string
   * Supports ${VAR_NAME} syntax, resolves from process.env
   */
  private resolveEnvVars(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const envValue = process.env[varName];
      if (envValue === undefined) {
        logger.warn({ varName }, `Environment variable ${varName} not found, keeping placeholder`);
        return match; // Keep original if not found
      }
      return envValue;
    });
  }

  /**
   * Recursively resolve environment variables in an object
   * Public method for resolving env vars in MCP configs
   */
  resolveEnvVarsInObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.resolveEnvVars(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveEnvVarsInObject(item));
    }
    
    if (obj && typeof obj === 'object') {
      const resolved: any = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveEnvVarsInObject(value);
      }
      return resolved;
    }
    
    return obj;
  }

  /**
   * Read and parse a JSONC config file
   */
  private readConfigFile(filePath: string): MCPServersConfig | null {
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const config = parseJSONC(content) as MCPServersConfig;
      
      if (!config || typeof config !== 'object') {
        logger.warn({ filePath }, 'Invalid config file format');
        return null;
      }

      // Ensure mcpServers exists
      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        config.mcpServers = {};
      }

      return config;
    } catch (error: any) {
      logger.error({ error, filePath }, 'Failed to read config file');
      return null;
    }
  }

  /**
   * Write a JSONC config file
   */
  private writeConfigFile(filePath: string, config: MCPServersConfig): void {
    try {
      // Ensure directory exists
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Format as JSON with comments preserved (JSONC)
      const content = JSON.stringify(config, null, 2);
      writeFileSync(filePath, content, 'utf-8');
      
      // Logging is handled by the caller (saveConfig, deleteConfig, etc.)
    } catch (error: any) {
      logger.error({ error, filePath }, 'Failed to write config file');
      throw error;
    }
  }

  /**
   * Get all saved MCP configurations from the detected config file
   */
  getSavedConfigs(): Record<string, { config: MCPConfig; source: 'cursor' | 'claude-code' | 'github-copilot' }> {
    const configs: Record<string, { config: MCPConfig; source: 'cursor' | 'claude-code' | 'github-copilot' }> = {};

    if (!this.configPath || !this.configSource) {
      return configs;
    }

    const fileConfig = this.readConfigFile(this.configPath);
    if (fileConfig) {
      for (const [name, config] of Object.entries(fileConfig.mcpServers)) {
        configs[name] = { config, source: this.configSource };
      }
    }

    return configs;
  }

  /**
   * Get a saved MCP configuration by name
   */
  getSavedConfig(mcpName: string): MCPConfig | null {
    const saved = this.getSavedConfigs();
    const entry = saved[mcpName];
    if (!entry) {
      return null;
    }

    // Resolve environment variables before returning
    return this.resolveEnvVarsInObject(entry.config) as MCPConfig;
  }

  /**
   * Save an MCP configuration to the detected config file
   * @param mcpName Name of the MCP server
   * @param config MCP configuration
   */
  saveConfig(mcpName: string, config: MCPConfig): void {
    if (!this.configPath) {
      // If no config exists, try to detect which IDE to use
      // Check IDEs in priority order
      const sortedIDEs = [...this.ideDefinitions].sort((a, b) => a.priority - b.priority);
      
      let foundIDE: IDEDefinition | null = null;
      for (const ide of sortedIDEs) {
        // Check if any of the IDE's default directory exists
        const defaultDir = dirname(ide.paths.default);
        if (existsSync(defaultDir)) {
          foundIDE = ide;
          break;
        }
      }
      
      // Use highest priority IDE if found, otherwise default to Claude Code
      const ideToUse = foundIDE || sortedIDEs[0];
      const defaultPath = ideToUse.paths.default;
      const dir = dirname(defaultPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.configPath = defaultPath;
      this.configSource = ideToUse.id;
    }

    const existingConfig = this.readConfigFile(this.configPath) || { mcpServers: {} };

    // Store config with environment variable placeholders (don't resolve when saving)
    existingConfig.mcpServers[mcpName] = config;
    
    this.writeConfigFile(this.configPath, existingConfig);
    
    const ide = this.ideDefinitions.find(d => d.id === this.configSource);
    const sourceName = ide ? ide.displayName : 'IDE';
    logger.info({ mcpName, configPath: this.configPath, source: this.configSource }, `MCP config saved to ${sourceName} config file`);
  }

  /**
   * Delete an MCP configuration from the detected config file
   * @param mcpName Name of the MCP server
   */
  deleteConfig(mcpName: string): boolean {
    if (!this.configPath) {
      return false;
    }

    const existingConfig = this.readConfigFile(this.configPath);
    
    if (!existingConfig || !existingConfig.mcpServers[mcpName]) {
      return false;
    }

    delete existingConfig.mcpServers[mcpName];
    this.writeConfigFile(this.configPath, existingConfig);
    
    const ide = this.ideDefinitions.find(d => d.id === this.configSource);
    const sourceName = ide ? ide.displayName : 'IDE';
    logger.info({ mcpName, configPath: this.configPath, source: this.configSource }, `MCP config deleted from ${sourceName} config file`);
    return true;
  }

  /**
   * Import/refresh MCP configurations from the config file
   * This reloads the config file location in case it was created or moved
   */
  importConfigs(configPath?: string): { imported: number; errors: string[] } {
    const errors: string[] = [];
    let imported = 0;

    // If a specific path is provided, use it
    if (configPath) {
      if (existsSync(configPath)) {
        this.configPath = configPath;
        // Try to detect source from path
        const detectedIDE = this.ideDefinitions.find(ide => 
          configPath.toLowerCase().includes(ide.id.replace('-', '')) ||
          configPath.toLowerCase().includes(ide.displayName.toLowerCase().replace(/\s+/g, ''))
        );
        if (detectedIDE) {
          this.configSource = detectedIDE.id;
        }
        const config = this.readConfigFile(configPath);
        if (config) {
          imported = Object.keys(config.mcpServers).length;
          const ide = this.ideDefinitions.find(d => d.id === this.configSource);
          const sourceName = ide ? ide.displayName : 'IDE';
          logger.info({ path: configPath, imported, source: this.configSource }, `Loaded ${sourceName} configs from specified path`);
        }
      } else {
        errors.push(`Config file not found: ${configPath}`);
      }
    } else {
      // Refresh the config file location
      const result = this.findConfigFile();
      this.configPath = result.path;
      this.configSource = result.source;
      if (this.configPath) {
        const config = this.readConfigFile(this.configPath);
        if (config) {
          imported = Object.keys(config.mcpServers).length;
          const ide = this.ideDefinitions.find(d => d.id === this.configSource);
          const sourceName = ide ? ide.displayName : 'IDE';
          logger.info({ path: this.configPath, imported, source: this.configSource }, `Refreshed ${sourceName} configs`);
        }
      } else {
        const ideNames = this.ideDefinitions.map(d => d.displayName).join(', ');
        errors.push(`MCP config file not found in standard locations for ${ideNames}`);
      }
    }

    return { imported, errors };
  }

  /**
   * Get the path to the config file (Cursor or Claude Code)
   */
  getCursorConfigPath(): string | null {
    return this.configPath;
  }

  /**
   * Get the source of the config file
   */
  getConfigSource(): 'cursor' | 'claude-code' | 'github-copilot' | null {
    return this.configSource;
  }

  /**
   * Get the display name for the current config source
   */
  getConfigSourceDisplayName(): string {
    if (!this.configSource) {
      return 'IDE';
    }
    const ide = this.ideDefinitions.find(d => d.id === this.configSource);
    return ide ? ide.displayName : 'IDE';
  }
}

