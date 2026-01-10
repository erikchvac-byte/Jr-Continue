/**
 * MVP Pipeline - End-to-End Task Execution
 *
 * Flow: User Task → Router → Meta-Coordinator → Ollama → Logger
 *
 * This is the minimal viable system that proves the concept works.
 */

import { StateManager } from './state/StateManager';
import { Logger } from './agents/Logger';
import { SessionManager } from './agents/SessionManager';
import { Router } from './agents/Router';
import { MetaCoordinator } from './agents/MetaCoordinator';
import { OllamaSpecialist } from './agents/OllamaSpecialist';
import { ClaudeSpecialist } from './agents/ClaudeSpecialist';
import { Critic } from './agents/Critic';
import { Architect } from './agents/Architect';
import { RepairAgent } from './agents/RepairAgent';
import { LogicArchivist } from './agents/LogicArchivist';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface PipelineResult {
  success: boolean;
  task: string;
  complexity: string;
  assignedAgent: string;
  output: string;
  error?: string;
  totalDuration: number;
  architecturalGuidance?: {
    projectType: string;
    recommendedPaths: number;
    style: string;
  };
  review?: {
    verdict: string;
    issues: number;
    summary: string;
  };
  filesWritten?: string[];
  repairAttempts?: number;
  documentation?: {
    functionsDocumented: number;
    commentsAdded: number;
    darkCodeFixed: number;
  };
}

export class Pipeline {
  private stateManager: StateManager;
  private logger: Logger;
  private sessionManager: SessionManager;
  private router: Router;
  private metaCoordinator: MetaCoordinator;
  private ollamaSpecialist: OllamaSpecialist;
  private claudeSpecialist: ClaudeSpecialist;
  private critic: Critic;
  private architect: Architect;
  private repairAgent: RepairAgent;
  private logicArchivist: LogicArchivist;
  private enableCritic: boolean;
  private enableArchitect: boolean;
  private enableDocumentation: boolean;
  private maxRepairAttempts: number = 3;

  constructor(
    workingDir: string = process.cwd(),
    useMCP: boolean = true,
    enableCritic: boolean = true,
    enableArchitect: boolean = true,
    enableDocumentation: boolean = true
  ) {

    // Initialize infrastructure
    this.stateManager = new StateManager(
      path.join(workingDir, 'state', 'session_state.json')
    );
    this.logger = new Logger(path.join(workingDir, 'logs'));
    this.sessionManager = new SessionManager(
      path.join(workingDir, 'state', 'session_summary.json'),
      this.stateManager
    );

    // Initialize agents
    this.router = new Router(this.stateManager, this.logger);
    this.metaCoordinator = new MetaCoordinator(this.stateManager, this.logger);
    this.ollamaSpecialist = new OllamaSpecialist(
      this.stateManager,
      this.logger,
      useMCP,
      workingDir
    );
    this.claudeSpecialist = new ClaudeSpecialist(
      this.stateManager,
      this.logger,
      workingDir
    );
    this.critic = new Critic(this.stateManager);
    this.architect = new Architect(workingDir, this.stateManager);
    this.repairAgent = new RepairAgent(this.stateManager, this.logger, workingDir);
    this.logicArchivist = new LogicArchivist();
    this.enableCritic = enableCritic;
    this.enableArchitect = enableArchitect;
    this.enableDocumentation = enableDocumentation;
  }

  /**
   * Execute a task through the complete pipeline
   * @param task Task description
   * @param forceAgent Optional parameter to force routing to a specific agent
   * @returns Pipeline result
   */
  async executeTask(
    task: string,
    forceAgent?: 'ollama-specialist' | 'claude-specialist'
  ): Promise<PipelineResult> {
    const startTime = Date.now();

    try {
      // Step 1: Start session
      const session = await this.sessionManager.initialize();
      console.log(`[Jr] Session started: ${session.session_id}`);

      // Step 2: Router analyzes complexity
      console.log(`[Jr] Routing task: "${task}"`);
      const complexityAnalysis = await this.router.analyzeComplexity(task);
      console.log(
        `[Jr] Complexity: ${complexityAnalysis.complexity} (score: ${complexityAnalysis.score})`
      );

      // Step 3: Architect analyzes project structure (if enabled and complex task)
      let architecturalDesign;
      if (this.enableArchitect && complexityAnalysis.complexity === 'complex') {
        console.log('[Jr] Analyzing project architecture...');
        architecturalDesign = await this.architect.analyzeProject();
        console.log(
          `[Jr] Architecture: ${architecturalDesign.projectType} (${architecturalDesign.architecturalStyle})`
        );
      }

      // Step 4: Meta-Coordinator routes to execution agent
      const routingDecision = await this.metaCoordinator.route(
        task,
        complexityAnalysis.complexity,
        forceAgent
      );
      console.log(
        `[Jr] Routed to: ${routingDecision.targetAgent} (${routingDecision.reason})`
      );
      if (routingDecision.tokenBudgetStatus) {
        console.log(
          `[Jr] Token budget: ${routingDecision.tokenBudgetStatus.used}/${routingDecision.tokenBudgetStatus.used + routingDecision.tokenBudgetStatus.remaining} (${routingDecision.tokenBudgetStatus.remaining} remaining)`
        );
      }

      // Step 5: Execute with appropriate agent
      let executionResult;

      if (routingDecision.targetAgent === 'ollama-specialist') {
        executionResult = await this.ollamaSpecialist.execute(task);
      } else if (routingDecision.targetAgent === 'claude-specialist') {
        executionResult = await this.claudeSpecialist.execute(task);
      } else {
        // Fallback to Ollama for unknown agents
        console.log(
          `[Jr] Unknown agent ${routingDecision.targetAgent}, falling back to Ollama`
        );
        executionResult = await this.ollamaSpecialist.execute(task);
      }

      // If execution failed, return early
      if (!executionResult.success) {
        await this.sessionManager.addIncompleteTask(task);
        return {
          success: false,
          task,
          complexity: complexityAnalysis.complexity,
          assignedAgent: routingDecision.targetAgent,
          output: executionResult.output,
          error: executionResult.error,
          totalDuration: Date.now() - startTime,
        };
      }

      // Step 6: Prepare for Critic review
      // BUG-004 FIX: Populate filesWritten BEFORE Critic review so cleanup works on rejection
      let reviewResult;
      let repairAttempts = 0;
      let currentCode = executionResult.output;
      let currentFilePath = executionResult.targetPath || 'generated_code.ts';
      const filesWritten: string[] = [];

      // Add generated files to tracking array immediately after successful execution
      if (executionResult.generatedFiles && executionResult.generatedFiles.length > 0) {
        for (const file of executionResult.generatedFiles) {
          filesWritten.push(file.path);
        }
      }

      while (repairAttempts <= this.maxRepairAttempts) {
        // Review code with Critic (if enabled)
        if (this.enableCritic) {
          console.log(`[Jr] Reviewing code with Critic (attempt ${repairAttempts + 1})...`);

          const codeDiff = [
            {
              file: currentFilePath,
              additions: currentCode.split('\n'),
              deletions: [],
              context: task,
            },
          ];

          reviewResult = await this.critic.reviewCode(codeDiff, task);
          console.log(
            `[Jr] Critic verdict: ${reviewResult.verdict} (${reviewResult.issues.length} issues)`
          );

          // Update state with current repair attempt
          await this.stateManager.updateField('repair_attempts', repairAttempts);
          await this.stateManager.updateField('review_verdict', reviewResult.verdict);

          // Handle verdict
          if (reviewResult.verdict === 'approved') {
            // SUCCESS: Files were already added to filesWritten array before review (line 185-189)
            // Update state with written files
            await this.stateManager.updateField('generated_files', filesWritten);

            console.log(`[Jr] Code approved. Files written: ${filesWritten.length > 0 ? filesWritten.join(', ') : 'none'}`);

            // Step 6.5: Document code with Logic Archivist (if enabled and complexity > 60 or code complexity > 5)
            if (this.enableDocumentation && (complexityAnalysis.score > 60 || this.calculateCodeComplexity(currentCode) > 5)) {
              console.log('[Jr] Documenting code with Logic Archivist...');

              const language = this.detectLanguage(currentFilePath);
              const docResult = await this.logicArchivist.documentCode(
                currentCode,
                currentFilePath,
                language,
                {
                  taskComplexity: complexityAnalysis.score,
                  codeComplexity: this.calculateCodeComplexity(currentCode)
                }
              );

              // Update code with documentation
              currentCode = docResult.documentedCode;

              // Write documented code to file if files were written
              if (filesWritten.length > 0) {
                await fs.writeFile(currentFilePath, docResult.documentedCode, 'utf-8');
                console.log(`[Jr] Documentation added: ${docResult.metrics.functionsDocumented} functions, ${docResult.metrics.commentsAdded} new comments`);
              }
            }

            break;
          } else if (reviewResult.verdict === 'rejected') {
            // FAILURE: Clean up any files that were written
            console.error(`[Jr] Code rejected: ${reviewResult.summary}`);
            await this.cleanupFiles(filesWritten);

            await this.sessionManager.addIncompleteTask(task);
            return {
              success: false,
              task,
              complexity: complexityAnalysis.complexity,
              assignedAgent: routingDecision.targetAgent,
              output: currentCode,
              error: `Code rejected by Critic: ${reviewResult.summary}`,
              totalDuration: Date.now() - startTime,
              review: {
                verdict: reviewResult.verdict,
                issues: reviewResult.issues.length,
                summary: reviewResult.summary,
              },
              repairAttempts,
            };
          } else if (reviewResult.verdict === 'needs_repair') {
            // REPAIR: Attempt to fix issues
            if (repairAttempts >= this.maxRepairAttempts) {
              console.error(`[Jr] Max repair attempts (${this.maxRepairAttempts}) exceeded`);
              await this.cleanupFiles(filesWritten);

              await this.sessionManager.addIncompleteTask(task);
              return {
                success: false,
                task,
                complexity: complexityAnalysis.complexity,
                assignedAgent: routingDecision.targetAgent,
                output: currentCode,
                error: `Max repair attempts exceeded. Last issues: ${reviewResult.summary}`,
                totalDuration: Date.now() - startTime,
                review: {
                  verdict: reviewResult.verdict,
                  issues: reviewResult.issues.length,
                  summary: reviewResult.summary,
                },
                repairAttempts,
              };
            }

            console.log(`[Jr] Attempting repair (attempt ${repairAttempts + 1})...`);

            const repairResult = await this.repairAgent.repair(
              reviewResult,
              currentCode,
              currentFilePath
            );

            if (!repairResult.success) {
              console.error(`[Jr] Repair failed: ${repairResult.error}`);
              await this.cleanupFiles(filesWritten);

              await this.sessionManager.addIncompleteTask(task);
              return {
                success: false,
                task,
                complexity: complexityAnalysis.complexity,
                assignedAgent: routingDecision.targetAgent,
                output: currentCode,
                error: `Repair failed: ${repairResult.error}`,
                totalDuration: Date.now() - startTime,
                review: {
                  verdict: reviewResult.verdict,
                  issues: reviewResult.issues.length,
                  summary: reviewResult.summary,
                },
                repairAttempts: repairAttempts + 1,
              };
            }

            // Update code for next iteration
            currentCode = repairResult.fixedCode;
            filesWritten.push(...repairResult.filesModified);

            console.log(`[Jr] Repair completed. Changes: ${repairResult.changesMade.join(', ')}`);

            repairAttempts++;
            // Loop back to re-review the repaired code
          }
        } else {
          // Critic disabled, files were already added to filesWritten (line 185-189)
          await this.stateManager.updateField('generated_files', filesWritten);
          break;
        }
      }

      // Step 7: Compile result
      const result: PipelineResult = {
        success: true,
        task,
        complexity: complexityAnalysis.complexity,
        assignedAgent: routingDecision.targetAgent,
        output: currentCode,
        totalDuration: Date.now() - startTime,
        architecturalGuidance: architecturalDesign
          ? {
              projectType: architecturalDesign.projectType,
              recommendedPaths: architecturalDesign.recommendedFileStructure.length,
              style: architecturalDesign.architecturalStyle,
            }
          : undefined,
        review: reviewResult
          ? {
              verdict: reviewResult.verdict,
              issues: reviewResult.issues.length,
              summary: reviewResult.summary,
            }
          : undefined,
        filesWritten,
        repairAttempts,
      };

      console.log(
        `[Jr] Execution succeeded in ${result.totalDuration}ms (${repairAttempts} repairs)`
      );

      // Step 8: Update session
      await this.sessionManager.addAccomplishment(task);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Jr] Error: ${errorMessage}`);

      await this.logger.logFailure({
        timestamp: new Date().toISOString(),
        agent: 'pipeline',
        error: errorMessage,
        task,
        retry_count: 0,
      });

      return {
        success: false,
        task,
        complexity: 'unknown',
        assignedAgent: 'none',
        output: '',
        error: errorMessage,
        totalDuration: Date.now() - startTime,
      };
    }
  }

  /**
   * Clean up files that were written before rejection
   */
  private async cleanupFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        console.log(`[Jr] Cleaned up file: ${filePath}`);
      } catch (error) {
        console.warn(`[Jr] Failed to cleanup file ${filePath}:`, error);
      }
    }
  }

  /**
   * Calculate cyclomatic complexity of code
   * INTENT: Determine if code is complex enough to warrant documentation
   */
  private calculateCodeComplexity(code: string): number {
    let complexity = 1;

    const decisionPatterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /&&/g,
      /\|\|/g,
      /\?/g
    ];

    for (const pattern of decisionPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Detect programming language from file extension
   * INTENT: Determine language for proper comment formatting
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.go': 'go',
      '.rs': 'rust'
    };

    return languageMap[ext] || 'javascript';
  }

  /**
   * Get current session state
   */
  async getState() {
    return this.stateManager.getState();
  }
}
