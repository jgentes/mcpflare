/**
 * Interactive environment variable selector
 * Helps users select env vars from .env file with typeahead/search
 */

import * as readline from 'readline';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Get all environment variables from .env file
 */
export function getEnvVarsFromFile(): Record<string, string> {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  const content = readFileSync(envPath, 'utf-8');
  const envVars: Record<string, string> = {};
  
  // Simple .env parser (handles basic cases)
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    // Parse KEY=VALUE format
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1];
      let value = match[2];
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      envVars[key] = value;
    }
  }
  
  return envVars;
}


/**
 * Interactive environment variable selector
 * Returns a record of selected env vars with ${VAR_NAME} syntax
 */
export async function selectEnvVarsInteractively(
  rl: readline.Interface
): Promise<Record<string, string>> {
  const envVars = getEnvVarsFromFile();
  const envVarKeys = Object.keys(envVars).sort();
  
  const selected: Record<string, string> = {};
  
  // Show available env vars from .env file
  if (envVarKeys.length > 0) {
    console.log('\n📋 Available environment variables from .env file:');
    envVarKeys.forEach((key, index) => {
      const value = envVars[key];
      const masked = value.length > 8 ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}` : '***';
      const alreadySelected = selected[key] ? ' ✓' : '';
      console.log(`  ${index + 1}. ${key} = ${masked}${alreadySelected}`);
    });
  } else {
    console.log('\n⚠️  No environment variables found in .env file.');
    console.log('   You can still enter env vars manually or use ${VAR_NAME} syntax.');
  }
  
  console.log('\n💡 Options:');
  console.log('  - Enter a number (1-' + envVarKeys.length + ') to select an env var');
  console.log('  - Enter "done" when finished');
  console.log('  - Enter "skip" to skip env vars');
  console.log('  - Enter "manual" to enter env vars as JSON\n');
  
  while (true) {
    const remaining = envVarKeys.filter(k => !selected[k]);
    if (remaining.length === 0) {
      console.log('\n✅ All environment variables have been selected.');
      break;
    }
    
    // Show remaining options
    if (remaining.length < envVarKeys.length) {
      console.log('\n📋 Remaining environment variables:');
      remaining.forEach((key) => {
        const originalIndex = envVarKeys.indexOf(key) + 1;
        const value = envVars[key];
        const masked = value.length > 8 ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}` : '***';
        console.log(`  ${originalIndex}. ${key} = ${masked}`);
      });
    }
    
    const input = await new Promise<string>((resolve) => {
      rl.question('Select env var by number (or "done"/"skip"/"manual"): ', resolve);
    });
    
    const trimmed = input.trim();
    const trimmedLower = trimmed.toLowerCase();
    
    if (trimmedLower === 'done') {
      break;
    }
    
    if (trimmedLower === 'skip') {
      return {};
    }
    
    if (trimmedLower === 'manual') {
      // Fall back to manual JSON input
      const manualInput = await new Promise<string>((resolve) => {
        rl.question('Environment variables as JSON (or press Enter for none): ', resolve);
      });
      
      if (manualInput.trim()) {
        try {
          const parsed = JSON.parse(manualInput.trim());
          // Convert values to ${VAR_NAME} syntax if they're not already
          const result: Record<string, string> = {};
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string' && !value.startsWith('${')) {
              // Check if this key exists in .env file
              if (envVars[key]) {
                result[key] = `\${${key}}`;
              } else {
                // Use the value as-is (user provided it directly)
                result[key] = value;
              }
            } else {
              result[key] = value as string;
            }
          }
          return result;
        } catch (error) {
          console.error('❌ Invalid JSON. Please try again.');
          continue;
        }
      }
      return {};
    }
    
    // Try to match by number
    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < 1 || num > envVarKeys.length) {
      console.log(`❌ Invalid number. Please enter a number between 1 and ${envVarKeys.length}, or "done"/"skip"/"manual".\n`);
      continue;
    }
    
    const key = envVarKeys[num - 1];
    if (selected[key]) {
      console.log(`⚠️  ${key} is already selected.`);
      continue;
    }
    
    selected[key] = `\${${key}}`;
    console.log(`✅ Added: ${key} = \${${key}}`);
  }
  
  return selected;
}

