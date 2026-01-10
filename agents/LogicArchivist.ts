/**
 * Logic Archivist - Read-only documentation agent
 *
 * WHY: Increases code maintainability by explaining WHY code exists
 * HOW: Analyzes code complexity and adds intent-focused comments
 * TRADE-OFFS: Adds processing time post-approval but significantly improves long-term maintainability
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface DocumentationMetrics {
  functionsDocumented: number;
  complexSectionsDocumented: number;
  commentsAdded: number;
  commentsUpdated: number;
  commentsPreserved: number;
  darkCodeFixed: number;
}

export interface DocumentedCodeResult {
  documentedCode: string;
  metrics: DocumentationMetrics;
}

export interface CodeSection {
  type: 'function' | 'conditional' | 'loop' | 'error-handling' | 'algorithm' | 'constant';
  startLine: number;
  endLine: number;
  code: string;
  complexity: number;
  existingComment?: string;
}

export class LogicArchivist {
  private mcpAvailable: boolean = false;

  constructor() {
    this.checkMCPAvailability();
  }

  /**
   * INTENT: Check if Ollama MCP is available for execution
   * WHY: Primary execution uses Ollama, fallback to Claude if unavailable
   */
  private async checkMCPAvailability(): Promise<void> {
    try {
      const globalObj = globalThis as any;
      this.mcpAvailable = typeof globalObj.mcp__ollama_local__ollama_query === 'function';
    } catch {
      this.mcpAvailable = false;
    }
  }

  /**
   * INTENT: Main entry point - document code with intent comments
   * WHY: Called by pipeline after Critic approval for complexity > 60
   */
  async documentCode(
    code: string,
    filePath: string,
    language: string,
    options?: {
      taskComplexity?: number;
      codeComplexity?: number;
      existingComments?: string[];
    }
  ): Promise<DocumentedCodeResult> {
    // Analyze code structure
    const sections = this.analyzeCodeSections(code, language);

    // Filter sections that need documentation
    const sectionsToDocument = sections.filter(section =>
      this.shouldDocument(section, options?.taskComplexity, options?.codeComplexity)
    );

    if (sectionsToDocument.length === 0) {
      return {
        documentedCode: code,
        metrics: {
          functionsDocumented: 0,
          complexSectionsDocumented: 0,
          commentsAdded: 0,
          commentsUpdated: 0,
          commentsPreserved: 0,
          darkCodeFixed: 0
        }
      };
    }

    // Generate documentation for each section
    const documentedCode = await this.addDocumentation(
      code,
      sectionsToDocument,
      language
    );

    // Calculate metrics
    const metrics = this.calculateMetrics(sections, sectionsToDocument, code, documentedCode);

    return {
      documentedCode,
      metrics
    };
  }

  /**
   * INTENT: Analyze code to identify logical sections needing documentation
   * WHY: Breaks down code into documentable units (functions, complex blocks, etc.)
   * TRADE-OFFS: Simple regex-based parsing (fast) vs full AST parsing (accurate but slow)
   */
  private analyzeCodeSections(code: string, language: string): CodeSection[] {
    const sections: CodeSection[] = [];
    const lines = code.split('\n');

    // Detect functions
    const functionPatterns = this.getFunctionPatterns(language);
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of functionPatterns) {
        if (pattern.test(lines[i])) {
          const section = this.extractFunctionSection(lines, i, language);
          if (section) {
            sections.push(section);
          }
        }
      }
    }

    // Detect complex conditionals (>3 branches)
    sections.push(...this.detectComplexConditionals(lines, language));

    // Detect loops with business logic
    sections.push(...this.detectComplexLoops(lines, language));

    // Detect error handling
    sections.push(...this.detectErrorHandling(lines, language));

    // Detect magic numbers/constants
    sections.push(...this.detectMagicNumbers(lines, language));

    return sections;
  }

  /**
   * INTENT: Get regex patterns for function detection based on language
   */
  private getFunctionPatterns(language: string): RegExp[] {
    switch (language.toLowerCase()) {
      case 'typescript':
      case 'javascript':
        return [
          /^\s*(export\s+)?(async\s+)?function\s+\w+/,
          /^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/,
          /^\s*(public|private|protected|static)?\s*(async\s+)?\w+\s*\(/
        ];
      case 'python':
        return [
          /^\s*def\s+\w+/,
          /^\s*async\s+def\s+\w+/
        ];
      default:
        return [/^\s*function\s+\w+/];
    }
  }

  /**
   * INTENT: Extract complete function section from starting line
   * WHY: Need to analyze entire function to determine complexity
   */
  private extractFunctionSection(lines: string[], startLine: number, language: string): CodeSection | null {
    let braceCount = 0;
    let inFunction = false;
    let endLine = startLine;

    const openBrace = language === 'python' ? ':' : '{';
    const closeBrace = language === 'python' ? '' : '}';

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes(openBrace)) {
        inFunction = true;
        braceCount++;
      }

      if (closeBrace && line.includes(closeBrace)) {
        braceCount--;
      }

      // Python: detect end by indentation change
      if (language === 'python' && inFunction && i > startLine) {
        const currentIndent = line.search(/\S/);
        const startIndent = lines[startLine].search(/\S/);
        if (currentIndent !== -1 && currentIndent <= startIndent && line.trim() !== '') {
          endLine = i - 1;
          break;
        }
      }

      // Brace-based: detect end when braces match
      if (closeBrace && braceCount === 0 && inFunction) {
        endLine = i;
        break;
      }
    }

    const code = lines.slice(startLine, endLine + 1).join('\n');
    const complexity = this.calculateCyclomaticComplexity(code);

    // Check for existing comment
    const existingComment = this.extractExistingComment(lines, startLine);

    return {
      type: 'function',
      startLine,
      endLine,
      code,
      complexity,
      existingComment
    };
  }

  /**
   * INTENT: Calculate cyclomatic complexity of code section
   * WHY: Determines if section is complex enough to require documentation
   * HOW: Count decision points (if/else/for/while/case/catch/&&/||)
   */
  private calculateCyclomaticComplexity(code: string): number {
    let complexity = 1; // Base complexity

    // Decision points
    const decisionPatterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /&&/g,
      /\|\|/g,
      /\?/g // Ternary operator
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
   * INTENT: Extract existing comment immediately before code section
   * WHY: Need to determine if we should preserve, update, or replace
   */
  private extractExistingComment(lines: string[], sectionStartLine: number): string | undefined {
    let commentLines: string[] = [];
    let i = sectionStartLine - 1;

    // Walk backwards to find comment block
    while (i >= 0) {
      const line = lines[i].trim();

      // Empty line - stop searching
      if (line === '') break;

      // Single-line comment
      if (line.startsWith('//') || line.startsWith('#')) {
        commentLines.unshift(line);
        i--;
        continue;
      }

      // Multi-line comment end
      if (line.endsWith('*/')) {
        commentLines.unshift(line);
        i--;
        // Find start of multi-line comment
        while (i >= 0) {
          commentLines.unshift(lines[i].trim());
          if (lines[i].trim().startsWith('/*') || lines[i].trim().startsWith('/**')) {
            break;
          }
          i--;
        }
        break;
      }

      // Not a comment - stop
      break;
    }

    return commentLines.length > 0 ? commentLines.join('\n') : undefined;
  }

  /**
   * INTENT: Detect complex conditional blocks (>3 branches)
   */
  private detectComplexConditionals(lines: string[], language: string): CodeSection[] {
    const sections: CodeSection[] = [];
    let currentConditional: { startLine: number; branches: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/\bif\b/.test(line)) {
        currentConditional = { startLine: i, branches: 1 };
      } else if (currentConditional && /\belse\s+if\b/.test(line)) {
        currentConditional.branches++;
      } else if (currentConditional && /\belse\b/.test(line)) {
        currentConditional.branches++;

        // End of conditional - check if complex
        if (currentConditional.branches > 3) {
          const code = lines.slice(currentConditional.startLine, i + 1).join('\n');
          sections.push({
            type: 'conditional',
            startLine: currentConditional.startLine,
            endLine: i,
            code,
            complexity: currentConditional.branches,
            existingComment: this.extractExistingComment(lines, currentConditional.startLine)
          });
        }
        currentConditional = null;
      }
    }

    return sections;
  }

  /**
   * INTENT: Detect loops with potential business logic
   */
  private detectComplexLoops(lines: string[], language: string): CodeSection[] {
    const sections: CodeSection[] = [];
    const loopPatterns = [/\bfor\b/, /\bwhile\b/, /\bdo\b/];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of loopPatterns) {
        if (pattern.test(line)) {
          const section = this.extractFunctionSection(lines, i, language);
          if (section && section.complexity > 3) {
            sections.push({ ...section, type: 'loop' });
          }
        }
      }
    }

    return sections;
  }

  /**
   * INTENT: Detect error handling blocks
   */
  private detectErrorHandling(lines: string[], language: string): CodeSection[] {
    const sections: CodeSection[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/\btry\b/.test(line) || /\bcatch\b/.test(line)) {
        const section = this.extractFunctionSection(lines, i, language);
        if (section) {
          sections.push({ ...section, type: 'error-handling' });
        }
      }
    }

    return sections;
  }

  /**
   * INTENT: Detect magic numbers and constants
   */
  private detectMagicNumbers(lines: string[], language: string): CodeSection[] {
    const sections: CodeSection[] = [];
    const magicNumberPattern = /=\s*(\d{3,}|\d+\.\d+)/; // Numbers with 3+ digits or decimals

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (magicNumberPattern.test(line) && !/const\s+\w+/.test(line)) {
        sections.push({
          type: 'constant',
          startLine: i,
          endLine: i,
          code: line,
          complexity: 1,
          existingComment: this.extractExistingComment(lines, i)
        });
      }
    }

    return sections;
  }

  /**
   * INTENT: Determine if a code section should be documented
   * WHY: Skip simple getters/setters and one-line utilities per requirements
   */
  private shouldDocument(
    section: CodeSection,
    taskComplexity?: number,
    codeComplexity?: number
  ): boolean {
    // Always document if task complexity > 60
    if (taskComplexity && taskComplexity > 60) return true;

    // Always document if code cyclomatic complexity > 5
    if (section.complexity > 5) return true;

    // Document complex conditionals (>3 branches)
    if (section.type === 'conditional' && section.complexity > 3) return true;

    // Document error handling
    if (section.type === 'error-handling') return true;

    // Document magic numbers
    if (section.type === 'constant') return true;

    // Document loops with complexity > 3
    if (section.type === 'loop' && section.complexity > 3) return true;

    // Document functions with complexity > 3 (skip simple getters/setters)
    if (section.type === 'function') {
      const isSimpleGetter = /^(get|set)\s*\w+\s*\([^)]*\)\s*{\s*return\s+/.test(section.code);
      if (isSimpleGetter) return false;

      const isOneLiner = section.code.split('\n').length <= 3;
      if (isOneLiner) return false;

      return section.complexity > 3;
    }

    return false;
  }

  /**
   * INTENT: Add documentation comments to code sections
   * WHY: Primary function - generates and inserts intent-focused comments
   * HOW: Uses Ollama (primary) or Claude (fallback) for comment generation
   */
  private async addDocumentation(
    code: string,
    sections: CodeSection[],
    language: string
  ): Promise<string> {
    const lines = code.split('\n');
    const insertions: Map<number, string> = new Map();

    for (const section of sections) {
      const comment = await this.generateComment(section, language);
      if (comment) {
        const action = this.determineCommentAction(section);

        if (action === 'add') {
          insertions.set(section.startLine, comment);
        } else if (action === 'update') {
          insertions.set(section.startLine, comment);
        } else if (action === 'preserve-and-append') {
          insertions.set(section.startLine, comment);
        }
      }
    }

    // Insert comments in reverse order to maintain line numbers
    const sortedInsertions = Array.from(insertions.entries()).sort((a, b) => b[0] - a[0]);

    for (const [lineNum, comment] of sortedInsertions) {
      const indent = lines[lineNum].match(/^\s*/)?.[0] || '';
      const commentLines = comment.split('\n').map(line => indent + line);
      lines.splice(lineNum, 0, ...commentLines);
    }

    return lines.join('\n');
  }

  /**
   * INTENT: Determine whether to add, update, or preserve existing comments
   * WHY: Conservative update policy - preserve substantive human comments
   */
  private determineCommentAction(section: CodeSection): 'add' | 'update' | 'preserve-and-append' {
    if (!section.existingComment) {
      return 'add';
    }

    const isSubstantive = this.isSubstantiveComment(section.existingComment);

    if (isSubstantive) {
      return 'preserve-and-append';
    } else {
      return 'update';
    }
  }

  /**
   * INTENT: Determine if an existing comment is substantive (human-written)
   * WHY: Preserve valuable context from developers, replace generic comments
   * HOW: Check length, domain terms, reasoning words, external references
   */
  private isSubstantiveComment(comment: string): boolean {
    // Remove comment markers for analysis
    const cleanComment = comment
      .replace(/^\/\/|^#|^\/\*+|\*\/$/gm, '')
      .trim();

    // Length check: >20 chars
    if (cleanComment.length <= 20) return false;

    // Domain-specific terms
    const domainTerms = [
      'compliance', 'RFC', 'FIPS', 'OWASP', 'security', 'performance',
      'business', 'regulation', 'legal', 'audit', 'requirements',
      'specification', 'standard', 'protocol'
    ];
    const hasDomainTerms = domainTerms.some(term =>
      cleanComment.toLowerCase().includes(term.toLowerCase())
    );

    // Reasoning words
    const reasoningWords = [
      'because', 'to prevent', 'ensures', 'guarantees', 'requires',
      'in order to', 'so that', 'due to', 'based on'
    ];
    const hasReasoning = reasoningWords.some(word =>
      cleanComment.toLowerCase().includes(word.toLowerCase())
    );

    // External references
    const hasReference = /ticket\s*#\d+|issue\s*#\d+|see\s+\w+|https?:\/\//i.test(cleanComment);

    return hasDomainTerms || hasReasoning || hasReference;
  }

  /**
   * INTENT: Generate intent-focused comment for a code section
   * WHY: Core documentation generation using Ollama (fast, free)
   * TRADE-OFFS: Uses Ollama for speed, escalates to Claude if needed
   */
  private async generateComment(section: CodeSection, language: string): Promise<string | null> {
    const prompt = this.buildCommentPrompt(section, language);

    try {
      // Primary: Use Ollama via MCP
      if (this.mcpAvailable) {
        const result = await this.generateViaOllama(prompt);
        return this.formatComment(result, language, section.type);
      }

      // Fallback: Use Claude via Task tool (if available)
      return await this.generateViaClaude(prompt, language, section.type);
    } catch (error) {
      console.error('Failed to generate comment:', error);
      return null;
    }
  }

  /**
   * INTENT: Build prompt for comment generation
   */
  private buildCommentPrompt(section: CodeSection, language: string): string {
    const complexity = section.complexity > 7 ? 'high' : section.complexity > 4 ? 'medium' : 'low';

    let prompt = `Analyze this ${language} code and explain WHY it exists (not what it does).\n\n`;
    prompt += `Code Section Type: ${section.type}\n`;
    prompt += `Complexity: ${complexity} (cyclomatic complexity: ${section.complexity})\n\n`;
    prompt += `Code:\n${section.code}\n\n`;

    if (section.type === 'function') {
      prompt += 'Explain:\n';
      prompt += '1. WHY: Business reason this function exists\n';
      prompt += '2. HOW: Technical approach chosen\n';
      prompt += '3. TRADE-OFFS: What was sacrificed for this solution\n';
    } else {
      prompt += 'Explain the INTENT: Why this code section exists and its purpose.\n';
    }

    prompt += '\nKeep explanation concise (1-3 lines). Focus on WHY, not WHAT.';

    return prompt;
  }

  /**
   * INTENT: Generate comment using Ollama MCP
   */
  private async generateViaOllama(prompt: string): Promise<string> {
    const globalObj = globalThis as any;
    const ollamaQuery = globalObj.mcp__ollama_local__ollama_query;

    if (!ollamaQuery) {
      throw new Error('Ollama MCP not available');
    }

    const result = await ollamaQuery({
      model: 'qwen2.5-coder:7b',
      prompt,
      temperature: 0.3, // Low temperature for consistent documentation
      max_tokens: 200
    });

    return result.response || result.output || '';
  }

  /**
   * INTENT: Generate comment using Claude Task tool (fallback)
   */
  private async generateViaClaude(prompt: string, language: string, sectionType: string): Promise<string | null> {
    const globalObj = globalThis as any;
    const TaskFn = globalObj.Task;

    if (!TaskFn) {
      return null; // No fallback available
    }

    const result = await TaskFn({
      subagent_type: 'general-purpose',
      prompt,
      description: 'Generate code documentation',
      model: 'haiku' // Cost-optimized
    });

    return this.formatComment(result.output, language, sectionType);
  }

  /**
   * INTENT: Format generated comment according to language conventions
   * WHY: Different languages use different comment styles (JSDoc, docstrings, etc.)
   */
  private formatComment(comment: string, language: string, sectionType: string): string {
    const cleaned = comment.trim();

    if (language === 'typescript' || language === 'javascript') {
      if (sectionType === 'function') {
        // Use JSDoc for functions
        return `/**\n * ${cleaned.replace(/\n/g, '\n * ')}\n */`;
      } else {
        // Use single-line comment for other sections
        return `// INTENT: ${cleaned}`;
      }
    } else if (language === 'python') {
      if (sectionType === 'function') {
        // Use docstring for functions
        return `"""${cleaned}"""`;
      } else {
        return `# INTENT: ${cleaned}`;
      }
    } else {
      // Default: single-line comment
      return `// INTENT: ${cleaned}`;
    }
  }

  /**
   * INTENT: Calculate documentation metrics for reporting
   */
  private calculateMetrics(
    allSections: CodeSection[],
    documentedSections: CodeSection[],
    originalCode: string,
    documentedCode: string
  ): DocumentationMetrics {
    const originalCommentCount = (originalCode.match(/\/\/|\/\*|#/g) || []).length;
    const newCommentCount = (documentedCode.match(/\/\/|\/\*|#/g) || []).length;

    const functionsDocumented = documentedSections.filter(s => s.type === 'function').length;
    const complexSections = documentedSections.filter(s =>
      s.type === 'conditional' || s.type === 'loop' || s.type === 'algorithm'
    ).length;

    const preserved = documentedSections.filter(s =>
      s.existingComment && this.isSubstantiveComment(s.existingComment)
    ).length;

    const updated = documentedSections.filter(s =>
      s.existingComment && !this.isSubstantiveComment(s.existingComment)
    ).length;

    const added = documentedSections.filter(s => !s.existingComment).length;

    return {
      functionsDocumented,
      complexSectionsDocumented: complexSections,
      commentsAdded: added,
      commentsUpdated: updated,
      commentsPreserved: preserved,
      darkCodeFixed: added + updated
    };
  }

  /**
   * INTENT: Detect undocumented "dark code" in a file
   * WHY: Pre-commit hook to catch missing documentation
   */
  async detectDarkCode(filePath: string): Promise<CodeSection[]> {
    const code = await fs.readFile(filePath, 'utf-8');
    const language = this.detectLanguage(filePath);
    const sections = this.analyzeCodeSections(code, language);

    // Return sections that should be documented but aren't
    return sections.filter(section =>
      this.shouldDocument(section) && !section.existingComment
    );
  }

  /**
   * INTENT: Detect programming language from file extension
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
}
