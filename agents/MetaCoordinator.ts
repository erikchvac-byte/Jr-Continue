/**
 * Meta-Coordinator (Agent 14) - MVP Version
 * Supreme routing authority - routes tasks to appropriate agents
 *
 * MINIMAL IMPLEMENTATION:
 * - Routes tasks based on complexity
 * - Simple decision logic
 * - No optimization yet
 */

import { StateManager } from '../state/StateManager';
import { Logger } from './Logger';
import { TaskComplexity } from '../state/schemas';
import { TokenBudget } from '../state/TokenBudget';

export interface RoutingDecision {
  targetAgent: 'ollama-specialist' | 'claude-specialist';
  reason: string;
  confidence: number;
  tokenBudgetStatus?: {
    used: number;
    remaining: number;
    exhausted: boolean;
  };
}

export class MetaCoordinator {
  private logger: Logger;
  private tokenBudget: TokenBudget;

  // Token estimation per task type
  private readonly TOKEN_ESTIMATES = {
    complex: 1000,
    simple: 200,
  };

  constructor(_stateManager: StateManager, logger: Logger) {
    // stateManager reserved for future use
    this.logger = logger;
    this.tokenBudget = new TokenBudget();
  }

  /**
   * Route a task to the appropriate execution agent
   * @param task Task description
   * @param complexity Task complexity from Router
   * @param forceAgent Optional override to force specific agent
   * @returns Routing decision
   */
  async route(
    task: string,
    complexity: TaskComplexity,
    forceAgent?: 'ollama-specialist' | 'claude-specialist'
  ): Promise<RoutingDecision> {
    const startTime = Date.now();

    try {
      // Get current token budget status
      const budgetState = await this.tokenBudget.load();
      const isExhausted = await this.tokenBudget.isExhausted();
      const remaining = await this.tokenBudget.getRemaining();

      const tokenBudgetStatus = {
        used: budgetState.used,
        remaining,
        exhausted: isExhausted,
      };

      let decision: RoutingDecision;

      // Handle forced agent selection
      if (forceAgent) {
        if (forceAgent === 'claude-specialist' && isExhausted) {
          await this.logger.logAgentActivity({
            timestamp: new Date().toISOString(),
            agent: 'meta-coordinator',
            action: 'token_budget_warning',
            input: { forceAgent, isExhausted },
            output: { warning: 'Forced Claude routing but token budget exhausted. Task may fail.' },
            duration_ms: 0,
          });
        }

        decision = {
          targetAgent: forceAgent,
          reason: `Manually forced to ${forceAgent}`,
          confidence: 1.0,
          tokenBudgetStatus,
        };
      } else {
        // HARD LIMIT - Token budget check comes first
        if (isExhausted) {
          await this.logger.logAgentActivity({
            timestamp: new Date().toISOString(),
            agent: 'meta-coordinator',
            action: 'token_budget_exhausted',
            input: { budgetState },
            output: { message: `Token budget exhausted (${budgetState.used}/${budgetState.dailyLimit}), forcing Ollama` },
            duration_ms: 0,
          });

          decision = {
            targetAgent: 'ollama-specialist',
            reason: 'Token budget exhausted - automatic downgrade to Ollama',
            confidence: 1.0,
            tokenBudgetStatus,
          };
        } else {
          // Normal routing based on complexity
          if (complexity === 'complex') {
            // Estimate token usage and increment budget
            const estimate = this.TOKEN_ESTIMATES.complex;
            await this.tokenBudget.increment(estimate);

            decision = {
              targetAgent: 'claude-specialist',
              reason: 'Complex task requires deep reasoning',
              confidence: 0.8,
              tokenBudgetStatus,
            };
          } else {
            decision = {
              targetAgent: 'ollama-specialist',
              reason: 'Simple task suitable for local execution',
              confidence: 0.9,
              tokenBudgetStatus,
            };
          }
        }
      }

      // Log the routing decision
      await this.logger.logAgentActivity({
        timestamp: new Date().toISOString(),
        agent: 'meta-coordinator',
        action: 'route_task',
        input: { task, complexity, forceAgent },
        output: decision,
        duration_ms: Date.now() - startTime,
      });

      return decision;
    } catch (error) {
      await this.logger.logFailure({
        timestamp: new Date().toISOString(),
        agent: 'meta-coordinator',
        error: error instanceof Error ? error.message : String(error),
        task,
        retry_count: 0,
      });
      throw error;
    }
  }

  /**
   * Get routing statistics (placeholder for future optimization)
   */
  async getStats(): Promise<Record<string, any>> {
    return {
      total_routes: 0,
      ollama_routes: 0,
      claude_routes: 0,
      average_confidence: 0,
    };
  }
}
