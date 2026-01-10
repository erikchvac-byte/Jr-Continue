import { StateManager } from '../state/StateManager';
import { Logger } from './Logger';
import { FailureEvent } from '../state/schemas';

/**
 * AutoDebug (Agent 12)
 * Analyzes failures and identifies root causes
 *
 * Responsibilities:
 * - Parse error messages from failed tasks
 * - Identify error patterns and root causes
 * - Suggest fixes based on error analysis
 * - Track failure patterns for learning
 * - Generate debugging recommendations
 */

export interface ErrorAnalysis {
  errorType: string;
  rootCause: string;
  affectedComponents: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestedFixes: string[];
  relatedFailures: number;
  confidence: number; // 0-100
}

export interface DebugResult {
  success: boolean;
  analysis: ErrorAnalysis | null;
  duration_ms: number;
  error?: string;
}

export interface DebugPattern {
  pattern: RegExp;
  errorType: string;
  rootCause: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  fixes: string[];
}

export class AutoDebug {
  private logger: Logger;

  // Known error patterns for quick identification
  private readonly errorPatterns: DebugPattern[] = [
    {
      pattern: /Cannot read propert(y|ies) ['"](\w+)['"] of (undefined|null)/i,
      errorType: 'NullReferenceError',
      rootCause: 'Attempting to access property on undefined/null object',
      severity: 'high',
      fixes: [
        'Add null/undefined checks before property access',
        'Use optional chaining (?.) operator',
        'Ensure object is initialized before use',
        'Add type guards for TypeScript',
      ],
    },
    {
      pattern: /(\w+) is not defined/i,
      errorType: 'ReferenceError',
      rootCause: 'Variable or function not declared or imported',
      severity: 'high',
      fixes: [
        'Import the missing variable/function',
        'Declare the variable before use',
        'Check for typos in variable name',
        'Ensure the module is properly exported',
      ],
    },
    {
      pattern: /Cannot find module ['"]([^'"]+)['"]/i,
      errorType: 'ModuleNotFoundError',
      rootCause: 'Missing dependency or incorrect import path',
      severity: 'critical',
      fixes: [
        'Install the missing npm package',
        'Check import path is correct',
        'Verify package.json dependencies',
        'Run npm install to ensure dependencies are installed',
      ],
    },
    {
      pattern: /ENOENT.*no such file or directory/i,
      errorType: 'FileNotFoundError',
      rootCause: 'File or directory does not exist',
      severity: 'medium',
      fixes: [
        'Create the missing file/directory',
        'Check file path is correct',
        'Verify file permissions',
        'Ensure file exists before attempting to read',
      ],
    },
    {
      pattern: /Unexpected token/i,
      errorType: 'SyntaxError',
      rootCause: 'Invalid JavaScript/TypeScript syntax',
      severity: 'critical',
      fixes: [
        'Check for missing brackets or parentheses',
        'Verify JSON is properly formatted',
        'Ensure async/await syntax is correct',
        'Review recent code changes for syntax errors',
      ],
    },
    {
      pattern: /Type ['"]([^'"]+)['"] is not assignable to type ['"]([^'"]+)['"]/i,
      errorType: 'TypeScriptTypeError',
      rootCause: 'Type mismatch in TypeScript code',
      severity: 'medium',
      fixes: [
        'Add type casting where appropriate',
        'Update interface/type definitions',
        'Use type guards to narrow types',
        'Review return types and parameter types',
      ],
    },
    {
      pattern: /timeout|timed out/i,
      errorType: 'TimeoutError',
      rootCause: 'Operation exceeded time limit',
      severity: 'medium',
      fixes: [
        'Increase timeout duration',
        'Optimize slow operations',
        'Check for infinite loops or blocking code',
        'Review network/database query performance',
      ],
    },
    {
      pattern: /EACCES|permission denied/i,
      errorType: 'PermissionError',
      rootCause: 'Insufficient permissions to access resource',
      severity: 'high',
      fixes: [
        'Check file/directory permissions',
        'Run with appropriate user privileges',
        'Verify write access to target directory',
        'Review security policies',
      ],
    },
    {
      pattern: /stack overflow|Maximum call stack/i,
      errorType: 'StackOverflowError',
      rootCause: 'Infinite recursion or excessive call stack depth',
      severity: 'critical',
      fixes: [
        'Add base case to recursive functions',
        'Check for circular references',
        'Reduce recursion depth',
        'Convert recursive algorithm to iterative',
      ],
    },
    {
      pattern: /Out of memory|ENOMEM/i,
      errorType: 'OutOfMemoryError',
      rootCause: 'Insufficient memory for operation',
      severity: 'critical',
      fixes: [
        'Process data in smaller chunks',
        'Clear unused references',
        'Increase Node.js memory limit (--max-old-space-size)',
        'Review memory leaks',
      ],
    },
  ];

  constructor(_stateManager: StateManager, logger: Logger, _workingDir: string = process.cwd()) {
    this.logger = logger;
  }

  /**
   * Analyze a failure event and identify root cause
   * @param failure Failure event to analyze
   * @returns Debug result with error analysis
   */
  async analyzeFailure(failure: FailureEvent): Promise<DebugResult> {
    const startTime = Date.now();

    try {
      // Match error against known patterns
      const matchedPattern = this.matchErrorPattern(failure.error);

      if (matchedPattern) {
        // Get related failures to calculate confidence
        const relatedFailures = await this.findRelatedFailures(matchedPattern.errorType);

        const analysis: ErrorAnalysis = {
          errorType: matchedPattern.errorType,
          rootCause: matchedPattern.rootCause,
          affectedComponents: this.extractAffectedComponents(failure),
          severity: matchedPattern.severity,
          suggestedFixes: matchedPattern.fixes,
          relatedFailures: relatedFailures.length,
          confidence: this.calculateConfidence(matchedPattern, relatedFailures.length),
        };

        // Log the analysis
        await this.logger.logAgentActivity({
          timestamp: new Date().toISOString(),
          agent: 'auto-debug',
          action: 'analyze_failure',
          input: failure,
          output: analysis,
          duration_ms: Date.now() - startTime,
        });

        return {
          success: true,
          analysis,
          duration_ms: Date.now() - startTime,
        };
      }

      // Unknown error pattern - perform generic analysis
      const genericAnalysis = await this.performGenericAnalysis(failure);

      await this.logger.logAgentActivity({
        timestamp: new Date().toISOString(),
        agent: 'auto-debug',
        action: 'analyze_failure',
        input: failure,
        output: genericAnalysis,
        duration_ms: Date.now() - startTime,
      });

      return {
        success: true,
        analysis: genericAnalysis,
        duration_ms: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.logger.logFailure({
        timestamp: new Date().toISOString(),
        agent: 'auto-debug',
        error: errorMessage,
        task: `Analyze failure: ${failure.task}`,
        retry_count: 0,
      });

      return {
        success: false,
        analysis: null,
        duration_ms: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Analyze multiple failures to identify patterns
   * @param failures Array of failure events
   * @returns Common patterns and insights
   */
  async analyzePatterns(failures: FailureEvent[]): Promise<{
    commonErrors: string[];
    mostAffectedAgent: string;
    timeDistribution: Record<string, number>;
    recommendations: string[];
  }> {
    const errorTypes: Record<string, number> = {};
    const agentFailures: Record<string, number> = {};
    const hourlyDistribution: Record<string, number> = {};

    for (const failure of failures) {
      // Count error types
      const pattern = this.matchErrorPattern(failure.error);
      if (pattern) {
        errorTypes[pattern.errorType] = (errorTypes[pattern.errorType] || 0) + 1;
      }

      // Count agent failures
      agentFailures[failure.agent] = (agentFailures[failure.agent] || 0) + 1;

      // Track time distribution
      const hour = new Date(failure.timestamp).getHours().toString();
      hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
    }

    // Generate recommendations
    const recommendations: string[] = [];

    const mostCommonError = Object.entries(errorTypes).sort((a, b) => b[1] - a[1])[0];
    if (mostCommonError) {
      recommendations.push(`Focus on fixing ${mostCommonError[0]} (${mostCommonError[1]} occurrences)`);
    }

    const mostAffectedAgent = Object.entries(agentFailures).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    if (agentFailures[mostAffectedAgent] > 3) {
      recommendations.push(`Agent ${mostAffectedAgent} has ${agentFailures[mostAffectedAgent]} failures - review implementation`);
    }

    return {
      commonErrors: Object.keys(errorTypes).sort((a, b) => errorTypes[b] - errorTypes[a]),
      mostAffectedAgent,
      timeDistribution: hourlyDistribution,
      recommendations,
    };
  }

  /**
   * Match error message against known patterns
   */
  private matchErrorPattern(errorMessage: string): DebugPattern | null {
    for (const pattern of this.errorPatterns) {
      if (pattern.pattern.test(errorMessage)) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * Find related failures of the same type
   */
  private async findRelatedFailures(errorType: string): Promise<FailureEvent[]> {
    try {
      const recentFailures = await this.logger.queryLogs({
        error_type: errorType,
      });

      if (!Array.isArray(recentFailures)) {
        return [];
      }

      return recentFailures.filter((log: any) => {
        if (!log || typeof log !== 'object' || !log.error) {
          return false;
        }
        const pattern = this.matchErrorPattern(log.error || '');
        return pattern?.errorType === errorType;
      }) as unknown as FailureEvent[];
    } catch {
      return [];
    }
  }

  /**
   * Extract affected components from failure
   */
  private extractAffectedComponents(failure: FailureEvent): string[] {
    const components: string[] = [failure.agent];

    // Extract file paths from error message
    const filePathRegex = /(?:at|in|from)\s+([^\s:]+\.[jt]s)/gi;
    const matches = failure.error.matchAll(filePathRegex);

    for (const match of matches) {
      if (match[1]) {
        components.push(match[1]);
      }
    }

    return [...new Set(components)]; // Remove duplicates
  }

  /**
   * Calculate confidence based on pattern match and history
   */
  private calculateConfidence(pattern: DebugPattern, relatedCount: number): number {
    // Base confidence from pattern match
    let confidence = 70;

    // Increase confidence if we've seen this error before
    if (relatedCount > 0) {
      confidence += Math.min(relatedCount * 5, 25);
    }

    // Critical severity patterns are easier to identify
    if (pattern.severity === 'critical') {
      confidence += 5;
    }

    return Math.min(confidence, 100);
  }

  /**
   * Perform generic analysis for unknown error patterns
   */
  private async performGenericAnalysis(failure: FailureEvent): Promise<ErrorAnalysis> {
    return {
      errorType: 'UnknownError',
      rootCause: 'Error pattern not recognized. Manual investigation required.',
      affectedComponents: this.extractAffectedComponents(failure),
      severity: 'medium',
      suggestedFixes: [
        'Review error stack trace carefully',
        'Check recent code changes',
        'Verify environment configuration',
        'Search error message in documentation',
        'Enable debug logging for more details',
      ],
      relatedFailures: 0,
      confidence: 30, // Low confidence for unknown patterns
    };
  }
}
