import { SessionSummary } from '../state/schemas';
import { StateManager } from '../state/StateManager';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';

/**
 * SessionManager (Agent 19)
 * READ-ONLY agent responsible for session lifecycle
 *
 * Responsibilities:
 * - Read session_summary.json on startup
 * - Initialize new sessions with unique IDs
 * - Write session_summary.json on shutdown
 * - Track accomplished tasks and next steps
 * - Validate session consistency
 */
export class SessionManager {
  private summaryPath: string;
  private stateManager: StateManager;

  constructor(summaryPath: string, stateManager: StateManager) {
    this.summaryPath = summaryPath;
    this.stateManager = stateManager;
  }

  /**
   * Initialize session - read existing or create new
   * Returns SessionSummary for system use
   */
  async initialize(): Promise<SessionSummary> {
    try {
      // Try to read existing session summary
      const content = await fs.readFile(this.summaryPath, 'utf8');
      const summary = JSON.parse(content) as SessionSummary;

      console.log(`[Jr] Resuming session ${summary.session_id}`);
      console.log(`[Jr] Previous session ended: ${summary.end_time || 'Still active'}`);

      if (summary.incomplete_tasks.length > 0) {
        console.log(`[Jr] Incomplete tasks from previous session:`);
        summary.incomplete_tasks.forEach((task, i) => {
          console.log(`  ${i + 1}. ${task}`);
        });
      }

      return summary;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // No existing session, create new
        const newSummary: SessionSummary = {
          session_id: uuidv4(),
          start_time: new Date().toISOString(),
          end_time: null,
          accomplished: [],
          next_steps: [],
          incomplete_tasks: [],
          system_health: 'healthy',
        };

        await this.writeSummary(newSummary);
        console.log(`[Jr] New session started: ${newSummary.session_id}`);

        return newSummary;
      } else {
        throw new Error(`Failed to read session summary: ${error.message}`);
      }
    }
  }

  /**
   * Finalize session on shutdown
   * Writes final state with end_time and accomplishments
   */
  async finalize(summary: SessionSummary): Promise<void> {
    summary.end_time = new Date().toISOString();

    await this.writeSummary(summary);

    console.log(`[Jr] Session ${summary.session_id} finalized`);
    console.log(`[Jr] Duration: ${this.calculateDuration(summary.start_time, summary.end_time)}`);
    console.log(`[Jr] Accomplished tasks: ${summary.accomplished.length}`);
    console.log(`[Jr] System health: ${summary.system_health}`);
  }

  /**
   * Write session summary to disk
   */
  private async writeSummary(summary: SessionSummary): Promise<void> {
    const content = JSON.stringify(summary, null, 2);
    await fs.writeFile(this.summaryPath, content, 'utf8');
  }

  /**
   * Validate session consistency
   * Checks if session state is valid and system is operational
   */
  async validateSession(): Promise<boolean> {
    try {
      // Read current summary
      const summary = await this.initialize();

      // Check required fields
      if (!summary.session_id || !summary.start_time) {
        console.error('Session summary missing required fields');
        return false;
      }

      // Verify state manager is accessible
      const state = await this.stateManager.getState();
      if (!state) {
        console.error('State manager returned invalid state');
        return false;
      }

      // Check system health
      if (summary.system_health === 'failed') {
        console.warn('System health is marked as failed');
        return false;
      }

      return true;
    } catch (error: any) {
      console.error(`Session validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Update session summary with new accomplishments
   */
  async addAccomplishment(task: string): Promise<void> {
    const summary = await this.initialize();
    summary.accomplished.push(task);

    // Remove from incomplete if it was there
    summary.incomplete_tasks = summary.incomplete_tasks.filter(t => t !== task);

    await this.writeSummary(summary);
  }

  /**
   * Add task to incomplete list
   */
  async addIncompleteTask(task: string): Promise<void> {
    const summary = await this.initialize();

    if (!summary.incomplete_tasks.includes(task)) {
      summary.incomplete_tasks.push(task);
      await this.writeSummary(summary);
    }
  }

  /**
   * Update system health status
   */
  async updateSystemHealth(health: 'healthy' | 'degraded' | 'failed'): Promise<void> {
    const summary = await this.initialize();
    summary.system_health = health;
    await this.writeSummary(summary);
  }

  /**
   * Calculate duration between start and end times
   */
  private calculateDuration(startTime: string, endTime: string | null): string {
    if (!endTime) {
      return 'Ongoing';
    }

    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const durationMs = end - start;

    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);

    return `${hours}h ${minutes}m ${seconds}s`;
  }
}
