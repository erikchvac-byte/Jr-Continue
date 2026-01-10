/**
 * Claude-Specialist (Agent 3) - VS Code Only
 * Deep reasoning for complex tasks using Task tool
 *
 * EXECUTION:
 * - Uses Task tool to spawn claude-specialist sub-agents
 * - Runs exclusively in Claude Code / VS Code environment
 * - NO API calls, NO simulation, NO fallbacks
 * - Real execution only
 */

import { StateManager } from '../state/StateManager';
import { Logger } from './Logger';
import { ExecutionResult, GeneratedFile } from '../state/schemas';
import { parseFilePathFromTask, isPathSafe } from '../utils/filePathParser';

export class ClaudeSpecialist {
  private logger: Logger;
  private workingDir: string;

  constructor(_stateManager: StateManager, logger: Logger, workingDir: string = process.cwd()) {
    this.logger = logger;
    this.workingDir = workingDir;

    // Verify Task tool is available
    if (typeof (globalThis as any).Task !== 'function') {
      console.warn(
        '[ClaudeSpecialist] WARNING: Task tool not available. ClaudeSpecialist requires VS Code/Claude Code environment.'
      );
    } else {
      console.log('[ClaudeSpecialist] Initialized with Task tool');
    }
  }

  /**
   * Execute a complex task using Task tool
   * @param task Task description
   * @returns Execution result
   */
  async execute(task: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Parse target file path from task
      const fileInfo = parseFilePathFromTask(task, this.workingDir);

      // Get Task function from global scope
      const TaskFn = (globalThis as any).Task;

      if (typeof TaskFn !== 'function') {
        throw new Error(
          'Task tool not available. ClaudeSpecialist requires Claude Code / VS Code environment.'
        );
      }

      // Construct enhanced prompt with file writing instructions
      const prompt = `Generate production-ready TypeScript code for the following task:

${task}

${fileInfo.targetPath ? `Target file: ${fileInfo.targetPath}` : 'Generate code without writing to disk yet.'}

Requirements:
- Use TypeScript strict mode
- Include comprehensive error handling
- Follow security best practices (input validation, sanitization)
- Add clear documentation with JSDoc comments
- Implement proper type safety
- Use modern TypeScript features (async/await, destructuring, etc.)
- Include input validation where appropriate
- Handle edge cases

${fileInfo.targetPath && fileInfo.confidence !== 'low' ? `
IMPORTANT: You have access to Write and Edit tools. After generating the code:
1. Write the code to ${fileInfo.targetPath} using the Write tool
2. Ensure proper directory structure exists
3. Include the file path in your response
` : ''}

Return the code implementation with comments.`;

      // Spawn a claude-specialist sub-agent for code generation
      const result = await TaskFn({
        subagent_type: 'claude-specialist',
        prompt,
        description: 'Generate and write code for complex task',
        model: 'sonnet', // Use Sonnet for deep reasoning
      });

      const output = result.output || result.toString();

      // Parse generated files from result
      const generatedFiles: GeneratedFile[] = [];

      // If file path was provided and confidence is high, record it
      if (fileInfo.targetPath && fileInfo.confidence === 'high' && isPathSafe(fileInfo.targetPath, this.workingDir)) {
        generatedFiles.push({
          path: fileInfo.targetPath,
          content: output,
          operation: fileInfo.operation,
          timestamp: new Date().toISOString(),
        });
      }

      return {
        success: true,
        output,
        duration_ms: Date.now() - startTime,
        generatedFiles,
        targetPath: fileInfo.targetPath || undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await this.logger.logFailure({
        timestamp: new Date().toISOString(),
        agent: 'claude-specialist',
        error: errorMessage,
        task,
        retry_count: 0,
      });

      return {
        success: false,
        output: '',
        error: errorMessage,
        duration_ms: Date.now() - startTime,
      };
    }
  }
}
