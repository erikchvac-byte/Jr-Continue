import { StateManager } from '../state/StateManager';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * DependencyScout (Agent 9)
 * READ-ONLY agent responsible for dependency analysis
 *
 * Responsibilities:
 * - Scan package.json, requirements.txt, etc.
 * - Identify version conflicts and missing dependencies
 * - Check compatibility with existing codebase
 * - Detect security vulnerabilities
 */

export interface DependencyReport {
  totalDependencies: number;
  productionDependencies: number;
  devDependencies: number;
  conflicts: ConflictInfo[];
  missingPeerDependencies: string[];
  outdatedPackages: OutdatedInfo[];
  securityIssues: VulnerabilityInfo[];
  analyzed_at: string;
}

export interface ConflictInfo {
  packageName: string;
  declaredVersion: string;
  conflictType: 'version-mismatch' | 'duplicate' | 'incompatible';
  description: string;
}

export interface OutdatedInfo {
  packageName: string;
  currentVersion: string;
  latestVersion: string;
  severity: 'major' | 'minor' | 'patch';
}

export interface VulnerabilityInfo {
  packageName: string;
  version: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

export interface PackageInfo {
  name: string;
  version: string;
  type: 'production' | 'development';
}

export class DependencyScout {
  private projectRoot: string;
  private stateManager: StateManager;

  constructor(projectRoot: string, stateManager: StateManager) {
    this.projectRoot = projectRoot;
    this.stateManager = stateManager;
  }

  /**
   * Scan all dependencies and generate comprehensive report
   */
  async scanDependencies(): Promise<DependencyReport> {
    const packages = await this.readPackageJson();
    const conflicts = await this.checkConflicts(packages);
    const missingPeers = await this.checkMissingPeerDependencies(packages);
    const securityIssues = await this.checkSecurityVulnerabilities(packages);

    const report: DependencyReport = {
      totalDependencies: packages.length,
      productionDependencies: packages.filter(p => p.type === 'production').length,
      devDependencies: packages.filter(p => p.type === 'development').length,
      conflicts,
      missingPeerDependencies: missingPeers,
      outdatedPackages: [],
      securityIssues,
      analyzed_at: new Date().toISOString(),
    };

    // Save report to state
    await this.saveReportToState(report);

    return report;
  }

  /**
   * Read package.json and extract dependencies
   */
  private async readPackageJson(): Promise<PackageInfo[]> {
    const packages: PackageInfo[] = [];

    try {
      const packageJsonPath = path.join(this.projectRoot, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(content);

      // Production dependencies
      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          packages.push({
            name,
            version: version as string,
            type: 'production',
          });
        }
      }

      // Dev dependencies
      if (packageJson.devDependencies) {
        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
          packages.push({
            name,
            version: version as string,
            type: 'development',
          });
        }
      }
    } catch (error: any) {
      console.error(`Failed to read package.json: ${error.message}`);
    }

    return packages;
  }

  /**
   * Check for version conflicts
   */
  async checkConflicts(packages: PackageInfo[]): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = [];

    // Check for duplicate package declarations
    const packageCounts = new Map<string, number>();
    for (const pkg of packages) {
      packageCounts.set(pkg.name, (packageCounts.get(pkg.name) || 0) + 1);
    }

    for (const [name, count] of packageCounts.entries()) {
      if (count > 1) {
        const versions = packages
          .filter(p => p.name === name)
          .map(p => p.version);

        conflicts.push({
          packageName: name,
          declaredVersion: versions.join(', '),
          conflictType: 'duplicate',
          description: `Package ${name} declared ${count} times with versions: ${versions.join(', ')}`,
        });
      }
    }

    // Check for known incompatibilities
    conflicts.push(...this.checkKnownIncompatibilities(packages));

    return conflicts;
  }

  /**
   * Check for known package incompatibilities
   */
  private checkKnownIncompatibilities(packages: PackageInfo[]): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];

    // Example: Check TypeScript version with ts-jest
    const typescript = packages.find(p => p.name === 'typescript');
    const tsJest = packages.find(p => p.name === 'ts-jest');

    if (typescript && tsJest) {
      const tsVersion = this.extractMajorVersion(typescript.version);
      // Simplified check - in real impl, would use semver
      if (tsVersion >= 5) {
        // ts-jest 29.x+ required for TS 5.x
        const tsJestVersion = this.extractMajorVersion(tsJest.version);
        if (tsJestVersion < 29) {
          conflicts.push({
            packageName: 'ts-jest',
            declaredVersion: tsJest.version,
            conflictType: 'incompatible',
            description: `ts-jest ${tsJest.version} may be incompatible with TypeScript ${typescript.version}. Consider upgrading to ts-jest ^29.0.0`,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Extract major version number from version string
   */
  private extractMajorVersion(version: string): number {
    const match = version.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Check for missing peer dependencies
   */
  async checkMissingPeerDependencies(packages: PackageInfo[]): Promise<string[]> {
    const missing: string[] = [];

    // Check common peer dependency requirements
    const peerRequirements: Record<string, string[]> = {
      'ts-jest': ['typescript', 'jest'],
      '@types/jest': ['jest'],
      '@types/node': [],
      'eslint': [],
    };

    for (const pkg of packages) {
      if (peerRequirements[pkg.name]) {
        for (const peerDep of peerRequirements[pkg.name]) {
          const hasPeer = packages.some(p => p.name === peerDep);
          if (!hasPeer && !missing.includes(peerDep)) {
            missing.push(peerDep);
          }
        }
      }
    }

    return missing;
  }

  /**
   * Check for security vulnerabilities
   */
  async checkSecurityVulnerabilities(packages: PackageInfo[]): Promise<VulnerabilityInfo[]> {
    const vulnerabilities: VulnerabilityInfo[] = [];

    // Check for packages with known vulnerabilities
    // In production, this would integrate with npm audit or Snyk API
    const knownVulnerablePackages = [
      'lodash@<4.17.21',
      'minimist@<1.2.6',
    ];

    for (const pkg of packages) {
      // Simple pattern matching (real implementation would use proper semver checking)
      for (const vulnerable of knownVulnerablePackages) {
        if (vulnerable.startsWith(pkg.name + '@')) {
          vulnerabilities.push({
            packageName: pkg.name,
            version: pkg.version,
            severity: 'medium',
            description: `Package ${pkg.name}@${pkg.version} has known vulnerabilities`,
            recommendation: `Update to latest version`,
          });
        }
      }
    }

    // Check for packages using deprecated versions
    if (packages.some(p => p.name === 'request')) {
      vulnerabilities.push({
        packageName: 'request',
        version: packages.find(p => p.name === 'request')!.version,
        severity: 'low',
        description: 'Package "request" is deprecated',
        recommendation: 'Migrate to "axios" or "node-fetch"',
      });
    }

    return vulnerabilities;
  }

  /**
   * Check if all required dependencies are installed
   */
  async validateDependencies(): Promise<boolean> {
    try {
      await this.readPackageJson();
      const report = await this.scanDependencies();

      // Check for critical conflicts or missing dependencies
      const hasCriticalIssues =
        report.conflicts.some(c => c.conflictType === 'incompatible') ||
        report.securityIssues.some(v => v.severity === 'critical');

      return !hasCriticalIssues;
    } catch (error) {
      return false;
    }
  }

  /**
   * Save dependency report to state
   */
  private async saveReportToState(report: DependencyReport): Promise<void> {
    await this.stateManager.updateField('dependency_report', report);
  }

  /**
   * Get last dependency report from state
   */
  async getLastReport(): Promise<DependencyReport | null> {
    const state = await this.stateManager.getState();
    const report = state.dependency_report as any;

    if (report && report.analyzed_at) {
      return report as DependencyReport;
    }

    return null;
  }
}
