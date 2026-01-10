/**
 * TokenBudget - Persistent token budget tracking
 * Enforces hard limits on Claude API token usage
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface TokenBudgetState {
  used: number;
  resetTime: number;
  dailyLimit: number;
}

export class TokenBudget {
  private readonly filePath: string;
  private readonly dailyLimit: number = 10000;

  constructor(stateDir: string = path.join(process.cwd(), 'state')) {
    this.filePath = path.join(stateDir, 'token_budget.json');
  }

  /**
   * Load token budget state from disk
   */
  async load(): Promise<TokenBudgetState> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const state: TokenBudgetState = JSON.parse(data);

      // Auto-reset if past reset time
      if (Date.now() >= state.resetTime) {
        return await this.reset();
      }

      return state;
    } catch (error) {
      // File doesn't exist, create initial state
      return await this.reset();
    }
  }

  /**
   * Save token budget state to disk
   */
  async save(used: number, resetTime: number): Promise<void> {
    const state: TokenBudgetState = {
      used,
      resetTime,
      dailyLimit: this.dailyLimit,
    };

    await fs.writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Reset the token budget (sets new 24-hour window)
   */
  async reset(): Promise<TokenBudgetState> {
    const state: TokenBudgetState = {
      used: 0,
      resetTime: Date.now() + 86400000, // 24 hours from now
      dailyLimit: this.dailyLimit,
    };

    await this.save(state.used, state.resetTime);
    return state;
  }

  /**
   * Increment token usage
   */
  async increment(tokens: number): Promise<TokenBudgetState> {
    const state = await this.load();
    state.used += tokens;
    await this.save(state.used, state.resetTime);
    return state;
  }

  /**
   * Check if budget is exhausted
   */
  async isExhausted(): Promise<boolean> {
    const state = await this.load();
    return state.used >= state.dailyLimit;
  }

  /**
   * Get remaining tokens
   */
  async getRemaining(): Promise<number> {
    const state = await this.load();
    return Math.max(0, state.dailyLimit - state.used);
  }
}
