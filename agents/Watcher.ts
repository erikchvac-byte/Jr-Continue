import chokidar, { FSWatcher } from 'chokidar';
import { FileChangeEvent } from '../state/schemas';
import { StateManager } from '../state/StateManager';
import { promises as fs } from 'fs';

/**
 * Watcher (Agent 8)
 * READ-ONLY agent responsible for filesystem monitoring
 *
 * Responsibilities:
 * - Monitor project files for external changes
 * - Detect user edits, git pulls, dependency updates
 * - Alert system to changes requiring re-analysis
 * - Track file modification timestamps
 */
export class Watcher {
  private watchPath: string;
  private stateManager: StateManager;
  private watcher: FSWatcher | null = null;
  private callbacks: Array<(event: FileChangeEvent) => void> = [];
  private isRunning: boolean = false;

  constructor(watchPath: string, stateManager: StateManager) {
    this.watchPath = watchPath;
    this.stateManager = stateManager;
  }

  /**
   * Start filesystem monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('Watcher is already running');
      return;
    }

    this.watcher = chokidar.watch(this.watchPath, {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/state/**',
        '**/logs/**',
        '**/.git/**',
        '**/*.lock',
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500, // Wait 500ms for file to stabilize
        pollInterval: 100,
      },
      depth: 10, // Limit recursion depth
    });

    // Register event handlers
    this.watcher
      .on('add', (path) => this.handleEvent(path, 'created'))
      .on('change', (path) => this.handleEvent(path, 'modified'))
      .on('unlink', (path) => this.handleEvent(path, 'deleted'))
      .on('error', (error) => console.error(`Watcher error: ${error.message}`))
      .on('ready', () => {
        this.isRunning = true;
        console.log(`Watcher started monitoring: ${this.watchPath}`);
      });
  }

  /**
   * Stop filesystem monitoring
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      console.warn('Watcher is not running');
      return;
    }

    await this.watcher.close();
    this.watcher = null;
    this.isRunning = false;
    console.log('Watcher stopped');
  }

  /**
   * Register callback for file change events
   */
  onFileChange(callback: (event: FileChangeEvent) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Get file modification time
   */
  async getFileModificationTime(filePath: string): Promise<Date> {
    try {
      const stats = await fs.stat(filePath);
      return new Date(stats.mtime);
    } catch (error: any) {
      throw new Error(`Failed to get modification time for ${filePath}: ${error.message}`);
    }
  }

  /**
   * Check if watcher is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Handle file system events
   */
  private async handleEvent(
    filePath: string,
    eventType: 'created' | 'modified' | 'deleted'
  ): Promise<void> {
    const event: FileChangeEvent = {
      timestamp: new Date().toISOString(),
      path: filePath,
      event_type: eventType,
      detected_by: 'watcher',
    };

    // Notify registered callbacks
    this.callbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (error: any) {
        console.error(`Callback error: ${error.message}`);
      }
    });

    // Write notification to state (non-blocking)
    this.notifyStateManager(event).catch((error) => {
      console.error(`Failed to write change notification: ${error.message}`);
    });
  }

  /**
   * Write change notification to StateManager
   */
  private async notifyStateManager(event: FileChangeEvent): Promise<void> {
    try {
      const state = await this.stateManager.readState();

      // Add change notification to state
      // We'll extend SessionState to include a change_notifications array if needed
      // For now, we can log it or use architectural_design as a generic storage
      const notifications = (state.architectural_design.change_notifications as FileChangeEvent[]) || [];
      notifications.push(event);

      // Keep only last 100 notifications
      if (notifications.length > 100) {
        notifications.splice(0, notifications.length - 100);
      }

      state.architectural_design.change_notifications = notifications;
      await this.stateManager.writeState(state);
    } catch (error: any) {
      throw new Error(`Failed to notify state manager: ${error.message}`);
    }
  }
}
