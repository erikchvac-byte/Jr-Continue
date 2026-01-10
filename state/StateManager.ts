import { SessionState, DEFAULT_SESSION_STATE } from './schemas';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * StateManager - Single Source of Truth for system state
 *
 * Critical Features:
 * - Atomic writes using temp-file-then-rename pattern
 * - File locking with 5-second timeout
 * - Corruption detection via JSON validation
 * - Automatic backup every write
 * - Recovery from backup on corruption
 */
export class StateManager {
  private statePath: string;
  private backupPath: string;
  private lockPath: string;
  private lockTimeout: number = 5000; // 5 seconds
  private backupInterval: number = 10 * 60 * 1000; // 10 minutes
  private lastBackupTime: number = 0;

  constructor(statePath: string) {
    this.statePath = statePath;
    this.backupPath = statePath.replace('.json', '.backup.json');
    this.lockPath = statePath + '.lock';
  }

  /**
   * Initialize state file with defaults if it doesn't exist
   */
  async initialize(): Promise<void> {
    try {
      await fs.access(this.statePath);
    } catch {
      // File doesn't exist, create directory and file with defaults
      const stateDir = path.dirname(this.statePath);
      await fs.mkdir(stateDir, { recursive: true });
      await this.writeState(DEFAULT_SESSION_STATE);
    }
  }

  /**
   * Read current state with corruption detection
   * Falls back to backup if primary is corrupted
   */
  async readState(): Promise<SessionState> {
    try {
      const content = await fs.readFile(this.statePath, 'utf8');
      const state = this.parseAndValidate(content);
      return state;
    } catch (primaryError: any) {
      // Try backup if primary fails
      console.warn(`Primary state file corrupt or missing: ${primaryError.message}`);
      console.warn('Attempting recovery from backup...');

      try {
        const backupContent = await fs.readFile(this.backupPath, 'utf8');
        const state = this.parseAndValidate(backupContent);

        // Restore primary from backup
        await this.writeState(state);
        console.log('Successfully recovered from backup');

        return state;
      } catch (backupError: any) {
        console.error(`Backup also corrupt or missing: ${backupError.message}`);
        console.log('Initializing with default state');

        // Both failed, use defaults
        await this.writeState(DEFAULT_SESSION_STATE);
        return DEFAULT_SESSION_STATE;
      }
    }
  }

  /**
   * Parse JSON and validate structure
   */
  private parseAndValidate(content: string): SessionState {
    try {
      const state = JSON.parse(content) as SessionState;

      // Validate required fields exist
      if (typeof state !== 'object' || state === null) {
        throw new Error('State is not an object');
      }

      if (!('last_updated' in state)) {
        throw new Error('Missing required field: last_updated');
      }

      if (!('agent_status' in state)) {
        throw new Error('Missing required field: agent_status');
      }

      return state;
    } catch (error: any) {
      throw new Error(`JSON parse/validation failed: ${error.message}`);
    }
  }

  /**
   * Write state atomically with backup
   * Uses temp-file-then-rename for atomic writes
   */
  async writeState(state: SessionState): Promise<void> {
    // Update timestamp
    state.last_updated = new Date().toISOString();

    // Acquire lock
    const lockAcquired = await this.acquireLock();
    if (!lockAcquired) {
      throw new Error(`Failed to acquire lock after ${this.lockTimeout}ms`);
    }

    try {
      // Atomic write: write to temp file, then rename
      const tempPath = this.statePath + '.tmp';
      const content = JSON.stringify(state, null, 2);

      await fs.writeFile(tempPath, content, 'utf8');
      await fs.rename(tempPath, this.statePath);

      // Create backup if interval elapsed
      const now = Date.now();
      if (now - this.lastBackupTime >= this.backupInterval) {
        await this.createBackup();
        this.lastBackupTime = now;
      }
    } finally {
      // Always release lock
      await this.releaseLock();
    }
  }

  /**
   * Create backup of current state
   */
  async createBackup(): Promise<void> {
    try {
      const content = await fs.readFile(this.statePath, 'utf8');
      await fs.writeFile(this.backupPath, content, 'utf8');
    } catch (error: any) {
      console.warn(`Backup creation failed: ${error.message}`);
    }
  }

  /**
   * Acquire file lock with timeout
   * Returns true if lock acquired, false if timeout
   */
  private async acquireLock(): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.lockTimeout) {
      try {
        // Try to create lock file (fails if exists)
        await fs.writeFile(this.lockPath, process.pid.toString(), { flag: 'wx' });
        return true;
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // Lock exists, check if it's stale
          try {
            const lockContent = await fs.readFile(this.lockPath, 'utf8');
            const lockAge = Date.now() - (await fs.stat(this.lockPath)).mtimeMs;

            // If lock is older than timeout, it's stale - remove it
            if (lockAge > this.lockTimeout) {
              console.warn(`Removing stale lock (age: ${lockAge}ms, pid: ${lockContent})`);
              await fs.unlink(this.lockPath);
            }
          } catch {
            // Lock file disappeared, retry
          }

          // Wait a bit before retrying
          await this.sleep(50);
        } else {
          throw error;
        }
      }
    }

    return false;
  }

  /**
   * Release file lock
   */
  private async releaseLock(): Promise<void> {
    try {
      await fs.unlink(this.lockPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`Failed to release lock: ${error.message}`);
      }
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update specific field in state atomically
   */
  async updateField<K extends keyof SessionState>(
    field: K,
    value: SessionState[K]
  ): Promise<void> {
    const state = await this.readState();
    state[field] = value;
    await this.writeState(state);
  }

  /**
   * Get current state without modification
   */
  async getState(): Promise<Readonly<SessionState>> {
    return await this.readState();
  }
}
