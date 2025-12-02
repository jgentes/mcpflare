/**
 * Tests for webview-provider.ts
 * Tests webview creation, message handling, and settings management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { addMockFile, getMockFileContent, resetMockFs } from '../setup';
import { getSettingsPath } from '../../src/extension/config-loader';
import type { MCPGuardSettings, MCPSecurityConfig, WebviewMessage } from '../../src/extension/types';
import { DEFAULT_SETTINGS } from '../../src/extension/types';

// Helper to get test config paths
function getTestConfigPath(ide: 'claude' | 'copilot' | 'cursor'): string {
  const homeDir = os.homedir();
  switch (ide) {
    case 'cursor':
      return path.join(homeDir, '.cursor', 'mcp.json');
    case 'claude':
      if (process.platform === 'win32') {
        return path.join(homeDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
      }
      return path.join(homeDir, '.config', 'claude', 'claude_desktop_config.json');
    case 'copilot':
      return path.join(homeDir, '.github-copilot', 'apps.json');
  }
}

function createSampleMCPConfig(mcpServers: Record<string, unknown>, extras?: Record<string, unknown>): string {
  return JSON.stringify({ mcpServers, ...extras }, null, 2);
}

// Mock the VS Code webview
const createMockWebview = () => ({
  options: {} as { enableScripts?: boolean },
  html: '',
  onDidReceiveMessage: vi.fn((callback) => {
    return { dispose: vi.fn() };
  }),
  postMessage: vi.fn().mockResolvedValue(true),
  asWebviewUri: vi.fn((uri) => uri),
  cspSource: 'mock-csp-source',
});

const createMockWebviewView = () => {
  const webview = createMockWebview();
  return {
    webview,
    badge: undefined as { value: number | string; tooltip: string } | undefined,
    onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    visible: true,
    viewType: 'mcpguard.configPanel',
    show: vi.fn(),
  };
};

// Import after mocks are set up
import { MCPGuardWebviewProvider } from '../../src/extension/webview-provider';

describe('MCPGuardWebviewProvider', () => {
  let provider: MCPGuardWebviewProvider;
  let mockExtensionUri: { fsPath: string; toString: () => string };

  beforeEach(() => {
    resetMockFs();
    vi.clearAllMocks();
    
    mockExtensionUri = {
      fsPath: '/mock/extension/path',
      toString: () => '/mock/extension/path',
    };
    
    provider = new MCPGuardWebviewProvider(mockExtensionUri as unknown as import('vscode').Uri);
  });

  describe('static properties', () => {
    it('should have correct viewType', () => {
      expect(MCPGuardWebviewProvider.viewType).toBe('mcpguard.configPanel');
    });
  });

  describe('resolveWebviewView', () => {
    it('should set webview options', () => {
      const mockView = createMockWebviewView();
      
      provider.resolveWebviewView(
        mockView as unknown as import('vscode').WebviewView,
        {} as import('vscode').WebviewViewResolveContext,
        {} as import('vscode').CancellationToken
      );

      expect(mockView.webview.options.enableScripts).toBe(true);
    });

    it('should set HTML content with required elements', () => {
      const mockView = createMockWebviewView();
      
      provider.resolveWebviewView(
        mockView as unknown as import('vscode').WebviewView,
        {} as import('vscode').WebviewViewResolveContext,
        {} as import('vscode').CancellationToken
      );

      expect(mockView.webview.html).toContain('<!DOCTYPE html>');
      expect(mockView.webview.html).toContain('<div id="root">');
      expect(mockView.webview.html).toContain('MCP Guard');
      expect(mockView.webview.html).toContain('Content-Security-Policy');
    });

    it('should register message handler', () => {
      const mockView = createMockWebviewView();
      
      provider.resolveWebviewView(
        mockView as unknown as import('vscode').WebviewView,
        {} as import('vscode').WebviewViewResolveContext,
        {} as import('vscode').CancellationToken
      );

      expect(mockView.webview.onDidReceiveMessage).toHaveBeenCalled();
    });
  });

  describe('message handling', () => {
    let mockView: ReturnType<typeof createMockWebviewView>;
    let messageHandler: (msg: WebviewMessage) => Promise<void>;

    beforeEach(() => {
      mockView = createMockWebviewView();
      
      // Capture the message handler
      mockView.webview.onDidReceiveMessage = vi.fn((callback) => {
        messageHandler = callback;
        return { dispose: vi.fn() };
      });
      
      provider.resolveWebviewView(
        mockView as unknown as import('vscode').WebviewView,
        {} as import('vscode').WebviewViewResolveContext,
        {} as import('vscode').CancellationToken
      );
    });

    describe('getSettings message', () => {
      it('should send default settings when no settings file exists', async () => {
        await messageHandler({ type: 'getSettings' });

        expect(mockView.webview.postMessage).toHaveBeenCalledWith({
          type: 'settings',
          data: DEFAULT_SETTINGS,
        });
      });

      it('should send stored settings when file exists', async () => {
        const settingsPath = getSettingsPath();
        const customSettings: MCPGuardSettings = {
          enabled: false,
          defaults: DEFAULT_SETTINGS.defaults,
          mcpConfigs: [],
        };
        addMockFile(settingsPath, JSON.stringify(customSettings));

        await messageHandler({ type: 'getSettings' });

        expect(mockView.webview.postMessage).toHaveBeenCalledWith({
          type: 'settings',
          data: customSettings,
        });
      });

      it('should send default settings on invalid JSON (graceful fallback)', async () => {
        // Note: Invalid JSON now falls back to defaults instead of throwing error
        // This is because loadSettingsWithHydration catches parse errors
        const settingsPath = getSettingsPath();
        addMockFile(settingsPath, '{ invalid json }');

        await messageHandler({ type: 'getSettings' });

        // Should send default settings instead of error
        expect(mockView.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'settings',
            data: expect.objectContaining({
              enabled: true,
              mcpConfigs: [],
            }),
          })
        );
      });
    });

    describe('getMCPServers message', () => {
      it('should send loading state and empty array when no configs exist', async () => {
        await messageHandler({ type: 'getMCPServers' });

        expect(mockView.webview.postMessage).toHaveBeenCalledWith({
          type: 'loading',
          isLoading: true,
        });
        expect(mockView.webview.postMessage).toHaveBeenCalledWith({
          type: 'mcpServers',
          data: [],
        });
      });

      it('should send MCP servers from config', async () => {
        const cursorPath = getTestConfigPath('cursor');
        addMockFile(cursorPath, createSampleMCPConfig({
          'test-mcp': { command: 'node', args: ['test.js'] },
        }));

        await messageHandler({ type: 'getMCPServers' });

        expect(mockView.webview.postMessage).toHaveBeenCalledWith({
          type: 'mcpServers',
          data: expect.arrayContaining([
            expect.objectContaining({ name: 'test-mcp' }),
          ]),
        });
      });

      it('should update badge with MCP count', async () => {
        const cursorPath = getTestConfigPath('cursor');
        addMockFile(cursorPath, createSampleMCPConfig({
          'mcp-1': { command: 'node' },
          'mcp-2': { command: 'node' },
        }));

        await messageHandler({ type: 'getMCPServers' });

        expect(mockView.badge?.value).toBe(2);
        expect(mockView.badge?.tooltip).toContain('2 MCP');
      });

      it('should show warning badge when no MCPs found', async () => {
        await messageHandler({ type: 'getMCPServers' });

        expect(mockView.badge?.value).toBe('!');
        expect(mockView.badge?.tooltip).toContain('No MCP servers detected');
      });
    });

    describe('saveSettings message', () => {
      it('should save settings to file', async () => {
        const newSettings: MCPGuardSettings = {
          enabled: true,
          defaults: DEFAULT_SETTINGS.defaults,
          mcpConfigs: [],
        };

        await messageHandler({ type: 'saveSettings', data: newSettings });

        const settingsPath = getSettingsPath();
        const savedContent = getMockFileContent(settingsPath);
        expect(savedContent).toBeDefined();
        
        const saved = JSON.parse(savedContent!);
        expect(saved.enabled).toBe(true);
      });

      it('should handle global enabled state change', async () => {
        // Set up initial settings with a guarded MCP
        const settingsPath = getSettingsPath();
        const initialSettings: MCPGuardSettings = {
          enabled: true,
          defaults: DEFAULT_SETTINGS.defaults,
          mcpConfigs: [{
            id: 'test-id',
            mcpName: 'test-mcp',
            isGuarded: true,
            ...DEFAULT_SETTINGS.defaults,
            lastModified: new Date().toISOString(),
          }],
        };
        addMockFile(settingsPath, JSON.stringify(initialSettings));

        // Set up cursor config
        const cursorPath = getTestConfigPath('cursor');
        addMockFile(cursorPath, createSampleMCPConfig({
          'test-mcp': { command: 'node' },
        }));

        // Disable MCP Guard globally
        const newSettings = { ...initialSettings, enabled: false };
        await messageHandler({ type: 'saveSettings', data: newSettings });

        // Should send success message
        expect(mockView.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'success',
          })
        );
      });
    });

    describe('saveMCPConfig message', () => {
      it('should save new MCP config', async () => {
        const config: MCPSecurityConfig = {
          id: 'new-config',
          mcpName: 'new-mcp',
          isGuarded: true,
          ...DEFAULT_SETTINGS.defaults,
          lastModified: new Date().toISOString(),
        };

        await messageHandler({ type: 'saveMCPConfig', data: config });

        // Should send success message
        expect(mockView.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'success',
          })
        );
      });

      it('should update existing MCP config (isGuarded NOT saved)', async () => {
        // Note: isGuarded is NOT stored in settings.json - it's derived from IDE config
        const settingsPath = getSettingsPath();
        const existingSettings = {
          enabled: true,
          defaults: DEFAULT_SETTINGS.defaults,
          mcpConfigs: [{
            id: 'existing-id',
            mcpName: 'existing-mcp',
            // isGuarded is NOT stored in the file
            ...DEFAULT_SETTINGS.defaults,
            lastModified: '2024-01-01T00:00:00Z',
          }],
        };
        addMockFile(settingsPath, JSON.stringify(existingSettings));

        const updatedConfig: MCPSecurityConfig = {
          id: 'existing-id',
          mcpName: 'existing-mcp',
          isGuarded: true, // This will trigger IDE config update, but NOT be saved
          ...DEFAULT_SETTINGS.defaults,
          lastModified: new Date().toISOString(),
        };

        await messageHandler({ type: 'saveMCPConfig', data: updatedConfig });

        // Should update the existing config - but isGuarded is NOT saved
        const savedContent = getMockFileContent(settingsPath);
        const saved = JSON.parse(savedContent!);
        // isGuarded should NOT be in saved file (it's derived from IDE config)
        expect(saved.mcpConfigs[0].isGuarded).toBeUndefined();
        // Security settings should still be saved
        expect(saved.mcpConfigs[0].network).toBeDefined();
      });

      it('should handle guard status change', async () => {
        const settingsPath = getSettingsPath();
        addMockFile(settingsPath, JSON.stringify(DEFAULT_SETTINGS));

        const cursorPath = getTestConfigPath('cursor');
        addMockFile(cursorPath, createSampleMCPConfig({
          'test-mcp': { command: 'node' },
        }));

        const config: MCPSecurityConfig = {
          id: 'new-id',
          mcpName: 'test-mcp',
          isGuarded: true,
          ...DEFAULT_SETTINGS.defaults,
          lastModified: new Date().toISOString(),
        };

        await messageHandler({ type: 'saveMCPConfig', data: config });

        // Should send appropriate success message about guard status
        expect(mockView.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'success',
            message: expect.stringContaining('guarded'),
          })
        );
      });
    });

    describe('importFromIDE message', () => {
      it('should refresh MCPs and send success', async () => {
        await messageHandler({ type: 'importFromIDE' });

        expect(mockView.webview.postMessage).toHaveBeenCalledWith({
          type: 'success',
          message: 'MCPs imported from IDE configurations',
        });
      });
    });

    describe('refreshMCPs message', () => {
      it('should refresh MCP servers list', async () => {
        await messageHandler({ type: 'refreshMCPs' });

        expect(mockView.webview.postMessage).toHaveBeenCalledWith({
          type: 'mcpServers',
          data: expect.any(Array),
        });
      });
    });

    describe('addMCP message', () => {
      it('should add command-based MCP to config', async () => {
        const cursorPath = getTestConfigPath('cursor');
        addMockFile(cursorPath, createSampleMCPConfig({}));

        await messageHandler({
          type: 'addMCP',
          name: 'new-test-mcp',
          config: {
            command: 'node',
            args: ['server.js'],
          },
        });

        // Should send success message
        expect(mockView.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'success',
            message: expect.stringContaining('Added new-test-mcp'),
          })
        );
      });

      it('should add URL-based MCP with headers', async () => {
        const cursorPath = getTestConfigPath('cursor');
        addMockFile(cursorPath, createSampleMCPConfig({}));

        await messageHandler({
          type: 'addMCP',
          name: 'github-mcp',
          config: {
            url: 'https://api.github.com/mcp/',
            headers: { Authorization: 'Bearer test-token' },
          },
        });

        // Should send success message
        expect(mockView.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'success',
          })
        );
      });

      it('should fail when MCP name is empty', async () => {
        const cursorPath = getTestConfigPath('cursor');
        addMockFile(cursorPath, createSampleMCPConfig({}));

        await messageHandler({
          type: 'addMCP',
          name: '',
          config: { command: 'node' },
        });

        // Should send error message
        expect(mockView.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            message: expect.stringContaining('name is required'),
          })
        );
      });

      it('should fail when neither command nor URL provided', async () => {
        const cursorPath = getTestConfigPath('cursor');
        addMockFile(cursorPath, createSampleMCPConfig({}));

        await messageHandler({
          type: 'addMCP',
          name: 'invalid-mcp',
          config: {},
        });

        // Should send error message
        expect(mockView.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            message: expect.stringContaining('command or URL'),
          })
        );
      });
    });

    describe('invalidateCache message', () => {
      it('should invalidate cache for specific MCP', async () => {
        const settingsPath = getSettingsPath();
        addMockFile(settingsPath, JSON.stringify({
          enabled: true,
          defaults: DEFAULT_SETTINGS.defaults,
          mcpConfigs: [],
          tokenMetricsCache: {
            'test-mcp': { toolCount: 5, schemaChars: 1000, estimatedTokens: 286, assessedAt: '2024-01-01' },
          },
        }));

        await messageHandler({
          type: 'invalidateCache',
          mcpName: 'test-mcp',
        });

        // Should send success message
        expect(mockView.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'success',
          })
        );

        // Verify cache was cleared
        const savedContent = getMockFileContent(settingsPath);
        const saved = JSON.parse(savedContent!);
        expect(saved.tokenMetricsCache['test-mcp']).toBeUndefined();
      });
    });
  });

  describe('refresh method', () => {
    it('should send settings and MCP servers when view exists', () => {
      const mockView = createMockWebviewView();
      
      provider.resolveWebviewView(
        mockView as unknown as import('vscode').WebviewView,
        {} as import('vscode').WebviewViewResolveContext,
        {} as import('vscode').CancellationToken
      );

      // Clear previous calls
      mockView.webview.postMessage.mockClear();

      provider.refresh();

      // Should have sent messages
      expect(mockView.webview.postMessage).toHaveBeenCalled();
    });

    it('should do nothing when view does not exist', () => {
      // Don't resolve the view
      expect(() => provider.refresh()).not.toThrow();
    });
  });
});

describe('getNonce', () => {
  it('should generate unique nonces', () => {
    // We can't directly test the private getNonce function,
    // but we can verify that the HTML contains a nonce
    const provider = new MCPGuardWebviewProvider({
      fsPath: '/mock/path',
      toString: () => '/mock/path',
    } as unknown as import('vscode').Uri);
    
    const mockView = createMockWebviewView();
    
    provider.resolveWebviewView(
      mockView as unknown as import('vscode').WebviewView,
      {} as import('vscode').WebviewViewResolveContext,
      {} as import('vscode').CancellationToken
    );

    // HTML should contain a nonce
    expect(mockView.webview.html).toMatch(/nonce="[A-Za-z0-9]+"/);
  });
});
