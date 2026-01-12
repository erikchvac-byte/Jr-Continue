import { ClaudeMdSync } from '../agents/ClaudeMdSync';
import { StateManager } from '../state/StateManager';
import {
  mergeClaudeMdFiles,
  generateContinueRule,
  calculateContentHash,
  getContinueRulePath,
  ensureContinueRulesDir,
} from '../utils/claudeMd';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ClaudeMd Utilities', () => {
  const testProjectRoot = path.join(__dirname, 'test-project');
  const continueRulesDir = path.join(testProjectRoot, '.continue', 'rules');

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testProjectRoot)) {
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(testProjectRoot, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testProjectRoot)) {
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
  });

  describe('ensureContinueRulesDir', () => {
    it('should create .continue/rules directory if it does not exist', () => {
      const result = ensureContinueRulesDir(testProjectRoot);

      expect(fs.existsSync(result)).toBe(true);
      expect(result).toBe(continueRulesDir);
    });

    it('should not fail if directory already exists', () => {
      fs.mkdirSync(continueRulesDir, { recursive: true });

      const result = ensureContinueRulesDir(testProjectRoot);

      expect(fs.existsSync(result)).toBe(true);
      expect(result).toBe(continueRulesDir);
    });
  });

  describe('getContinueRulePath', () => {
    it('should return correct path with default prefix', () => {
      const result = getContinueRulePath(testProjectRoot);

      expect(result).toBe(path.join(continueRulesDir, '00-claude-md.md'));
    });

    it('should return correct path with custom prefix', () => {
      const result = getContinueRulePath(testProjectRoot, 'custom-prefix');

      expect(result).toBe(path.join(continueRulesDir, 'custom-prefix.md'));
    });
  });

  describe('calculateContentHash', () => {
    it('should generate consistent SHA256 hash for same content', () => {
      const content = 'Test content';
      const hash1 = calculateContentHash(content);
      const hash2 = calculateContentHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 produces 64 hex chars
    });

    it('should generate different hashes for different content', () => {
      const content1 = 'Test content 1';
      const content2 = 'Test content 2';

      const hash1 = calculateContentHash(content1);
      const hash2 = calculateContentHash(content2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateContinueRule', () => {
    it('should add YAML frontmatter to content', () => {
      const content = 'Test rules content';
      const result = generateContinueRule(content);

      expect(result).toContain('---');
      expect(result).toContain('name: CLAUDE.md Project Rules');
      expect(result).toContain('alwaysApply: true');
      expect(result).toContain('description: Auto-synced rules from CLAUDE.md files');
      expect(result).toContain(content);
    });
  });

  describe('mergeClaudeMdFiles', () => {
    it('should return empty content when no CLAUDE.md files exist', async () => {
      const result = await mergeClaudeMdFiles(testProjectRoot, false);

      expect(result.content).toBe('');
      expect(result.sources).toEqual({});
    });

    it('should merge project CLAUDE.md file', async () => {
      const claudeMdContent = '# Project Rules\nTest rule 1';
      fs.writeFileSync(path.join(testProjectRoot, 'CLAUDE.md'), claudeMdContent);

      const result = await mergeClaudeMdFiles(testProjectRoot, false);

      expect(result.content).toContain('# Project CLAUDE.md Rules');
      expect(result.content).toContain(claudeMdContent);
      expect(result.sources.project).toBeDefined();
    });

    it('should merge CLAUDE.local.md file', async () => {
      const localContent = '# Local Rules\nTest local rule';
      fs.writeFileSync(path.join(testProjectRoot, 'CLAUDE.local.md'), localContent);

      const result = await mergeClaudeMdFiles(testProjectRoot, false);

      expect(result.content).toContain('# Local CLAUDE.md Rules');
      expect(result.content).toContain(localContent);
      expect(result.sources.local).toBeDefined();
    });

    it('should merge .claude/instructions.md file', async () => {
      const instructionsDir = path.join(testProjectRoot, '.claude');
      fs.mkdirSync(instructionsDir, { recursive: true });

      const instructionsContent = '# Instructions\nTest instructions';
      fs.writeFileSync(path.join(instructionsDir, 'instructions.md'), instructionsContent);

      const result = await mergeClaudeMdFiles(testProjectRoot, false);

      expect(result.content).toContain('# Claude Instructions');
      expect(result.content).toContain(instructionsContent);
      expect(result.sources.instructions).toBeDefined();
    });

    it('should merge multiple CLAUDE.md files in correct order', async () => {
      // Create all file types
      fs.writeFileSync(path.join(testProjectRoot, 'CLAUDE.md'), 'Project rules');
      fs.writeFileSync(path.join(testProjectRoot, 'CLAUDE.local.md'), 'Local rules');

      const instructionsDir = path.join(testProjectRoot, '.claude');
      fs.mkdirSync(instructionsDir, { recursive: true });
      fs.writeFileSync(path.join(instructionsDir, 'instructions.md'), 'Instructions');

      const result = await mergeClaudeMdFiles(testProjectRoot, false);

      // Check order: project -> local -> instructions
      const projectIndex = result.content.indexOf('# Project CLAUDE.md Rules');
      const localIndex = result.content.indexOf('# Local CLAUDE.md Rules');
      const instructionsIndex = result.content.indexOf('# Claude Instructions');

      expect(projectIndex).toBeLessThan(localIndex);
      expect(localIndex).toBeLessThan(instructionsIndex);
    });

    it('should separate sections with dividers', async () => {
      fs.writeFileSync(path.join(testProjectRoot, 'CLAUDE.md'), 'Project');
      fs.writeFileSync(path.join(testProjectRoot, 'CLAUDE.local.md'), 'Local');

      const result = await mergeClaudeMdFiles(testProjectRoot, false);

      expect(result.content).toContain('---');
    });
  });
});

describe('ClaudeMdSync Agent', () => {
  const testProjectRoot = path.join(__dirname, 'test-sync-project');
  const stateFilePath = path.join(testProjectRoot, 'state', 'session_state.json');
  let stateManager: StateManager;
  let claudeMdSync: ClaudeMdSync;

  beforeEach(async () => {
    // Clean up and create test directories
    if (fs.existsSync(testProjectRoot)) {
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(testProjectRoot, { recursive: true });

    // Initialize state manager
    stateManager = new StateManager(stateFilePath);
    await stateManager.initialize();

    // Create ClaudeMdSync instance
    claudeMdSync = new ClaudeMdSync(testProjectRoot, stateManager);
  });

  afterEach(async () => {
    // Clean up test directory
    if (fs.existsSync(testProjectRoot)) {
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
  });

  describe('sync', () => {
    it('should return success with no files found message when no CLAUDE.md files exist', async () => {
      const result = await claudeMdSync.sync();

      expect(result.success).toBe(true);
      expect(result.synced).toBe(false);
      expect(result.message).toContain('No CLAUDE.md files found');
    });

    it('should sync CLAUDE.md file and write Continue rule', async () => {
      const claudeMdContent = '# Test Rules\nRule content';
      fs.writeFileSync(path.join(testProjectRoot, 'CLAUDE.md'), claudeMdContent);

      const result = await claudeMdSync.sync();

      expect(result.success).toBe(true);
      expect(result.synced).toBe(true);
      expect(result.message).toContain('synced successfully');

      // Verify rule file was created
      const rulePath = getContinueRulePath(testProjectRoot);
      expect(fs.existsSync(rulePath)).toBe(true);

      // Verify rule content
      const ruleContent = fs.readFileSync(rulePath, 'utf-8');
      expect(ruleContent).toContain('name: CLAUDE.md Project Rules');
      expect(ruleContent).toContain(claudeMdContent);
    });

    it('should store state in StateManager', async () => {
      const claudeMdContent = '# Test Rules';
      fs.writeFileSync(path.join(testProjectRoot, 'CLAUDE.md'), claudeMdContent);

      const result = await claudeMdSync.sync();

      expect(result.state).toBeDefined();
      expect(result.state?.hash).toBeDefined();
      expect(result.state?.lastSync).toBeDefined();
      expect(result.state?.sources.project).toBeDefined();

      // Verify state was persisted
      const state = await stateManager.getState();
      expect(state.architectural_design.CLAUDE_md).toBeDefined();
    });

    it('should skip sync when content has not changed', async () => {
      const claudeMdContent = '# Test Rules';
      fs.writeFileSync(path.join(testProjectRoot, 'CLAUDE.md'), claudeMdContent);

      // First sync
      const result1 = await claudeMdSync.sync();
      expect(result1.synced).toBe(true);

      // Second sync with same content
      const result2 = await claudeMdSync.sync();
      expect(result2.success).toBe(true);
      expect(result2.synced).toBe(false);
      expect(result2.message).toContain('unchanged');
    });

    it('should re-sync when content changes', async () => {
      const claudeMdPath = path.join(testProjectRoot, 'CLAUDE.md');

      // First sync
      fs.writeFileSync(claudeMdPath, '# Version 1');
      const result1 = await claudeMdSync.sync();
      const hash1 = result1.state?.hash;

      // Modify content
      fs.writeFileSync(claudeMdPath, '# Version 2');

      // Second sync
      const result2 = await claudeMdSync.sync();
      const hash2 = result2.state?.hash;

      expect(result2.synced).toBe(true);
      expect(hash1).not.toBe(hash2);
    });

    it('should remove rule file when all CLAUDE.md files are deleted', async () => {
      const claudeMdPath = path.join(testProjectRoot, 'CLAUDE.md');
      const rulePath = getContinueRulePath(testProjectRoot);

      // Create and sync
      fs.writeFileSync(claudeMdPath, '# Test');
      await claudeMdSync.sync();
      expect(fs.existsSync(rulePath)).toBe(true);

      // Delete CLAUDE.md
      fs.unlinkSync(claudeMdPath);

      // Sync again
      const result = await claudeMdSync.sync();

      expect(result.success).toBe(true);
      expect(fs.existsSync(rulePath)).toBe(false);
    });
  });

  describe('needsSync', () => {
    it('should return true when no previous sync exists', async () => {
      fs.writeFileSync(path.join(testProjectRoot, 'CLAUDE.md'), '# Test');

      const needsSync = await claudeMdSync.needsSync();

      expect(needsSync).toBe(true);
    });

    it('should return false when content has not changed', async () => {
      fs.writeFileSync(path.join(testProjectRoot, 'CLAUDE.md'), '# Test');

      await claudeMdSync.sync();
      const needsSync = await claudeMdSync.needsSync();

      expect(needsSync).toBe(false);
    });

    it('should return true when content has changed', async () => {
      const claudeMdPath = path.join(testProjectRoot, 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, '# Version 1');

      await claudeMdSync.sync();

      // Change content
      fs.writeFileSync(claudeMdPath, '# Version 2');

      const needsSync = await claudeMdSync.needsSync();

      expect(needsSync).toBe(true);
    });
  });
});
