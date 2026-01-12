import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

/**
 * Locations where CLAUDE.md files can be found, in priority order
 */
export interface ClaudeMdSources {
  global?: string;
  project?: string;
  local?: string;
  instructions?: string;
}

/**
 * Result of merging CLAUDE.md files
 */
export interface MergeResult {
  content: string;
  sources: ClaudeMdSources;
  hash: string;
}

/**
 * Reads and merges CLAUDE.md files from all possible locations.
 * Merge order (priority):
 * 1. ~/.claude/CLAUDE.md (global rules)
 * 2. ./CLAUDE.md (project rules)
 * 3. ./CLAUDE.local.md (local/personal rules)
 * 4. ./.claude/instructions.md (modern convention)
 *
 * @param projectRoot - Root directory of the project
 * @param includeGlobal - Whether to include global ~/.claude/CLAUDE.md
 * @returns Merged content with section headers and metadata
 */
export async function mergeClaudeMdFiles(
  projectRoot: string,
  includeGlobal: boolean = true
): Promise<MergeResult> {
  const claudeContent: string[] = [];
  const sources: ClaudeMdSources = {};

  // 1. Global ~/.claude/CLAUDE.md
  if (includeGlobal) {
    const globalClaudeMd = path.join(os.homedir(), '.claude', 'CLAUDE.md');
    if (fs.existsSync(globalClaudeMd)) {
      try {
        const content = fs.readFileSync(globalClaudeMd, 'utf-8');
        claudeContent.push(`# Global CLAUDE.md Rules\n\n${content}`);
        sources.global = globalClaudeMd;
      } catch (error) {
        console.error(`Failed to read global CLAUDE.md: ${error}`);
      }
    }
  }

  // 2. Workspace root CLAUDE.md
  const workspaceClaudeMd = path.join(projectRoot, 'CLAUDE.md');
  if (fs.existsSync(workspaceClaudeMd)) {
    try {
      const content = fs.readFileSync(workspaceClaudeMd, 'utf-8');
      claudeContent.push(`# Project CLAUDE.md Rules\n\n${content}`);
      sources.project = workspaceClaudeMd;
    } catch (error) {
      console.error(`Failed to read workspace CLAUDE.md: ${error}`);
    }
  }

  // 3. CLAUDE.local.md (local/personal rules)
  const localClaudeMd = path.join(projectRoot, 'CLAUDE.local.md');
  if (fs.existsSync(localClaudeMd)) {
    try {
      const content = fs.readFileSync(localClaudeMd, 'utf-8');
      claudeContent.push(`# Local CLAUDE.md Rules\n\n${content}`);
      sources.local = localClaudeMd;
    } catch (error) {
      console.error(`Failed to read CLAUDE.local.md: ${error}`);
    }
  }

  // 4. .claude/instructions.md (modern convention)
  const claudeInstructions = path.join(projectRoot, '.claude', 'instructions.md');
  if (fs.existsSync(claudeInstructions)) {
    try {
      const content = fs.readFileSync(claudeInstructions, 'utf-8');
      claudeContent.push(`# Claude Instructions\n\n${content}`);
      sources.instructions = claudeInstructions;
    } catch (error) {
      console.error(`Failed to read .claude/instructions.md: ${error}`);
    }
  }

  // Merge all content with separators
  const mergedContent = claudeContent.join('\n\n---\n\n');
  const hash = calculateContentHash(mergedContent);

  return {
    content: mergedContent,
    sources,
    hash,
  };
}

/**
 * Generates a Continue.dev compatible rule file with YAML frontmatter
 *
 * @param content - Merged CLAUDE.md content
 * @returns Formatted rule content with YAML frontmatter
 */
export function generateContinueRule(content: string): string {
  return `---
name: CLAUDE.md Project Rules
alwaysApply: true
description: Auto-synced rules from CLAUDE.md files (Claude Code compatibility)
---

${content}
`;
}

/**
 * Calculates SHA256 hash of content for change detection
 *
 * @param content - Content to hash
 * @returns SHA256 hash as hex string
 */
export function calculateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Ensures the .continue/rules directory exists
 *
 * @param projectRoot - Root directory of the project
 * @returns Path to .continue/rules directory
 */
export function ensureContinueRulesDir(projectRoot: string): string {
  const continueRulesPath = path.join(projectRoot, '.continue', 'rules');

  if (!fs.existsSync(continueRulesPath)) {
    fs.mkdirSync(continueRulesPath, { recursive: true });
  }

  return continueRulesPath;
}

/**
 * Gets the path to the Continue.dev rule file
 *
 * @param projectRoot - Root directory of the project
 * @param rulePrefix - Prefix for the rule file (default: '00-claude-md')
 * @returns Full path to the rule file
 */
export function getContinueRulePath(
  projectRoot: string,
  rulePrefix: string = '00-claude-md'
): string {
  const continueRulesPath = ensureContinueRulesDir(projectRoot);
  return path.join(continueRulesPath, `${rulePrefix}.md`);
}
