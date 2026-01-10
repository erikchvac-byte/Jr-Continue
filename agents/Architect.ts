import { StateManager } from '../state/StateManager';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Architect (Agent 5)
 * READ-ONLY agent responsible for project structure analysis
 *
 * Responsibilities:
 * - Scan project structure via filesystem
 * - Identify existing patterns and architectural style
 * - Propose file locations for new features
 * - Define module boundaries and integration points
 * - Create design blueprints for execution agents
 */

export interface ArchitecturalDesign {
  projectType: string; // 'typescript', 'javascript', 'python', 'mixed'
  architecturalStyle: string; // 'modular', 'layered', 'mvc', 'microservices'
  existingPatterns: string[];
  recommendedFileStructure: FileStructureRecommendation[];
  moduleBoundaries: ModuleBoundary[];
  integrationPoints: IntegrationPoint[];
  dependencies: DependencyInfo[];
}

export interface FileStructureRecommendation {
  purpose: string;
  recommendedPath: string;
  reasoning: string;
}

export interface ModuleBoundary {
  moduleName: string;
  directory: string;
  responsibilities: string[];
  interfaces: string[];
}

export interface IntegrationPoint {
  name: string;
  description: string;
  affectedModules: string[];
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: 'production' | 'development';
}

export interface ProjectAnalysis {
  rootPath: string;
  fileCount: number;
  directoryCount: number;
  filesByExtension: Record<string, number>;
  largestFiles: Array<{ path: string; size: number }>;
  configFiles: string[];
}

export class Architect {
  private projectRoot: string;
  private stateManager: StateManager;
  private ignorePatterns: string[] = [
    'node_modules',
    'dist',
    'build',
    '.git',
    'coverage',
    'logs',
    'state',
  ];

  constructor(projectRoot: string, stateManager: StateManager) {
    this.projectRoot = projectRoot;
    this.stateManager = stateManager;
  }

  /**
   * Analyze project structure and create architectural design
   */
  async analyzeProject(): Promise<ArchitecturalDesign> {
    const analysis = await this.scanProjectStructure();
    const projectType = this.detectProjectType(analysis);
    const architecturalStyle = this.detectArchitecturalStyle(analysis);
    const existingPatterns = this.identifyPatterns(analysis);

    const design: ArchitecturalDesign = {
      projectType,
      architecturalStyle,
      existingPatterns,
      recommendedFileStructure: [],
      moduleBoundaries: this.analyzeModuleBoundaries(analysis),
      integrationPoints: [],
      dependencies: await this.analyzeDependencies(),
    };

    // Write design to state
    await this.saveDesignToState(design);

    return design;
  }

  /**
   * Scan project filesystem structure
   */
  private async scanProjectStructure(): Promise<ProjectAnalysis> {
    const analysis: ProjectAnalysis = {
      rootPath: this.projectRoot,
      fileCount: 0,
      directoryCount: 0,
      filesByExtension: {},
      largestFiles: [],
      configFiles: [],
    };

    await this.scanDirectory(this.projectRoot, analysis);

    // Sort largest files
    analysis.largestFiles.sort((a, b) => b.size - a.size);
    analysis.largestFiles = analysis.largestFiles.slice(0, 10);

    return analysis;
  }

  /**
   * Recursively scan directory
   */
  private async scanDirectory(dirPath: string, analysis: ProjectAnalysis): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.projectRoot, fullPath);

        // Skip ignored patterns
        if (this.shouldIgnore(relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          analysis.directoryCount++;
          await this.scanDirectory(fullPath, analysis);
        } else if (entry.isFile()) {
          analysis.fileCount++;

          // Track by extension
          const ext = path.extname(entry.name) || 'no-extension';
          analysis.filesByExtension[ext] = (analysis.filesByExtension[ext] || 0) + 1;

          // Track config files
          if (this.isConfigFile(entry.name)) {
            analysis.configFiles.push(relativePath);
          }

          // Track file size
          try {
            const stats = await fs.stat(fullPath);
            analysis.largestFiles.push({
              path: relativePath,
              size: stats.size,
            });
          } catch (error) {
            // Skip files we can't stat
          }
        }
      }
    } catch (error: any) {
      console.warn(`Failed to scan directory ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Check if path should be ignored
   */
  private shouldIgnore(relativePath: string): boolean {
    return this.ignorePatterns.some(pattern =>
      relativePath.includes(pattern)
    );
  }

  /**
   * Check if file is a configuration file
   */
  private isConfigFile(filename: string): boolean {
    const configPatterns = [
      'package.json',
      'tsconfig.json',
      'jest.config.js',
      '.gitignore',
      '.eslintrc',
      'webpack.config.js',
      'vite.config.ts',
      'rollup.config.js',
    ];

    return configPatterns.some(pattern => filename.includes(pattern));
  }

  /**
   * Detect project type from analysis
   */
  private detectProjectType(analysis: ProjectAnalysis): string {
    const extensions = analysis.filesByExtension;

    if (extensions['.ts'] || extensions['.tsx']) {
      return 'typescript';
    } else if (extensions['.js'] || extensions['.jsx']) {
      return 'javascript';
    } else if (extensions['.py']) {
      return 'python';
    } else if (extensions['.java']) {
      return 'java';
    } else if (extensions['.go']) {
      return 'go';
    }

    return 'unknown';
  }

  /**
   * Detect architectural style from structure
   */
  private detectArchitecturalStyle(analysis: ProjectAnalysis): string {
    const { configFiles } = analysis;

    // Check for common architectural indicators
    if (configFiles.some(f => f.includes('lerna.json') || f.includes('pnpm-workspace'))) {
      return 'monorepo';
    }

    // Simple heuristic based on directory structure
    // In a real implementation, this would be more sophisticated
    return 'modular';
  }

  /**
   * Identify common patterns in the codebase
   */
  private identifyPatterns(analysis: ProjectAnalysis): string[] {
    const patterns: string[] = [];

    if (analysis.configFiles.some(f => f.includes('jest.config'))) {
      patterns.push('Testing with Jest');
    }

    if (analysis.configFiles.some(f => f.includes('tsconfig'))) {
      patterns.push('TypeScript strict mode');
    }

    if (analysis.filesByExtension['.test.ts'] || analysis.filesByExtension['.spec.ts']) {
      patterns.push('Co-located tests');
    }

    return patterns;
  }

  /**
   * Analyze module boundaries
   */
  private analyzeModuleBoundaries(analysis: ProjectAnalysis): ModuleBoundary[] {
    const boundaries: ModuleBoundary[] = [];

    // Identify top-level modules
    // This is a simplified version - real implementation would analyze imports/exports
    if (analysis.filesByExtension['.ts'] > 0) {
      boundaries.push({
        moduleName: 'agents',
        directory: 'agents/',
        responsibilities: ['Agent implementations', 'Business logic'],
        interfaces: ['Agent classes exported'],
      });

      boundaries.push({
        moduleName: 'state',
        directory: 'state/',
        responsibilities: ['State management', 'Data persistence'],
        interfaces: ['StateManager', 'schemas'],
      });
    }

    return boundaries;
  }

  /**
   * Analyze project dependencies
   */
  private async analyzeDependencies(): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    try {
      const packageJsonPath = path.join(this.projectRoot, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(content);

      // Production dependencies
      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          dependencies.push({
            name,
            version: version as string,
            type: 'production',
          });
        }
      }

      // Dev dependencies
      if (packageJson.devDependencies) {
        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
          dependencies.push({
            name,
            version: version as string,
            type: 'development',
          });
        }
      }
    } catch (error) {
      console.warn('Failed to read package.json');
    }

    return dependencies;
  }

  /**
   * Recommend file structure for new feature
   */
  async recommendFileStructure(featureName: string, featureType: string): Promise<FileStructureRecommendation[]> {
    await this.analyzeProject();
    const recommendations: FileStructureRecommendation[] = [];

    if (featureType === 'agent') {
      recommendations.push({
        purpose: 'Agent implementation',
        recommendedPath: `agents/${featureName}.ts`,
        reasoning: 'Follows existing agent module pattern',
      });

      recommendations.push({
        purpose: 'Agent tests',
        recommendedPath: `tests/${featureName}.test.ts`,
        reasoning: 'Co-located with other agent tests',
      });
    }

    return recommendations;
  }

  /**
   * Save architectural design to state
   */
  private async saveDesignToState(design: ArchitecturalDesign): Promise<void> {
    await this.stateManager.updateField('architectural_design', {
      design,
      analyzed_at: new Date().toISOString(),
    });
  }

  /**
   * Get current architectural design from state
   */
  async getCurrentDesign(): Promise<ArchitecturalDesign | null> {
    const state = await this.stateManager.getState();
    const designData = state.architectural_design as any;

    if (designData && designData.design) {
      return designData.design as ArchitecturalDesign;
    }

    return null;
  }
}
