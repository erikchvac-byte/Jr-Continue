import { StateManager } from '../state/StateManager';
import { ReviewVerdict } from '../state/schemas';

/**
 * Critic (Agent 6)
 * READ-ONLY agent responsible for code quality review
 *
 * Responsibilities:
 * - Review execution agent output for logic errors
 * - Validate correctness, edge cases, best practices
 * - Identify code smells, security issues, performance problems
 * - Determine: approve, request repair, or escalate
 */

export interface CodeReview {
  verdict: ReviewVerdict;
  issues: CodeIssue[];
  summary: string;
  recommendations: string[];
  securityConcerns: SecurityConcern[];
  performanceIssues: PerformanceIssue[];
  reviewed_at: string;
}

export interface CodeIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'logic' | 'style' | 'security' | 'performance' | 'maintainability';
  description: string;
  location?: string;
  suggestedFix?: string;
}

export interface SecurityConcern {
  type: string; // 'injection', 'xss', 'auth', 'crypto', etc.
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface PerformanceIssue {
  type: string; // 'n+1', 'memory-leak', 'blocking', etc.
  description: string;
  impact: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface CodeDiff {
  file: string;
  additions: string[];
  deletions: string[];
  context: string;
}

export class Critic {
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Review code changes from execution agent
   */
  async reviewCode(
    diffs: CodeDiff[],
    requirements: string
  ): Promise<CodeReview> {
    const issues: CodeIssue[] = [];
    const securityConcerns: SecurityConcern[] = [];
    const performanceIssues: PerformanceIssue[] = [];
    const recommendations: string[] = [];

    // Analyze each file diff
    for (const diff of diffs) {
      // Check for common issues
      issues.push(...this.checkLogicErrors(diff));
      issues.push(...this.checkCodeSmells(diff));
      securityConcerns.push(...this.checkSecurityIssues(diff));
      performanceIssues.push(...this.checkPerformanceIssues(diff));
    }

    // Check if requirements are met
    const requirementsMet = this.validateRequirements(diffs, requirements);

    // Determine verdict
    const verdict = this.determineVerdict(issues, securityConcerns, requirementsMet);

    // Generate recommendations
    if (verdict === 'needs_repair') {
      recommendations.push(...this.generateRecommendations(issues, securityConcerns));
    }

    const review: CodeReview = {
      verdict,
      issues,
      summary: this.generateSummary(verdict, issues, securityConcerns),
      recommendations,
      securityConcerns,
      performanceIssues,
      reviewed_at: new Date().toISOString(),
    };

    // Save review to state
    await this.saveReviewToState(review);

    return review;
  }

  /**
   * Check for logic errors
   */
  private checkLogicErrors(diff: CodeDiff): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const additions = diff.additions.join('\n');

    // Check for common logic errors
    if (additions.includes('if (x = y)')) {
      issues.push({
        severity: 'high',
        category: 'logic',
        description: 'Assignment in conditional (should be ==)',
        location: diff.file,
        suggestedFix: 'Use === for comparison instead of =',
      });
    }

    // Check for missing null checks
    if (additions.match(/\.\w+\s*\(/g) && !additions.includes('?') && !additions.includes('if')) {
      issues.push({
        severity: 'medium',
        category: 'logic',
        description: 'Potential null reference without check',
        location: diff.file,
        suggestedFix: 'Add null/undefined check or use optional chaining (?.)',
      });
    }

    // Check for unhandled promises
    if (additions.includes('async ') && !additions.includes('await') && !additions.includes('catch')) {
      issues.push({
        severity: 'medium',
        category: 'logic',
        description: 'Async function without await or error handling',
        location: diff.file,
        suggestedFix: 'Add try-catch block or handle promise rejection',
      });
    }

    return issues;
  }

  /**
   * Check for code smells
   */
  private checkCodeSmells(diff: CodeDiff): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const additions = diff.additions.join('\n');

    // Check for long functions
    if (additions.split('\n').length > 50) {
      issues.push({
        severity: 'low',
        category: 'maintainability',
        description: 'Function is too long (>50 lines)',
        location: diff.file,
        suggestedFix: 'Consider breaking into smaller functions',
      });
    }

    // Check for magic numbers
    const magicNumbers = additions.match(/\b\d{2,}\b/g);
    if (magicNumbers && magicNumbers.length > 3) {
      issues.push({
        severity: 'low',
        category: 'maintainability',
        description: 'Multiple magic numbers found',
        location: diff.file,
        suggestedFix: 'Extract numbers to named constants',
      });
    }

    // Check for console.log (should use proper logging)
    if (additions.includes('console.log') || additions.includes('console.error')) {
      issues.push({
        severity: 'low',
        category: 'maintainability',
        description: 'Using console.log instead of proper logging',
        location: diff.file,
        suggestedFix: 'Use Logger agent for structured logging',
      });
    }

    return issues;
  }

  /**
   * Check for security issues
   */
  private checkSecurityIssues(diff: CodeDiff): SecurityConcern[] {
    const concerns: SecurityConcern[] = [];
    const additions = diff.additions.join('\n');

    // Check for potential SQL injection
    // BUG-002 FIX: Detect template literals, concat, and join in addition to + operator
    const hasSqlKeyword = additions.includes('SELECT') || additions.includes('INSERT') ||
                          additions.includes('UPDATE') || additions.includes('DELETE');
    const hasStringConcat = additions.includes('+') ||
                            additions.match(/`.*\$\{.*\}.*`/) ||  // Template literals
                            additions.includes('.concat(') ||
                            additions.includes('.join(');

    if (hasSqlKeyword && hasStringConcat) {
      concerns.push({
        type: 'injection',
        description: 'Potential SQL injection vulnerability (string concatenation with SQL keywords)',
        severity: 'critical',
        recommendation: 'Use parameterized queries or ORM',
      });
    }

    // Check for eval usage
    if (additions.includes('eval(')) {
      concerns.push({
        type: 'code-injection',
        description: 'Use of eval() is dangerous',
        severity: 'critical',
        recommendation: 'Remove eval() and use safer alternatives',
      });
    }

    // Check for hardcoded credentials
    // BUG-003 FIX: Detect const/let/var declarations and export statements
    const credentialPatterns = ['password', 'api_key', 'secret', 'token', 'apiKey', 'accessToken'];
    for (const pattern of credentialPatterns) {
      // Match: password = "...", const password = "...", export const password = "..."
      const regex = new RegExp(`(const|let|var|export\\s+const|export\\s+let|export\\s+var)?\\s*${pattern}\\s*=\\s*["']`, 'i');
      if (regex.test(additions)) {
        concerns.push({
          type: 'credentials',
          description: `Potential hardcoded ${pattern}`,
          severity: 'high',
          recommendation: 'Use environment variables or secret management',
        });
      }
    }

    // Check for unsafe file operations
    if (additions.includes('fs.unlink') || additions.includes('fs.rm')) {
      if (!additions.includes('try') && !additions.includes('catch')) {
        concerns.push({
          type: 'file-system',
          description: 'Unsafe file deletion without error handling',
          severity: 'medium',
          recommendation: 'Add proper error handling and validation',
        });
      }
    }

    return concerns;
  }

  /**
   * Check for performance issues
   */
  private checkPerformanceIssues(diff: CodeDiff): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];
    const additions = diff.additions.join('\n');

    // Check for synchronous file operations
    if (additions.includes('fs.readFileSync') || additions.includes('fs.writeFileSync')) {
      issues.push({
        type: 'blocking',
        description: 'Synchronous file operation blocks event loop',
        impact: 'high',
        suggestion: 'Use async fs.promises methods instead',
      });
    }

    // Check for nested loops
    const nestedLoopPattern = /for.*\{[\s\S]*for.*\{/;
    if (nestedLoopPattern.test(additions)) {
      issues.push({
        type: 'complexity',
        description: 'Nested loops may cause O(n²) complexity',
        impact: 'medium',
        suggestion: 'Consider using Map/Set or optimizing algorithm',
      });
    }

    // Check for repeated expensive operations in loops
    if (additions.includes('for') && additions.includes('JSON.parse')) {
      issues.push({
        type: 'repeated-work',
        description: 'Expensive operation inside loop',
        impact: 'medium',
        suggestion: 'Move operation outside loop if possible',
      });
    }

    return issues;
  }

  /**
   * Validate requirements are met
   */
  private validateRequirements(diffs: CodeDiff[], requirements: string): boolean {
    // Simple check - in real implementation, this would be more sophisticated
    if (!requirements) {
      return true;
    }

    // Check if any code was actually added
    const hasChanges = diffs.some(diff => diff.additions.length > 0);
    return hasChanges;
  }

  /**
   * Determine overall verdict
   */
  private determineVerdict(
    issues: CodeIssue[],
    securityConcerns: SecurityConcern[],
    requirementsMet: boolean
  ): ReviewVerdict {
    // Reject if critical security issues or requirements not met
    const hasCriticalSecurity = securityConcerns.some(c => c.severity === 'critical');
    if (hasCriticalSecurity || !requirementsMet) {
      return 'rejected';
    }

    // BUG-003 FIX: Check for high severity in BOTH issues AND securityConcerns
    const hasCriticalIssues = issues.some(i => i.severity === 'critical' || i.severity === 'high');
    const hasHighSecurity = securityConcerns.some(c => c.severity === 'high');
    if (hasCriticalIssues || hasHighSecurity) {
      return 'needs_repair';
    }

    // Approve if only low/medium issues
    return 'approved';
  }

  /**
   * Generate summary of review
   */
  private generateSummary(
    verdict: ReviewVerdict,
    issues: CodeIssue[],
    securityConcerns: SecurityConcern[]
  ): string {
    const issueCount = issues.length;
    const securityCount = securityConcerns.length;

    if (verdict === 'approved') {
      return `Code review passed with ${issueCount} minor issues. No blocking concerns.`;
    } else if (verdict === 'needs_repair') {
      return `Code review requires changes. Found ${issueCount} issues including ${securityCount} security concerns.`;
    } else {
      return `Code review rejected. Critical issues must be resolved before proceeding.`;
    }
  }

  /**
   * Generate recommendations for fixes
   */
  private generateRecommendations(
    issues: CodeIssue[],
    securityConcerns: SecurityConcern[]
  ): string[] {
    const recommendations: string[] = [];

    // Prioritize critical and high severity
    const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'high');

    for (const issue of criticalIssues) {
      if (issue.suggestedFix) {
        recommendations.push(`${issue.description}: ${issue.suggestedFix}`);
      }
    }

    // Add security recommendations
    for (const concern of securityConcerns) {
      if (concern.severity === 'critical' || concern.severity === 'high') {
        recommendations.push(`Security: ${concern.recommendation}`);
      }
    }

    return recommendations;
  }

  /**
   * Save review to state
   */
  private async saveReviewToState(review: CodeReview): Promise<void> {
    await this.stateManager.updateField('review_verdict', review.verdict);

    // Store full review in architectural_design for now
    // (in full system, would have dedicated review storage)
    const state = await this.stateManager.getState();
    const archDesign = state.architectural_design as any;
    archDesign.last_review = review;

    await this.stateManager.updateField('architectural_design', archDesign);
  }

  /**
   * Get last review from state
   */
  async getLastReview(): Promise<CodeReview | null> {
    const state = await this.stateManager.getState();
    const archDesign = state.architectural_design as any;

    if (archDesign && archDesign.last_review) {
      return archDesign.last_review as CodeReview;
    }

    return null;
  }
}
