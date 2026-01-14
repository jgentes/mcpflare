/**
 * MCPflare - VS Code Extension
 * 
 * Provides a graphical interface for configuring MCP servers
 * with security isolation settings. Bundles and auto-spawns the
 * mcpflare MCP server for transparent proxying.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { MCPflareWebviewProvider } from './webview-provider';
import { loadAllMCPServers } from './config-loader';

let webviewProvider: MCPflareWebviewProvider | undefined;
let mcpServerProcess: ChildProcess | undefined;

/**
 * Get the path to the mcpflare server
 */
function getMCPflareServerPath(context: vscode.ExtensionContext): string {
  // In development, the server is in the parent directory's dist folder
  // In production, it will be bundled with the extension
  const devPath = path.join(context.extensionPath, '..', 'dist', 'server', 'index.js');
  const prodPath = path.join(context.extensionPath, 'mcpflare-server', 'index.js');
  
  // Check if we're in development (parent has dist folder)
  const fs = require('fs');
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  return prodPath;
}

/**
 * Spawn the mcpflare MCP server as a child process
 */
function spawnMCPflareServer(context: vscode.ExtensionContext): ChildProcess | undefined {
  const serverPath = getMCPflareServerPath(context);
  const fs = require('fs');
  
  if (!fs.existsSync(serverPath)) {
    console.log(`MCPflare: Server not found at ${serverPath}, skipping spawn`);
    return undefined;
  }

  console.log(`MCPflare: Spawning server from ${serverPath}`);
  
  const nodeExecutable = process.execPath; // Use the same Node.js that VS Code uses
  
  const proc = spawn(nodeExecutable, [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Ensure the server knows it's running from the extension
      MCPFLARE_FROM_EXTENSION: 'true',
    },
    // Don't detach - we want the process to die when VS Code closes
    detached: false,
  });

  proc.stdout?.on('data', (data) => {
    console.log(`MCPflare Server: ${data.toString().trim()}`);
  });

  proc.stderr?.on('data', (data) => {
    console.error(`MCPflare Server Error: ${data.toString().trim()}`);
  });

  proc.on('error', (error) => {
    console.error('MCPflare: Failed to spawn server:', error.message);
  });

  proc.on('exit', (code, signal) => {
    console.log(`MCPflare: Server exited with code ${code}, signal ${signal}`);
    mcpServerProcess = undefined;
  });

  return proc;
}

/**
 * Stop the mcpflare server if running
 */
function stopMCPflareServer(): void {
  if (mcpServerProcess) {
    console.log('MCPflare: Stopping server...');
    mcpServerProcess.kill('SIGTERM');
    mcpServerProcess = undefined;
  }
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('MCPflare extension activated - build v2');
  console.log('MCPflare: Extension path:', context.extensionPath);

  // Spawn the mcpflare MCP server
  mcpServerProcess = spawnMCPflareServer(context);
  if (mcpServerProcess) {
    console.log('MCPflare: Server spawned successfully');
  }

  // Create the webview provider
  webviewProvider = new MCPflareWebviewProvider(context.extensionUri);

  // Register the webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MCPflareWebviewProvider.viewType,
      webviewProvider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('mcpflare.openSettings', () => {
      vscode.commands.executeCommand('workbench.view.extension.mcpflare');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mcpflare.refreshMCPs', () => {
      webviewProvider?.refresh();
      vscode.window.showInformationMessage('MCPflare: Refreshed MCP list');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mcpflare.importFromIDE', () => {
      webviewProvider?.refresh();
      vscode.window.showInformationMessage('MCPflare: Imported MCPs from IDE configurations');
    })
  );

  // Register cleanup on deactivation
  context.subscriptions.push({
    dispose: () => stopMCPflareServer()
  });

  // Auto-import on activation - log what's found
  const mcps = loadAllMCPServers();
  console.log(`MCPflare: Found ${mcps.length} MCP server(s) on activation`);
  if (mcps.length > 0) {
    console.log('MCPflare: Detected servers:', mcps.map(m => `${m.name} (${m.source})`).join(', '));
  } else {
    console.log('MCPflare: No MCP servers detected. Checked Claude, Copilot, and Cursor configs.');
  }

  // Show welcome message on first activation (with more helpful info)
  const hasShownWelcome = context.globalState.get('mcpflare.hasShownWelcome');
  if (!hasShownWelcome) {
    const message = mcps.length > 0
      ? `MCPflare found ${mcps.length} MCP server${mcps.length === 1 ? '' : 's'}. Click the shield icon to configure security settings.`
      : 'MCPflare is active. No MCP servers detected yet - check your IDE configuration.';
    
    vscode.window.showInformationMessage(message, 'Open Settings').then(selection => {
      if (selection === 'Open Settings') {
        vscode.commands.executeCommand('workbench.view.extension.mcpflare');
      }
    });
    context.globalState.update('mcpflare.hasShownWelcome', true);
  }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  console.log('MCPflare extension deactivated');
  stopMCPflareServer();
}


