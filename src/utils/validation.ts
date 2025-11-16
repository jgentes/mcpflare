import { z } from 'zod';
import { ValidationError, SecurityError } from './errors.js';
import logger from './logger.js';

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({ error: error.errors }, 'Validation failed');
      throw new ValidationError(
        'Invalid input parameters',
        error.errors
      );
    }
    throw error;
  }
}

// Code security validation
export function validateTypeScriptCode(code: string): void {
  const dangerousPatterns = [
    /require\s*\(/g,                    // Prevent require() calls
    /import\s+.*\s+from\s+['"](?!\.)/g, // Prevent external imports
    /eval\s*\(/g,                        // Prevent eval
    /Function\s*\(/g,                    // Prevent Function constructor
    /process\./g,                        // Prevent process access
    /__dirname/g,                        // Prevent __dirname
    /__filename/g,                       // Prevent __filename
    /global\./g,                         // Prevent global access
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      throw new SecurityError(
        `Code contains dangerous pattern: ${pattern.source}`
      );
    }
  }

  // Validate code length
  if (code.length > 50000) {
    throw new ValidationError('Code exceeds maximum length of 50KB');
  }
}

