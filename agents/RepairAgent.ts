import { StateManager } from '../state/StateManager';
import { Logger } from './Logger';
import { CodeReview, CodeIssue, SecurityConcern } from './Critic';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * RepairAgent (Agent 10)
 * Fixes code issues identified by Critic
 *
 * Responsibilities:
 * - Read code that needs repair
 * - Apply fixes based on Critic recommendations
 * - Generate updated code for re-review
 * - Track repair attempts to prevent infinite loops
 */

export interface RepairResult {
  success: boolean;
  fixedCode: string;
  changesMade: string[];
  filesModified: string[];
  error?: string;
  duration_ms: number;
}

interface RepairInstruction {
  type: 'issue' | 'security';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  fix: string;
  category: string;
}

export class RepairAgent {
  private stateManager: StateManager;
  private logger: Logger;

  constructor(stateManager: StateManager, logger: Logger, _workingDir: string = process.cwd()) {
    this.stateManager = stateManager;
    this.logger = logger;
  }

  /**
   * Repair code based on Critic review
   * @param review Code review from Critic
   * @param originalCode Original code that was reviewed
   * @param filePath File path being repaired
   * @returns Repair result with fixed code
   */
  async repair(review: CodeReview, originalCode: string, filePath: string): Promise<RepairResult> {
    const startTime = Date.now();

    try {
      // Extract critical and high severity issues
      const criticalIssues = review.issues.filter(
        i => i.severity === 'critical' || i.severity === 'high'
      );

      const criticalSecurityConcerns = review.securityConcerns.filter(
        s => s.severity === 'critical' || s.severity === 'high'
      );

      if (criticalIssues.length === 0 && criticalSecurityConcerns.length === 0) {
        // No critical issues, shouldn't have reached repair agent
        return {
          success: true,
          fixedCode: originalCode,
          changesMade: [],
          filesModified: [],
          duration_ms: Date.now() - startTime,
        };
      }

      // Generate repair instructions
      const repairInstructions = this.generateRepairInstructions(
        criticalIssues,
        criticalSecurityConcerns,
        review.recommendations
      );

      // Apply fixes
      const fixedCode = await this.applyFixes(originalCode, repairInstructions);

      // Track changes
      const changesMade = this.identifyChanges(originalCode, fixedCode, repairInstructions);

      // Write repaired code to file
      await this.writeRepairedFile(filePath, fixedCode);

      // Log repair
      await this.logger.logFix({
        timestamp: new Date().toISOString(),
        agent: 'repair-agent',
        original_issue: review.summary,
        fix_applied: changesMade.join('; '),
        files_modified: [filePath],
        review_verdict: 'needs_repair',
        attempt_number: await this.getRepairAttemptCount(),
      });

      const result: RepairResult = {
        success: true,
        fixedCode,
        changesMade,
        filesModified: [filePath],
        duration_ms: Date.now() - startTime,
      };

      // Log activity
      await this.logger.logAgentActivity({
        timestamp: new Date().toISOString(),
        agent: 'repair-agent',
        action: 'repair_code',
        input: { review, filePath },
        output: result,
        duration_ms: result.duration_ms,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.logger.logFailure({
        timestamp: new Date().toISOString(),
        agent: 'repair-agent',
        error: errorMessage,
        task: `Repair ${filePath}`,
        retry_count: await this.getRepairAttemptCount(),
      });

      return {
        success: false,
        fixedCode: originalCode,
        changesMade: [],
        filesModified: [],
        error: errorMessage,
        duration_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Generate repair instructions from Critic feedback
   */
  private generateRepairInstructions(
    issues: CodeIssue[],
    securityConcerns: SecurityConcern[],
    _recommendations: string[]
  ): RepairInstruction[] {
    const instructions: RepairInstruction[] = [];

    // Convert issues to repair instructions
    for (const issue of issues) {
      if (issue.suggestedFix) {
        instructions.push({
          type: 'issue',
          severity: issue.severity,
          description: issue.description,
          fix: issue.suggestedFix,
          category: issue.category,
        });
      }
    }

    // Convert security concerns to repair instructions
    for (const concern of securityConcerns) {
      instructions.push({
        type: 'security',
        severity: concern.severity,
        description: concern.description,
        fix: concern.recommendation,
        category: 'security',
      });
    }

    return instructions;
  }

  /**
   * Apply fixes to code using pattern matching and replacement
   */
  private async applyFixes(originalCode: string, instructions: RepairInstruction[]): Promise<string> {
    let fixedCode = originalCode;

    for (const instruction of instructions) {
      // Pattern-based fixes for common issues

      // Fix 1: Assignment in conditional
      if (instruction.description.includes('Assignment in conditional')) {
        fixedCode = fixedCode.replace(/if\s*\(\s*(\w+)\s*=\s*(\w+)\s*\)/g, 'if ($1 === $2)');
      }

      // Fix 2: Add null checks (use optional chaining)
      if (instruction.description.includes('null reference')) {
        fixedCode = fixedCode.replace(/(\w+)\.(\w+)\(/g, '$1?.$2(');
      }

      // Fix 3: Add error handling to async functions
      if (instruction.description.includes('async function without')) {
        fixedCode = this.wrapWithTryCatch(fixedCode);
      }

      // Fix 4: Remove eval()
      if (instruction.description.includes('eval()')) {
        fixedCode = fixedCode.replace(/eval\([^)]+\)/g, '/* REMOVED: unsafe eval() */');
      }

      // Fix 5: Extract hardcoded credentials
      if (instruction.description.includes('hardcoded')) {
        fixedCode = fixedCode.replace(
          /(password|api_key|secret|token)\s*=\s*["'][^"']+["']/gi,
          '$1 = process.env.$1.toUpperCase() || ""'
        );
      }

      // Fix 6: Replace synchronous file operations
      if (instruction.description.includes('Synchronous file operation')) {
        fixedCode = fixedCode.replace(/fs\.readFileSync/g, 'await fs.promises.readFile');
        fixedCode = fixedCode.replace(/fs\.writeFileSync/g, 'await fs.promises.writeFile');
      }

      // Fix 7: Replace console.log with Logger
      if (instruction.description.includes('console.log')) {
        fixedCode = fixedCode.replace(/console\.(log|error)\(/g, '// TODO: Use Logger - console.$1(');
      }
    }

    return fixedCode;
  }

  /**
   * Wrap async code with try-catch
   */
  private wrapWithTryCatch(code: string): string {
    // Simple implementation - in production would use AST parsing
    if (code.includes('try') && code.includes('catch')) {
      return code; // Already has error handling
    }

    // Find async function blocks and wrap them
    const asyncFunctionRegex = /async\s+function\s+\w+[^{]*{([^}]+)}/g;

    return code.replace(asyncFunctionRegex, (match, body) => {
      return match.replace(body, `\n  try {${body}\n  } catch (error) {\n    console.error('Error:', error);\n    throw error;\n  }\n`);
    });
  }

  /**
   * Identify what changes were made
   */
  private identifyChanges(original: string, fixed: string, instructions: RepairInstruction[]): string[] {
    const changes: string[] = [];

    if (original !== fixed) {
      for (const instruction of instructions) {
        changes.push(`Fixed: ${instruction.description}`);
      }
    }

    return changes;
  }

  /**
   * Write repaired code to file atomically
   */
  private async writeRepairedFile(filePath: string, content: string): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Atomic write (same pattern as StateManager)
    const tempPath = filePath + '.tmp';
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, filePath);
  }

  /**
   * Get current repair attempt count from state
   */
  private async getRepairAttemptCount(): Promise<number> {
    const state = await this.stateManager.getState();
    return state.repair_attempts || 0;
  }
}
