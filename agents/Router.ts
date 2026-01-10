/**
 * Task-Router (Agent 1) - MVP Version
 * Entry point for all tasks - performs complexity analysis
 *
 * MINIMAL IMPLEMENTATION:
 * - Analyzes task complexity based on keywords
 * - Simple scoring algorithm
 * - No ML optimization yet
 */

import { StateManager } from '../state/StateManager';
import { Logger } from './Logger';
import { TaskComplexity } from '../state/schemas';

export interface ComplexityAnalysis {
  complexity: TaskComplexity;
  score: number; // 0-100
  factors: string[];
}

export class Router {
  private stateManager: StateManager;
  private logger: Logger;

  // Scoring constants
  private readonly BASE_SCORE = 50;
  private readonly KEYWORD_SCORE_ADJUSTMENT = 10;
  private readonly LONG_DESCRIPTION_BONUS = 15;
  private readonly SHORT_DESCRIPTION_PENALTY = 10;
  private readonly COMPLEXITY_THRESHOLD = 60;
  private readonly LONG_DESCRIPTION_LENGTH = 200;
  private readonly SHORT_DESCRIPTION_LENGTH = 50;

  // Keywords indicating complexity
  private readonly COMPLEX_KEYWORDS = [
    'refactor',
    'architecture',
    'optimize',
    'security',
    'algorithm',
    'design pattern',
    'integration',
    'migration',
    'performance',
    'database',
  ];

  private readonly SIMPLE_KEYWORDS = [
    'add function',
    'fix typo',
    'update comment',
    'rename',
    'log',
    'console',
    'sum',
    'calculate',
    'format',
    'parse',
  ];

  constructor(stateManager: StateManager, logger: Logger) {
    this.stateManager = stateManager;
    this.logger = logger;
  }

  /**
   * Calculate score adjustments based on keyword matching
   * @param taskLower Lowercase task description
   * @param factors Array to collect scoring factors
   * @returns Score adjustment amount
   */
  private calculateKeywordScore(taskLower: string, factors: string[]): number {
    let adjustment = 0;

    // Check for complex indicators
    for (const keyword of this.COMPLEX_KEYWORDS) {
      if (taskLower.includes(keyword)) {
        adjustment += this.KEYWORD_SCORE_ADJUSTMENT;
        factors.push(`Complex keyword: ${keyword}`);
      }
    }

    // Check for simple indicators
    for (const keyword of this.SIMPLE_KEYWORDS) {
      if (taskLower.includes(keyword)) {
        adjustment -= this.KEYWORD_SCORE_ADJUSTMENT;
        factors.push(`Simple keyword: ${keyword}`);
      }
    }

    return adjustment;
  }

  /**
   * Calculate score adjustments based on task description length
   * @param task Task description
   * @param factors Array to collect scoring factors
   * @returns Score adjustment amount
   */
  private calculateLengthScore(task: string, factors: string[]): number {
    if (task.length > this.LONG_DESCRIPTION_LENGTH) {
      factors.push('Long description');
      return this.LONG_DESCRIPTION_BONUS;
    } else if (task.length < this.SHORT_DESCRIPTION_LENGTH) {
      factors.push('Short description');
      return -this.SHORT_DESCRIPTION_PENALTY;
    }
    return 0;
  }

  /**
   * Analyze task complexity
   * @param task Task description
   * @returns Complexity analysis
   */
  async analyzeComplexity(task: string): Promise<ComplexityAnalysis> {
    const startTime = Date.now();
    const taskLower = task.toLowerCase();

    try {
      const factors: string[] = [];

      // Calculate score from base + keyword matching + length
      let score = this.BASE_SCORE;
      score += this.calculateKeywordScore(taskLower, factors);
      score += this.calculateLengthScore(task, factors);

      // Clamp score to 0-100
      score = Math.max(0, Math.min(100, score));

      // Determine complexity
      const complexity: TaskComplexity =
        score >= this.COMPLEXITY_THRESHOLD ? 'complex' : 'simple';

      const analysis: ComplexityAnalysis = {
        complexity,
        score,
        factors,
      };

      // Update state
      const state = await this.stateManager.readState();
      state.current_task = task;
      state.complexity = complexity;
      await this.stateManager.writeState(state);

      // Log the analysis
      await this.logger.logAgentActivity({
        timestamp: new Date().toISOString(),
        agent: 'router',
        action: 'analyze_complexity',
        input: { task },
        output: analysis,
        duration_ms: Date.now() - startTime,
      });

      return analysis;
    } catch (error) {
      await this.logger.logFailure({
        timestamp: new Date().toISOString(),
        agent: 'router',
        error: error instanceof Error ? error.message : String(error),
        task,
        retry_count: 0,
      });
      throw error;
    }
  }
}
