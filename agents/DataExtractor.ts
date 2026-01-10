import { StateManager } from '../state/StateManager';
import { Logger } from './Logger';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * DataExtractor (Agent 11)
 * Extracts context and API information from codebases
 *
 * Responsibilities:
 * - Parse codebases to extract function signatures
 * - Build API context for code generation
 * - Extract type definitions and interfaces
 * - Identify code patterns and conventions
 * - Generate context summaries for other agents
 */

export interface FunctionSignature {
  name: string;
  parameters: string[];
  returnType: string;
  filePath: string;
  lineNumber: number;
  isAsync: boolean;
  isExported: boolean;
}

export interface TypeDefinition {
  name: string;
  kind: 'interface' | 'type' | 'class' | 'enum';
  filePath: string;
  lineNumber: number;
  properties: string[];
  isExported: boolean;
}

export interface CodeContext {
  functions: FunctionSignature[];
  types: TypeDefinition[];
  imports: string[];
  exports: string[];
  patterns: CodePattern[];
}

export interface CodePattern {
  name: string;
  description: string;
  examples: string[];
  frequency: number;
}

export interface ExtractionResult {
  success: boolean;
  context: CodeContext | null;
  filesAnalyzed: number;
  duration_ms: number;
  error?: string;
}

export class DataExtractor {
  private logger: Logger;
  private workingDir: string;

  // File extensions to analyze
  private readonly SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

  // Regex patterns for extraction
  private readonly FUNCTION_PATTERN = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g;
  private readonly ARROW_FUNCTION_PATTERN = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)(?:\s*:\s*([^=>]+))?\s*=>/g;
  private readonly INTERFACE_PATTERN = /(?:export\s+)?interface\s+(\w+)\s*{([^}]*)}/g;
  private readonly TYPE_PATTERN = /(?:export\s+)?type\s+(\w+)\s*=\s*([^;]+);?/g;
  private readonly CLASS_PATTERN = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*{/g;
  private readonly IMPORT_PATTERN = /import\s+(?:{[^}]+}|[\w*\s,]+)\s+from\s+['"]([^'"]+)['"]/g;
  private readonly EXPORT_PATTERN = /export\s+(?:{[^}]+}|[\w*\s,]+)/g;

  constructor(_stateManager: StateManager, logger: Logger, workingDir: string = process.cwd()) {
    this.logger = logger;
    this.workingDir = workingDir;
  }

  /**
   * Extract code context from a directory
   * @param targetDir Directory to analyze (relative to workingDir)
   * @param recursive Whether to analyze subdirectories
   * @returns Extraction result with code context
   */
  async extractContext(targetDir: string = '.', recursive: boolean = true): Promise<ExtractionResult> {
    const startTime = Date.now();

    try {
      const fullPath = path.resolve(this.workingDir, targetDir);

      // Verify directory exists
      const stats = await fs.stat(fullPath);
      if (!stats.isDirectory()) {
        throw new Error(`${targetDir} is not a directory`);
      }

      // Find all source files
      const files = await this.findSourceFiles(fullPath, recursive);

      if (files.length === 0) {
        return {
          success: true,
          context: this.createEmptyContext(),
          filesAnalyzed: 0,
          duration_ms: Date.now() - startTime,
        };
      }

      // Extract context from each file
      const functions: FunctionSignature[] = [];
      const types: TypeDefinition[] = [];
      const importsSet = new Set<string>();
      const exportsSet = new Set<string>();

      for (const file of files) {
        const fileContext = await this.analyzeFile(file);

        functions.push(...fileContext.functions);
        types.push(...fileContext.types);
        fileContext.imports.forEach(imp => importsSet.add(imp));
        fileContext.exports.forEach(exp => exportsSet.add(exp));
      }

      // Identify code patterns
      const patterns = this.identifyPatterns(functions, types);

      const context: CodeContext = {
        functions,
        types,
        imports: Array.from(importsSet),
        exports: Array.from(exportsSet),
        patterns,
      };

      // Log the extraction
      await this.logger.logAgentActivity({
        timestamp: new Date().toISOString(),
        agent: 'data-extractor',
        action: 'extract_context',
        input: { targetDir, recursive },
        output: {
          filesAnalyzed: files.length,
          functionsFound: functions.length,
          typesFound: types.length,
          patternsFound: patterns.length,
        },
        duration_ms: Date.now() - startTime,
      });

      return {
        success: true,
        context,
        filesAnalyzed: files.length,
        duration_ms: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.logger.logFailure({
        timestamp: new Date().toISOString(),
        agent: 'data-extractor',
        error: errorMessage,
        task: `Extract context from ${targetDir}`,
        retry_count: 0,
      });

      return {
        success: false,
        context: null,
        filesAnalyzed: 0,
        duration_ms: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Extract API signatures from specific files
   * @param filePaths Array of file paths to analyze
   * @returns Function signatures and types found
   */
  async extractAPIs(filePaths: string[]): Promise<{
    functions: FunctionSignature[];
    types: TypeDefinition[];
  }> {
    const functions: FunctionSignature[] = [];
    const types: TypeDefinition[] = [];

    for (const filePath of filePaths) {
      const fullPath = path.resolve(this.workingDir, filePath);

      try {
        const context = await this.analyzeFile(fullPath);
        functions.push(...context.functions);
        types.push(...context.types);
      } catch {
        // Skip files that can't be analyzed
        continue;
      }
    }

    return { functions, types };
  }

  /**
   * Generate context summary for code generation
   * @param context Code context to summarize
   * @returns Human-readable summary
   */
  generateSummary(context: CodeContext): string {
    const lines: string[] = [];

    lines.push('# Codebase Context Summary\n');

    // Functions
    if (context.functions.length > 0) {
      lines.push(`## Functions (${context.functions.length})\n`);
      const exportedFunctions = context.functions.filter(f => f.isExported);

      if (exportedFunctions.length > 0) {
        lines.push('### Exported Functions:\n');
        exportedFunctions.slice(0, 10).forEach(fn => {
          const params = fn.parameters.join(', ');
          lines.push(`- \`${fn.name}(${params}): ${fn.returnType}\` - ${fn.filePath}:${fn.lineNumber}`);
        });

        if (exportedFunctions.length > 10) {
          lines.push(`- ... and ${exportedFunctions.length - 10} more\n`);
        }
      }
    }

    // Types
    if (context.types.length > 0) {
      lines.push(`\n## Types (${context.types.length})\n`);
      const exportedTypes = context.types.filter(t => t.isExported);

      if (exportedTypes.length > 0) {
        lines.push('### Exported Types:\n');
        exportedTypes.slice(0, 10).forEach(type => {
          lines.push(`- \`${type.kind} ${type.name}\` - ${type.filePath}:${type.lineNumber}`);
        });

        if (exportedTypes.length > 10) {
          lines.push(`- ... and ${exportedTypes.length - 10} more\n`);
        }
      }
    }

    // Patterns
    if (context.patterns.length > 0) {
      lines.push(`\n## Code Patterns (${context.patterns.length})\n`);
      context.patterns.forEach(pattern => {
        lines.push(`### ${pattern.name} (${pattern.frequency} occurrences)`);
        lines.push(`${pattern.description}\n`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Find all source files in directory
   */
  private async findSourceFiles(dir: string, recursive: boolean): Promise<string[]> {
    const files: string[] = [];

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules and hidden directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory() && recursive) {
        const subFiles = await this.findSourceFiles(fullPath, recursive);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (this.SUPPORTED_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  /**
   * Analyze a single file
   */
  private async analyzeFile(filePath: string): Promise<{
    functions: FunctionSignature[];
    types: TypeDefinition[];
    imports: string[];
    exports: string[];
  }> {
    const content = await fs.readFile(filePath, 'utf-8');

    const functions: FunctionSignature[] = [];
    const types: TypeDefinition[] = [];
    const imports: string[] = [];
    const exports: string[] = [];

    // Extract functions
    const functionMatches = [...content.matchAll(this.FUNCTION_PATTERN)];
    for (const match of functionMatches) {
      const lineNumber = this.findLineNumber(content, match.index || 0);
      functions.push({
        name: match[1],
        parameters: match[2] ? match[2].split(',').map(p => p.trim()) : [],
        returnType: match[3]?.trim() || 'void',
        filePath,
        lineNumber,
        isAsync: match[0].includes('async'),
        isExported: match[0].includes('export'),
      });
    }

    // Extract arrow functions
    const arrowMatches = [...content.matchAll(this.ARROW_FUNCTION_PATTERN)];
    for (const match of arrowMatches) {
      const lineNumber = this.findLineNumber(content, match.index || 0);
      functions.push({
        name: match[1],
        parameters: match[2] ? match[2].split(',').map(p => p.trim()) : [],
        returnType: match[3]?.trim() || 'unknown',
        filePath,
        lineNumber,
        isAsync: match[0].includes('async'),
        isExported: match[0].includes('export'),
      });
    }

    // Extract interfaces
    const interfaceMatches = [...content.matchAll(this.INTERFACE_PATTERN)];
    for (const match of interfaceMatches) {
      const lineNumber = this.findLineNumber(content, match.index || 0);
      const properties = match[2]
        .split(';')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      types.push({
        name: match[1],
        kind: 'interface',
        filePath,
        lineNumber,
        properties,
        isExported: match[0].includes('export'),
      });
    }

    // Extract type aliases
    const typeMatches = [...content.matchAll(this.TYPE_PATTERN)];
    for (const match of typeMatches) {
      const lineNumber = this.findLineNumber(content, match.index || 0);

      types.push({
        name: match[1],
        kind: 'type',
        filePath,
        lineNumber,
        properties: [match[2].trim()],
        isExported: match[0].includes('export'),
      });
    }

    // Extract classes
    const classMatches = [...content.matchAll(this.CLASS_PATTERN)];
    for (const match of classMatches) {
      const lineNumber = this.findLineNumber(content, match.index || 0);

      types.push({
        name: match[1],
        kind: 'class',
        filePath,
        lineNumber,
        properties: [],
        isExported: match[0].includes('export'),
      });
    }

    // Extract imports
    const importMatches = [...content.matchAll(this.IMPORT_PATTERN)];
    for (const match of importMatches) {
      imports.push(match[1]);
    }

    // Extract exports
    const exportMatches = [...content.matchAll(this.EXPORT_PATTERN)];
    exports.push(...exportMatches.map(m => m[0]));

    return { functions, types, imports, exports };
  }

  /**
   * Find line number from character index
   */
  private findLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Identify common patterns in code
   */
  private identifyPatterns(functions: FunctionSignature[], types: TypeDefinition[]): CodePattern[] {
    const patterns: CodePattern[] = [];

    // Pattern 1: Async/await usage
    const asyncFunctions = functions.filter(f => f.isAsync);
    if (asyncFunctions.length > 0) {
      patterns.push({
        name: 'Async/Await Pattern',
        description: 'Codebase uses async/await for asynchronous operations',
        examples: asyncFunctions.slice(0, 3).map(f => f.name),
        frequency: asyncFunctions.length,
      });
    }

    // Pattern 2: Interface-driven design
    const interfaces = types.filter(t => t.kind === 'interface');
    if (interfaces.length > 5) {
      patterns.push({
        name: 'Interface-Driven Design',
        description: 'Codebase heavily uses TypeScript interfaces for type safety',
        examples: interfaces.slice(0, 3).map(i => i.name),
        frequency: interfaces.length,
      });
    }

    // Pattern 3: Class-based architecture
    const classes = types.filter(t => t.kind === 'class');
    if (classes.length > 5) {
      patterns.push({
        name: 'Object-Oriented Architecture',
        description: 'Codebase uses class-based OOP patterns',
        examples: classes.slice(0, 3).map(c => c.name),
        frequency: classes.length,
      });
    }

    // Pattern 4: Functional programming
    const arrowFunctions = functions.filter(f => f.filePath.includes('=>'));
    if (arrowFunctions.length > functions.length * 0.5) {
      patterns.push({
        name: 'Functional Programming',
        description: 'Codebase favors functional programming with arrow functions',
        examples: arrowFunctions.slice(0, 3).map(f => f.name),
        frequency: arrowFunctions.length,
      });
    }

    return patterns;
  }

  /**
   * Create empty context structure
   */
  private createEmptyContext(): CodeContext {
    return {
      functions: [],
      types: [],
      imports: [],
      exports: [],
      patterns: [],
    };
  }
}
