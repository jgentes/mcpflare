#!/usr/bin/env node
/**
 * Interactive test script to test MCPs directly (bypassing Wrangler/Worker execution)
 * This helps verify if issues are with the MCP itself or with how Wrangler is being used
 * 
 * Usage:
 *   npx tsx scripts/test-mcp-directly.ts [mcp-name]
 * 
 * If no MCP name is provided, you'll be prompted to select one.
 * Then you can interactively select tools and enter arguments.
 * The MCP will be tested directly using the MCP SDK Client (not through Wrangler).
 * 
 * This is useful for:
 * - Verifying MCP configuration is correct
 * - Testing MCP tools before using them in code mode
 * - Debugging authentication issues
 * - Understanding tool schemas
 * - Isolating whether problems are with the MCP or Wrangler
 */

// Set CLI mode BEFORE any imports that use the logger
// This ensures the logger initializes in CLI mode (which disables pino-pretty)
// Note: In ES modules, imports are hoisted, but the logger checks process.env at initialization
// Setting this before imports ensures it's available when the logger initializes
process.env.CLI_MODE = 'true';

// Set log level to 'warn' to suppress INFO logs (unless verbose is requested)
if (!process.argv.includes('--verbose') && !process.argv.includes('-v')) {
  process.env.LOG_LEVEL = 'warn';
}

import dotenv from 'dotenv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ProgressIndicator } from '../src/utils/progress-indicator.js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';

// Load environment variables from .env file
dotenv.config();

// Re-apply CLI mode and log level after dotenv loads (in case .env overrides them)
// This ensures we stay in quiet mode unless verbose is explicitly requested
if (!process.argv.includes('--verbose') && !process.argv.includes('-v')) {
  process.env.CLI_MODE = 'true';
  process.env.LOG_LEVEL = 'warn';
}

interface MCPConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// Load MCP config from examples
function loadMCPConfig(mcpName: string): MCPConfig {
  const configPath = join(process.cwd(), 'examples', mcpName, 'config.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    // Get mcp_config if it exists, otherwise use config directly
    const mcpConfig = config.mcp_config || config;
    
    // Resolve environment variable placeholders
    const resolvedConfig = resolveEnvVars(mcpConfig);
    
    return {
      command: resolvedConfig.command || 'npx',
      args: resolvedConfig.args || ['-y', `@modelcontextprotocol/server-${mcpName}`],
      env: resolvedConfig.env || {},
    };
  } catch (error) {
    // Default config for common MCPs
    if (mcpName === 'github') {
      // GitHub MCP server uses GITHUB_PERSONAL_ACCESS_TOKEN (official env var)
      // See: https://github.com/github/github-mcp-server
      const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '';
      
      return {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: token,
        },
      };
    }
    throw new Error(`Failed to load config for MCP: ${mcpName}. Error: ${error}`);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

function getAvailableMCPs(): string[] {
  const examplesDir = join(process.cwd(), 'examples');
  if (!existsSync(examplesDir)) {
    return [];
  }
  return readdirSync(examplesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

async function selectMCP(): Promise<string> {
  const available = getAvailableMCPs();
  
  if (available.length === 0) {
    const mcpName = await question('\nEnter MCP name (e.g., github): ');
    return mcpName.trim();
  }
  
  console.log('\n📋 Available MCPs:');
  available.forEach((name, index) => {
    console.log(`  ${index + 1}. ${name}`);
  });
  
  const selection = await question('\nSelect MCP by number or enter name: ');
  const num = parseInt(selection.trim(), 10);
  
  if (!isNaN(num) && num >= 1 && num <= available.length) {
    return available[num - 1];
  }
  
  return selection.trim() || available[0];
}

async function selectTool(tools: any[]): Promise<any> {
  console.log('\n📋 Available Tools:');
  tools.forEach((tool, index) => {
    console.log(`  ${index + 1}. ${tool.name}`);
    if (tool.description) {
      console.log(`     ${tool.description}`);
    }
  });
  
  while (true) {
    const selection = await question('\nSelect tool by number or name (or "exit" to quit): ');
    const trimmed = selection.trim();
    
    if (trimmed.toLowerCase() === 'exit') {
      return null;
    }
    
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= tools.length) {
      return tools[num - 1];
    }
    
    const tool = tools.find(t => t.name.toLowerCase() === trimmed.toLowerCase());
    if (tool) {
      return tool;
    }
    
    console.log('❌ Invalid selection. Please try again.');
  }
}

function getRequiredProperties(schema: any): string[] {
  if (!schema || !schema.properties) {
    return [];
  }
  return schema.required || [];
}

function parseValue(value: string, type: string): any {
  if (type === 'number') {
    return parseFloat(value);
  } else if (type === 'boolean') {
    return value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
  } else if (type === 'array') {
    if (value.trim().startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        return value.split(',').map((v: string) => v.trim());
      }
    } else {
      return value.split(',').map((v: string) => v.trim());
    }
  } else if (type === 'object') {
    if (value.trim().startsWith('{')) {
      try {
        return JSON.parse(value);
      } catch {
        throw new Error('Invalid JSON object');
      }
    } else {
      throw new Error('Object type must be JSON');
    }
  } else {
    return value;
  }
}

async function collectToolArguments(tool: any): Promise<any> {
  const args: any = {};
  const schema = tool.inputSchema;
  
  if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
    console.log('\n💡 This tool doesn\'t require any arguments.');
    const useJson = await question('Enter arguments as JSON (or press Enter to skip): ');
    if (useJson.trim()) {
      try {
        return JSON.parse(useJson.trim());
      } catch (e) {
        console.error('❌ Invalid JSON. Using empty arguments.');
        return {};
      }
    }
    return {};
  }
  
  console.log('\n📝 Enter tool arguments:');
  console.log('   ──────────────────────────────────────────────────────────────');
  console.log('   💡 Press Enter to use defaults or skip optional fields');
  console.log('   💡 Type "json" to enter full JSON object at once');
  console.log('   ──────────────────────────────────────────────────────────────');
  console.log('');
  
  const properties = schema.properties;
  const required = getRequiredProperties(schema);
  
  // Process required fields first, then optional ones
  const allKeys = Object.keys(properties);
  const requiredKeys = allKeys.filter(key => required.includes(key));
  const optionalKeys = allKeys.filter(key => !required.includes(key));
  const orderedKeys = [...requiredKeys, ...optionalKeys];
  
  for (const key of orderedKeys) {
    const prop = properties[key];
    const propSchema = prop as any;
    const isRequired = required.includes(key);
    const type = propSchema.type || 'string';
    const hasDefault = propSchema.default !== undefined;
    const defaultValue = propSchema.default;
    
    while (true) {
      // Build prompt with default value if available
      let promptText = `  ${key}${isRequired ? ' (required)' : ''}${propSchema.description ? ` - ${propSchema.description}` : ''}${type ? ` [${type}]` : ''}`;
      if (hasDefault) {
        const defaultDisplay = typeof defaultValue === 'string' 
          ? `"${defaultValue}"` 
          : JSON.stringify(defaultValue);
        promptText += ` (default: ${defaultDisplay})`;
      }
      promptText += ': ';
      
      const value = await question(promptText);
      
      if (!value.trim()) {
        // User pressed Enter
        if (hasDefault) {
          // Use the default value
          args[key] = defaultValue;
          break;
        } else if (isRequired) {
          console.log('   ⚠️  This field is required and has no default.');
          continue;
        } else {
          // Skip optional field without default
          break;
        }
      }
      
      if (value.trim().toLowerCase() === 'json') {
        const jsonInput = await question('  Enter full JSON object: ');
        try {
          return JSON.parse(jsonInput.trim());
        } catch (e) {
          console.error('   ❌ Invalid JSON. Please try again.');
          continue;
        }
      }
      
      try {
        args[key] = parseValue(value.trim(), type);
        break;
      } catch (e: any) {
        console.error(`   ❌ ${e.message}. Please try again.`);
        continue;
      }
    }
  }
  
  return args;
}


/**
 * Create a readable summary of search results
 */
function summarizeSearchResults(data: any): string {
  if (data.total_count !== undefined) {
    const lines: string[] = [];
    lines.push(`📊 Search Results Summary:`);
    lines.push(`   Total count: ${data.total_count.toLocaleString()}`);
    lines.push(`   Incomplete results: ${data.incomplete_results}`);
    lines.push('');
    
    if (data.items && Array.isArray(data.items)) {
      const maxItems = 3;
      const itemsToShow = data.items.slice(0, maxItems);
      lines.push(`   Showing ${itemsToShow.length} of ${data.items.length} items:`);
      lines.push('');
      
      itemsToShow.forEach((item: any, index: number) => {
        lines.push(`   ${index + 1}. ${item.name || 'N/A'}`);
        if (item.path) lines.push(`      Path: ${item.path}`);
        if (item.repository?.full_name) lines.push(`      Repository: ${item.repository.full_name}`);
        if (item.repository?.html_url) lines.push(`      URL: ${item.repository.html_url}`);
        if (item.html_url) lines.push(`      File URL: ${item.html_url}`);
        if (item.score !== undefined) lines.push(`      Score: ${item.score}`);
        lines.push('');
      });
      
      if (data.items.length > maxItems) {
        lines.push(`   ... and ${data.items.length - maxItems} more items`);
      }
    }
    
    return lines.join('\n');
  }
  return JSON.stringify(data, null, 2);
}

/**
 * Format tool result with limits and pretty printing
 */
function formatToolResult(result: any): string {
  // For large results, try to intelligently limit
  try {
    // Check if result has a content array (common MCP pattern)
    if (result.content && Array.isArray(result.content)) {
      const maxContentItems = 2; // Limit content items
      const contentToShow = result.content.slice(0, maxContentItems);
      
      const lines: string[] = [];
      lines.push('📋 Result Summary:');
      
      if (result.content.length > maxContentItems) {
        lines.push(`   Showing ${maxContentItems} of ${result.content.length} content items\n`);
      } else {
        lines.push(`   ${result.content.length} content item(s)\n`);
      }
      
      contentToShow.forEach((item: any, index: number) => {
        lines.push(`   Content Item ${index + 1}:`);
        
        if (item.type) {
          lines.push(`      Type: ${item.type}`);
        }
        
        if (item.text && typeof item.text === 'string') {
          try {
            // Try to parse the text as JSON
            const parsed = JSON.parse(item.text);
            
            // Check if it's a search result
            if (parsed.total_count !== undefined || (parsed.items && Array.isArray(parsed.items))) {
              lines.push(`      ${summarizeSearchResults(parsed)}`);
            } else {
              // For other JSON, show a summary
              const jsonStr = JSON.stringify(parsed, null, 2);
              if (jsonStr.length > 500) {
                lines.push(`      [Large JSON object - ${jsonStr.length} characters]`);
                lines.push(`      Keys: ${Object.keys(parsed).join(', ')}`);
                if (parsed.items && Array.isArray(parsed.items)) {
                  lines.push(`      Items: ${parsed.items.length} items`);
                }
              } else {
                lines.push(`      ${jsonStr}`);
              }
            }
          } catch (e) {
            // Not JSON, show as text (truncated if long)
            if (item.text.length > 500) {
              lines.push(`      ${item.text.substring(0, 500)}...`);
              lines.push(`      [Truncated - ${item.text.length} total characters]`);
            } else {
              lines.push(`      ${item.text}`);
            }
          }
        } else if (item.text) {
          lines.push(`      ${item.text}`);
        }
        
        lines.push('');
      });
      
      if (result.content.length > maxContentItems) {
        lines.push(`   ... and ${result.content.length - maxContentItems} more content items`);
      }
      
      return lines.join('\n');
    }
    
    // Check if result is an array
    if (Array.isArray(result)) {
      const maxItems = 3;
      if (result.length > maxItems) {
        return JSON.stringify(result.slice(0, maxItems), null, 2) + `\n\n... (${result.length - maxItems} more items, showing first ${maxItems})`;
      }
      return JSON.stringify(result, null, 2);
    }
    
    // Check if result has items/items array (common pattern)
    if (result.items && Array.isArray(result.items)) {
      const limited = result.items.length > 3 ? result.items.slice(0, 3) : result.items;
      const limitedResult = { ...result, items: limited };
      if (result.items.length > 3) {
        (limitedResult as any)._truncated = `${result.items.length - 3} more items (showing first 3)`;
      }
      return JSON.stringify(limitedResult, null, 2);
    }
    
    // For other objects, check size
    const jsonStr = JSON.stringify(result, null, 2);
    if (jsonStr.length > 2000) {
      // Try to summarize
      const keys = Object.keys(result);
      if (keys.length > 5) {
        const summary: any = {};
        const importantKeys = keys.slice(0, 5);
        for (const key of importantKeys) {
          const value = result[key];
          if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
              summary[key] = `[Array with ${value.length} items]`;
            } else {
              summary[key] = `[Object with ${Object.keys(value).length} keys]`;
            }
          } else {
            summary[key] = value;
          }
        }
        summary._truncated = `${keys.length - 5} more keys (showing first 5)`;
        return JSON.stringify(summary, null, 2);
      }
      
      // Fallback: truncate
      return jsonStr.substring(0, 2000) + `\n... (truncated, ${jsonStr.length - 2000} more characters)`;
    }
    
    return jsonStr;
  } catch (e) {
    // If formatting fails, just truncate
    const jsonStr = JSON.stringify(result, null, 2);
    const maxLength = 2000;
    if (jsonStr.length > maxLength) {
      return jsonStr.substring(0, maxLength) + `\n... (truncated, ${jsonStr.length - maxLength} more characters)`;
    }
    return jsonStr;
  }
}

async function testMCPDirectly(mcpName?: string) {
  // Select MCP if not provided
  const selectedMCP = mcpName || await selectMCP();
  
  console.log(`\n🔍 Testing MCP directly (bypassing Wrangler): ${selectedMCP}\n`);
  console.log('💡 This tests the MCP using the MCP SDK Client directly\n');
  console.log('   Use this to verify if issues are with the MCP or with Wrangler\n');
  
  // Load MCP configuration
  const config = loadMCPConfig(selectedMCP);
  
  console.log('Configuration:');
  console.log(`  Command: ${config.command}`);
  console.log(`  Args: ${config.args?.join(' ') || 'none'}`);
  const envKeys = Object.keys(config.env || {});
  console.log(`  Env keys: ${envKeys.join(', ') || 'none'}`);
  // Show if token is set (check resolved value from env)
  if (config.env) {
    const tokenKey = 'GITHUB_PERSONAL_ACCESS_TOKEN';
    const tokenValue = config.env[tokenKey];
    // Check if it's a placeholder or actual value
    if (tokenValue && tokenValue.startsWith('${') && tokenValue.endsWith('}')) {
      const envVarName = tokenValue.slice(2, -1);
      const resolvedValue = process.env[envVarName];
      if (resolvedValue && resolvedValue.length > 0) {
        console.log(`  ✅ Token found: ${tokenKey} (${resolvedValue.substring(0, 4)}...)`);
      } else {
        console.log(`  ⚠️  No token found. Set ${envVarName} environment variable.`);
        console.log(`      See: https://github.com/github/github-mcp-server`);
      }
    } else if (tokenValue && tokenValue.length > 0) {
      console.log(`  ✅ Token found: ${tokenKey} (${tokenValue.substring(0, 4)}...)`);
    }
  }
  console.log('');
  
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args || [],
    env: config.env,
  });

  const client = new Client(
    { name: 'mcp-direct-test', version: '1.0.0' },
    { capabilities: {} }
  );

  try {
    // Create a simplified progress indicator for direct MCP testing
    // Flow: Test Script → MCP SDK Client → Target MCP
    const progress = new ProgressIndicator();
    // Override steps for direct test scenario
    (progress as any).steps = [
      { name: 'Test Script', status: 'pending' },
      { name: 'MCP SDK Client', status: 'pending' },
      { name: 'Target MCP', status: 'pending' },
    ];
    
    console.log('📡 Connecting to MCP server...');
    progress.updateStep(0, 'running');
    progress.updateStep(1, 'running');
    
    await client.connect(transport, { timeout: 10000 });
    
    progress.updateStep(0, 'success');
    progress.updateStep(1, 'success');
    progress.updateStep(2, 'running');
    progress.showFinal();
    console.log('✅ Connected successfully!\n');
    
    // List available tools
    console.log('📋 Fetching available tools...');
    const toolsResponse = await client.listTools();
    const tools = toolsResponse.tools;
    progress.updateStep(2, 'success');
    progress.showFinal();
    console.log(`✅ Found ${tools.length} tools\n`);
    
    // Interactive tool selection and execution
    while (true) {
      const selectedTool = await selectTool(tools);
      
      if (!selectedTool) {
        break; // User chose to exit
      }
      
      console.log(`\n🔧 Selected tool: ${selectedTool.name}`);
      if (selectedTool.description) {
        console.log(`   ${selectedTool.description}`);
      }
      
      const args = await collectToolArguments(selectedTool);
      
      console.log(`\n🚀 Executing tool with arguments:`);
      console.log(JSON.stringify(args, null, 2));
      console.log('');
      
      // Show progress indicator for tool execution
      const execProgress = new ProgressIndicator();
      (execProgress as any).steps = [
        { name: 'Test Script', status: 'pending' },
        { name: 'MCP SDK Client', status: 'pending' },
        { name: 'Target MCP', status: 'pending' },
      ];
      execProgress.updateStep(0, 'success');
      execProgress.updateStep(1, 'running');
      execProgress.updateStep(2, 'running');
      
      try {
        const result = await client.callTool({
          name: selectedTool.name,
          arguments: args,
        });
        
        execProgress.updateStep(1, 'success');
        execProgress.updateStep(2, 'success');
        execProgress.showFinal();
        
        console.log('\n✅ Tool execution result:');
        console.log(formatToolResult(result));
        console.log('');
      } catch (error: any) {
        execProgress.updateStep(1, 'failed');
        execProgress.updateStep(2, 'failed');
        execProgress.showFinal(2);
        
        console.error('\n❌ Tool execution failed:');
        console.error(`   ${error.message}`);
        if (error.stack) {
          console.error(`\nStack trace:\n${error.stack}`);
        }
        console.log('');
      }
      
      const continueChoice = await question('Test another tool? (Y/n): ');
      if (continueChoice.trim().toLowerCase() === 'n') {
        break;
      }
    }
    
    await transport.close();
    console.log('\n✅ Test session completed!\n');
    
  } catch (error: any) {
    console.error('\n❌ Error testing MCP:');
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error(`\nStack trace:\n${error.stack}`);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const mcpName = args[0]; // Optional - if not provided, will prompt

testMCPDirectly(mcpName).catch(error => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});

