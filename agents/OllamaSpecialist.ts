/**
 * Ollama-Specialist (Agent 2) - Production Version
 * Fast local execution for simple tasks
 *
 * IMPLEMENTATION:
 * - Executes simple code generation tasks
 * - Uses local Ollama via MCP (free, fast)
 * - Returns generated code
 * - FAILS HARD if MCP unavailable - NO FALLBACKS
 */

import { StateManager } from '../state/StateManager';
import { Logger } from './Logger';
import { ExecutionResult, GeneratedFile } from '../state/schemas';
import { parseFilePathFromTask, isPathSafe } from '../utils/filePathParser';
import { verifyOllamaResponse, verifySyntax, verifyFileIntegrity } from '../utils/verificationGates';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Type definition for MCP Ollama query function
// This is a placeholder - in runtime, Claude Code provides this via MCP
// Note: This is accessed via globalThis when available, not directly called
// declare function mcp__ollama_local__ollama_query(params: {
//   model: string;
//   prompt: string;
//   system_prompt?: string;
//   temperature?: number;
//   max_tokens?: number;
//   inject_api_context?: boolean;
//   context_files?: string[];
// }): Promise<{ response: string }>;

export class OllamaSpecialist {
  private stateManager: StateManager;
  private logger: Logger;
  private ollamaAvailable: boolean = false;
  private model: string;
  private useMCP: boolean = true; // Flag to toggle MCP usage
  private workingDir: string;

  constructor(stateManager: StateManager, logger: Logger, useMCP: boolean = true, workingDir: string = process.cwd()) {
    this.stateManager = stateManager;
    this.logger = logger;
    this.useMCP = useMCP;
    this.workingDir = workingDir;
    this.model = process.env.OLLAMA_MODEL || 'qwen3-coder:30b';
  }

  /**
   * Check if Ollama is available via MCP or direct HTTP
   */
  async checkAvailability(): Promise<boolean> {
    // Check MCP availability (when running in Claude Code)
    if (this.useMCP && typeof (globalThis as any).mcp__ollama_local__ollama_query === 'function') {
      this.ollamaAvailable = true;
      return true;
    }

    // Check direct HTTP availability (when running in MCP server or standalone)
    try {
      const ollamaURL = process.env.OLLAMA_URL || 'http://localhost:11434';
      const response = await fetch(`${ollamaURL}/api/tags`, {
        method: 'GET',
      });

      if (response.ok) {
        this.ollamaAvailable = true;
        return true;
      }
    } catch (error) {
      // Ollama not available via HTTP
    }

    this.ollamaAvailable = false;
    return false;
  }

  /**
   * Execute a simple task using Ollama
   * @param task Task description
   * @returns Execution result
   */
  async execute(task: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Check availability
      if (!this.ollamaAvailable) {
        await this.checkAvailability();
      }

      if (!this.ollamaAvailable) {
        throw new Error('Ollama is not available');
      }

      // Parse target file path from task
      const fileInfo = parseFilePathFromTask(task, this.workingDir);

      // Call real Ollama via MCP - FAILS if unavailable
      const output = await this.executeWithOllama(task);

      // GATE 1: Validate Ollama response quality
      const responseCheck = await verifyOllamaResponse(output, Date.now() - startTime);
      if (!responseCheck.passed) {
        throw new Error(`Gate-1 failed: ${responseCheck.error}`);
      }

      // Write files if path was provided with high confidence
      const generatedFiles: GeneratedFile[] = [];

      if (fileInfo.targetPath && fileInfo.confidence === 'high' && isPathSafe(fileInfo.targetPath, this.workingDir)) {
        try {
          // GATE 2: Validate syntax before writing
          const syntaxCheck = await verifySyntax(output, 'typescript');
          if (!syntaxCheck.passed) {
            throw new Error(`Gate-2 failed: ${syntaxCheck.error}`);
          }

          // Ensure directory exists
          const dir = path.dirname(fileInfo.targetPath);
          await fs.mkdir(dir, { recursive: true });

          // Write file atomically (same pattern as StateManager)
          const tempPath = fileInfo.targetPath + '.tmp';
          await fs.writeFile(tempPath, output, 'utf8');
          await fs.rename(tempPath, fileInfo.targetPath);

          // GATE 3: Verify file integrity after write
          const integrityCheck = await verifyFileIntegrity(fileInfo.targetPath);
          if (!integrityCheck.passed) {
            // Rollback - delete the file
            await fs.unlink(fileInfo.targetPath);
            throw new Error(`Gate-3 failed: ${integrityCheck.error}`);
          }

          generatedFiles.push({
            path: fileInfo.targetPath,
            content: output,
            operation: fileInfo.operation,
            timestamp: new Date().toISOString(),
          });

          console.log(`[Jr] ✓ File written and verified: ${fileInfo.targetPath}`);
        } catch (writeError) {
          console.error(`[Jr] ✗ File write failed:`, writeError);
          // Fail the task if gate verification fails
          throw writeError;
        }
      }

      const result: ExecutionResult = {
        success: true,
        output,
        duration_ms: Date.now() - startTime,
        generatedFiles,
        targetPath: fileInfo.targetPath || undefined,
      };

      // Update state
      const state = await this.stateManager.readState();
      state.assigned_agent = 'ollama-specialist';
      await this.stateManager.writeState(state);

      // Log the execution
      await this.logger.logAgentActivity({
        timestamp: new Date().toISOString(),
        agent: 'ollama-specialist',
        action: 'execute_task',
        input: { task },
        output: result,
        duration_ms: result.duration_ms,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.logger.logFailure({
        timestamp: new Date().toISOString(),
        agent: 'ollama-specialist',
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

  /**
   * Execute task with Ollama - Uses MCP if available, otherwise direct HTTP
   */
  private async executeWithOllama(task: string): Promise<string> {
    const systemPrompt = `You are a code generation assistant. Generate clean, well-documented TypeScript code.
Focus on:
- Type safety (use TypeScript strict mode)
- Clear function signatures
- Minimal, focused implementations
- No over-engineering

Return ONLY the code, no explanations unless asked.`;

    // Try MCP first (when running in Claude Code)
    if (this.useMCP && typeof (globalThis as any).mcp__ollama_local__ollama_query === 'function') {
      const mcpFunction = (globalThis as any).mcp__ollama_local__ollama_query;
      const response = await mcpFunction({
        model: this.model,
        prompt: task,
        system_prompt: systemPrompt,
        temperature: 0.3,
        max_tokens: 1000,
      });
      const rawOutput = response.response || response.toString();
      return this.stripMarkdownFences(rawOutput);
    }

    // Fallback to direct HTTP (when running in MCP server process)
    return await this.executeWithDirectHTTP(task, systemPrompt);
  }

  /**
   * Execute task with Ollama via direct HTTP API
   * Used when MCP tools aren't available (e.g., running in MCP server process)
   */
  private async executeWithDirectHTTP(task: string, systemPrompt: string): Promise<string> {
    const ollamaURL = process.env.OLLAMA_URL || 'http://localhost:11434';

    // GATE 10: Ollama timeout detection
    const timeoutMs = parseInt(process.env.JR_OLLAMA_TIMEOUT || '60000', 10);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${ollamaURL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: `${systemPrompt}\n\nTask: ${task}`,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 1000,
          },
        }),
        signal: controller.signal, // Add abort signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Ollama HTTP API error: ${response.statusText}`);
      }

      const data = await response.json() as { response: string };
      return this.stripMarkdownFences(data.response);
    } catch (error: any) {
      clearTimeout(timeout);

      // Check if error was due to timeout
      if (error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${timeoutMs}ms - check if Ollama server is responsive`);
      }

      throw error;
    }
  }

  /**
   * INTENT: Strip markdown code fences from Ollama output
   * WHY: Ollama sometimes wraps code in ```language...``` blocks
   */
  private stripMarkdownFences(text: string): string {
    // Remove opening fence with optional language identifier
    let cleaned = text.replace(/^```[\w]*\n/gm, '');
    // Remove closing fence
    cleaned = cleaned.replace(/\n```$/gm, '');
    return cleaned.trim();
  }
}
