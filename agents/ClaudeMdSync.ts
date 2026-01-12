import * as fs from 'fs';
import {
  mergeClaudeMdFiles,
  generateContinueRule,
  getContinueRulePath,
  ensureContinueRulesDir,
  MergeResult,
  ClaudeMdSources,
} from '../utils/claudeMd';
import { StateManager } from '../state/StateManager';

/**
 * State stored for CLAUDE.md sync tracking
 */
export interface ClaudeMdState {
  content: string;
  hash: string;
  lastSync: string; // ISO 8601 timestamp
  sources: ClaudeMdSources;
  continueRulePath: string;
}

/**
 * Result of a sync operation
 */
export interface ClaudeMdSyncResult {
  success: boolean;
  synced: boolean;
  message: string;
  state?: ClaudeMdState;
  error?: string;
}

/**
 * ClaudeMdSync Agent
 *
 * Responsibilities:
 * - Read and merge CLAUDE.md files from multiple locations
 * - Generate Continue.dev compatible rule files
 * - Track changes using SHA256 hashing to avoid unnecessary writes
 * - Store sync state in StateManager
 *
 * Integration:
 * - Called by SessionManager during initialization
 * - Triggered by Watcher agent on CLAUDE.md file changes
 */
export class ClaudeMdSync {
  private projectRoot: string;
  private stateManager: StateManager;
  private includeGlobal: boolean;
  private rulePrefix: string;

  constructor(
    projectRoot: string,
    stateManager: StateManager,
    options: {
      includeGlobal?: boolean;
      rulePrefix?: string;
    } = {}
  ) {
    this.projectRoot = projectRoot;
    this.stateManager = stateManager;
    this.includeGlobal = options.includeGlobal ?? true;
    this.rulePrefix = options.rulePrefix ?? '00-claude-md';
  }

  /**
   * Perform sync operation - reads, merges, and writes CLAUDE.md files
   *
   * Uses hash-based change detection to avoid unnecessary file writes.
   *
   * @returns Sync result with success status and metadata
   */
  async sync(): Promise<ClaudeMdSyncResult> {
    try {
      // Read and merge all CLAUDE.md files
      const mergeResult = await mergeClaudeMdFiles(
        this.projectRoot,
        this.includeGlobal
      );

      // Check if sync is needed
      const previousState = await this.getClaudeMdState();
      const needsUpdate = !previousState || previousState.hash !== mergeResult.hash;

      if (mergeResult.content.length === 0) {
        // No CLAUDE.md files found - remove rule file if it exists
        await this.removeRuleFile();
        await this.clearClaudeMdState();

        return {
          success: true,
          synced: false,
          message: 'No CLAUDE.md files found - rule file removed if existed',
        };
      }

      if (!needsUpdate) {
        return {
          success: true,
          synced: false,
          message: 'CLAUDE.md files unchanged - skipping sync',
          state: previousState,
        };
      }

      // Generate Continue.dev compatible rule content
      const ruleContent = generateContinueRule(mergeResult.content);

      // Write rule file
      await this.writeContinueRule(ruleContent);

      // Create and save state
      const newState: ClaudeMdState = {
        content: mergeResult.content,
        hash: mergeResult.hash,
        lastSync: new Date().toISOString(),
        sources: mergeResult.sources,
        continueRulePath: getContinueRulePath(this.projectRoot, this.rulePrefix),
      };

      await this.saveClaudeMdState(newState);

      return {
        success: true,
        synced: true,
        message: `CLAUDE.md synced successfully (${Object.keys(mergeResult.sources).length} sources)`,
        state: newState,
      };
    } catch (error: any) {
      return {
        success: false,
        synced: false,
        message: 'CLAUDE.md sync failed',
        error: error.message,
      };
    }
  }

  /**
   * Check if sync is needed without performing it
   *
   * @returns True if content has changed and needs sync
   */
  async needsSync(): Promise<boolean> {
    try {
      const mergeResult = await mergeClaudeMdFiles(
        this.projectRoot,
        this.includeGlobal
      );

      const previousState = await this.getClaudeMdState();

      if (mergeResult.content.length === 0) {
        // No content - sync needed only if we previously had a rule file
        return previousState !== null;
      }

      // Sync needed if no previous state or hash changed
      return !previousState || previousState.hash !== mergeResult.hash;
    } catch (error) {
      console.error('Error checking if sync needed:', error);
      return true; // Assume sync needed on error
    }
  }

  /**
   * Write Continue.dev rule file to .continue/rules/
   *
   * @param content - Rule content with YAML frontmatter
   */
  private async writeContinueRule(content: string): Promise<void> {
    ensureContinueRulesDir(this.projectRoot);
    const rulePath = getContinueRulePath(this.projectRoot, this.rulePrefix);

    fs.writeFileSync(rulePath, content, 'utf-8');
  }

  /**
   * Remove Continue.dev rule file if it exists
   */
  private async removeRuleFile(): Promise<void> {
    const rulePath = getContinueRulePath(this.projectRoot, this.rulePrefix);

    if (fs.existsSync(rulePath)) {
      fs.unlinkSync(rulePath);
      console.log(`Removed ${rulePath} (no CLAUDE.md found)`);
    }
  }

  /**
   * Get CLAUDE.md state from StateManager
   *
   * @returns Current CLAUDE.md state or null if not found
   */
  private async getClaudeMdState(): Promise<ClaudeMdState | null> {
    const state = await this.stateManager.getState();
    return (state.architectural_design.CLAUDE_md as ClaudeMdState) || null;
  }

  /**
   * Save CLAUDE.md state to StateManager
   *
   * @param claudeMdState - New state to save
   */
  private async saveClaudeMdState(claudeMdState: ClaudeMdState): Promise<void> {
    const state = await this.stateManager.getState();
    const newArchitecturalDesign = {
      ...state.architectural_design,
      CLAUDE_md: claudeMdState,
    };

    await this.stateManager.updateField('architectural_design', newArchitecturalDesign);
  }

  /**
   * Clear CLAUDE.md state from StateManager
   */
  private async clearClaudeMdState(): Promise<void> {
    const state = await this.stateManager.getState();
    const newArchitecturalDesign = { ...state.architectural_design };
    delete newArchitecturalDesign.CLAUDE_md;

    await this.stateManager.updateField('architectural_design', newArchitecturalDesign);
  }
}
