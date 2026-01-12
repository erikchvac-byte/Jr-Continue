/**
 * Verification gates for code quality checks
 */

export interface VerificationResult {
  passed: boolean;
  message?: string;
  error?: string;
  issues?: string[];
}

export async function verifyOllamaResponse(
  response: string,
  duration: number
): Promise<VerificationResult> {
  // Basic validation
  if (!response || response.trim().length === 0) {
    return {
      passed: false,
      error: 'Empty response from Ollama',
    };
  }

  // Check for timeout (arbitrary threshold: 30 seconds)
  if (duration > 30000) {
    return {
      passed: false,
      error: 'Response took too long',
    };
  }

  return {
    passed: true,
    message: 'Ollama response validation passed',
  };
}

export async function verifySyntax(
  code: string,
  language: string
): Promise<VerificationResult> {
  // Basic syntax check - could be enhanced with actual parsers
  if (!code || code.trim().length === 0) {
    return {
      passed: false,
      error: 'Empty code provided',
    };
  }

  // Basic checks for common syntax issues
  if (language === 'typescript' || language === 'javascript') {
    // Check for balanced braces
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;

    if (openBraces !== closeBraces) {
      return {
        passed: false,
        error: 'Unbalanced braces detected',
      };
    }
  }

  return {
    passed: true,
    message: 'Syntax verification passed',
  };
}

export async function verifyFileIntegrity(
  filePath: string,
  content: string
): Promise<VerificationResult> {
  // Basic integrity checks
  if (!filePath || !content) {
    return {
      passed: false,
      error: 'Invalid file path or content',
    };
  }

  return {
    passed: true,
    message: 'File integrity verification passed',
  };
}
