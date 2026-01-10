import { AgentActivity, FailureEvent, FixEvent, LogFilter } from '../state/schemas';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Logger Agent (Agent 7)
 * READ-ONLY agent responsible for event logging and audit trail
 *
 * Responsibilities:
 * - Record agent interactions to conversation logs
 * - Track failures in JSONL format
 * - Track repairs in JSONL format
 * - Prune logs older than 7 days
 * - Query logs with filters
 */
export class Logger {
  private conversationLogsDir: string;
  private failureLogPath: string;
  private fixLogPath: string;

  constructor(logDir: string) {
    this.conversationLogsDir = path.join(logDir, 'conversation_logs');
    this.failureLogPath = path.join(logDir, 'failure_events.jsonl');
    this.fixLogPath = path.join(logDir, 'applied_fixes.jsonl');
  }

  /**
   * Initialize logger directories
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.conversationLogsDir, { recursive: true });
  }

  /**
   * Append data to file in JSONL format
   */
  private async appendJsonLine(filePath: string, data: any): Promise<void> {
    const line = JSON.stringify(data) + '\n';
    await fs.appendFile(filePath, line, 'utf8');
  }

  /**
   * Log agent activity to conversation log
   * Creates per-agent, per-day log files
   */
  async logAgentActivity(activity: AgentActivity): Promise<void> {
    await this.initialize();

    const date = new Date(activity.timestamp).toISOString().split('T')[0];
    const filename = `${activity.agent}_${date}.log`;
    const filePath = path.join(this.conversationLogsDir, filename);

    await this.appendJsonLine(filePath, activity);
  }

  /**
   * Log failure event to failure_events.jsonl
   */
  async logFailure(failure: FailureEvent): Promise<void> {
    await this.initialize();
    await this.appendJsonLine(this.failureLogPath, failure);
  }

  /**
   * Log fix event to applied_fixes.jsonl
   */
  async logFix(fix: FixEvent): Promise<void> {
    await this.initialize();
    await this.appendJsonLine(this.fixLogPath, fix);
  }

  /**
   * Prune logs older than 7 days
   * Deletes conversation logs and trims JSONL files
   */
  async pruneLogs(): Promise<void> {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    // Prune conversation logs
    try {
      const files = await fs.readdir(this.conversationLogsDir);

      for (const file of files) {
        const filePath = path.join(this.conversationLogsDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtimeMs < sevenDaysAgo) {
          await fs.unlink(filePath);
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Prune JSONL files (keep only recent entries)
    await this.pruneJsonlFile(this.failureLogPath, sevenDaysAgo);
    await this.pruneJsonlFile(this.fixLogPath, sevenDaysAgo);
  }

  /**
   * Remove old entries from JSONL file
   */
  private async pruneJsonlFile(filePath: string, cutoffTime: number): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim() !== '');

      const recentLines = lines.filter(line => {
        try {
          const entry = JSON.parse(line);
          const timestamp = new Date(entry.timestamp).getTime();
          return timestamp >= cutoffTime;
        } catch {
          return false; // Skip malformed lines
        }
      });

      // Rewrite file with recent entries only
      if (recentLines.length === 0) {
        await fs.unlink(filePath);
      } else {
        const newContent = recentLines.join('\n') + '\n';
        await fs.writeFile(filePath, newContent, 'utf8');
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Query logs with optional filters
   * Returns array of log entries as JSON strings
   */
  async queryLogs(filter: LogFilter): Promise<string[]> {
    const results: string[] = [];

    // Query conversation logs
    try {
      const files = await fs.readdir(this.conversationLogsDir);

      for (const file of files) {
        // Filter by agent name if specified
        if (filter.agent && !file.startsWith(filter.agent)) {
          continue;
        }

        const filePath = path.join(this.conversationLogsDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (this.matchesFilter(entry, filter)) {
              results.push(line);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Query failure events
    await this.queryJsonlFile(this.failureLogPath, filter, results);

    // Query fix events
    await this.queryJsonlFile(this.fixLogPath, filter, results);

    return results;
  }

  /**
   * Query a JSONL file with filters
   */
  private async queryJsonlFile(
    filePath: string,
    filter: LogFilter,
    results: string[]
  ): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (this.matchesFilter(entry, filter)) {
            results.push(line);
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Check if log entry matches filter criteria
   */
  private matchesFilter(entry: any, filter: LogFilter): boolean {
    if (filter.agent && entry.agent !== filter.agent) {
      return false;
    }

    if (filter.start_date) {
      const entryTime = new Date(entry.timestamp).getTime();
      const startTime = new Date(filter.start_date).getTime();
      if (entryTime < startTime) {
        return false;
      }
    }

    if (filter.end_date) {
      const entryTime = new Date(entry.timestamp).getTime();
      const endTime = new Date(filter.end_date).getTime();
      if (entryTime > endTime) {
        return false;
      }
    }

    if (filter.error_type && entry.error !== filter.error_type) {
      return false;
    }

    return true;
  }
}
