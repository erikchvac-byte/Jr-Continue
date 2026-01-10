import { StateManager } from '../state/StateManager';
import { Logger } from './Logger';

/**
 * PerformanceMonitor (Agent 13)
 * Tracks execution metrics and provides performance recommendations
 *
 * Responsibilities:
 * - Monitor agent execution times
 * - Track resource usage patterns
 * - Identify performance bottlenecks
 * - Generate optimization recommendations
 * - Track system health metrics
 */

export interface PerformanceMetrics {
  agent: string;
  avgExecutionTime: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  totalExecutions: number;
  successRate: number;
  lastExecutionTime: number;
}

export interface PerformanceReport {
  timestamp: string;
  overallHealth: 'excellent' | 'good' | 'degraded' | 'poor';
  agentMetrics: PerformanceMetrics[];
  bottlenecks: string[];
  recommendations: string[];
  totalTasksProcessed: number;
  avgSystemResponseTime: number;
}

export interface PerformanceAnalysis {
  success: boolean;
  report: PerformanceReport | null;
  duration_ms: number;
  error?: string;
}

interface ExecutionSample {
  agent: string;
  duration_ms: number;
  timestamp: string;
  success: boolean;
}

export class PerformanceMonitor {
  private logger: Logger;

  // Performance thresholds (in milliseconds)
  private readonly EXCELLENT_THRESHOLD = 100;
  private readonly GOOD_THRESHOLD = 500;
  private readonly DEGRADED_THRESHOLD = 2000;

  // Success rate thresholds
  private readonly MIN_ACCEPTABLE_SUCCESS_RATE = 0.9; // 90%

  constructor(_stateManager: StateManager, logger: Logger, _workingDir: string = process.cwd()) {
    this.logger = logger;
  }

  /**
   * Generate comprehensive performance report
   * @param lookbackMinutes How far back to analyze (default: 60 minutes)
   * @returns Performance analysis with recommendations
   */
  async generateReport(lookbackMinutes: number = 60): Promise<PerformanceAnalysis> {
    const startTime = Date.now();

    try {
      // Get agent activity logs
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - lookbackMinutes * 60 * 1000);

      const activities = await this.logger.queryLogs({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      });

      if (!Array.isArray(activities) || activities.length === 0) {
        // No data available
        return {
          success: true,
          report: this.createEmptyReport(),
          duration_ms: Date.now() - startTime,
        };
      }

      // Extract execution samples
      const samples = this.extractExecutionSamples(activities);

      // Calculate metrics per agent
      const agentMetrics = this.calculateAgentMetrics(samples);

      // Identify bottlenecks
      const bottlenecks = this.identifyBottlenecks(agentMetrics);

      // Generate recommendations
      const recommendations = this.generateRecommendations(agentMetrics, bottlenecks);

      // Calculate overall health
      const overallHealth = this.calculateOverallHealth(agentMetrics);

      // Calculate system-wide metrics
      const totalTasksProcessed = samples.length;
      const avgSystemResponseTime = this.calculateAverageResponseTime(samples);

      const report: PerformanceReport = {
        timestamp: new Date().toISOString(),
        overallHealth,
        agentMetrics,
        bottlenecks,
        recommendations,
        totalTasksProcessed,
        avgSystemResponseTime,
      };

      // Log the report
      await this.logger.logAgentActivity({
        timestamp: new Date().toISOString(),
        agent: 'performance-monitor',
        action: 'generate_report',
        input: { lookbackMinutes },
        output: report,
        duration_ms: Date.now() - startTime,
      });

      return {
        success: true,
        report,
        duration_ms: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.logger.logFailure({
        timestamp: new Date().toISOString(),
        agent: 'performance-monitor',
        error: errorMessage,
        task: 'Generate performance report',
        retry_count: 0,
      });

      return {
        success: false,
        report: null,
        duration_ms: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Monitor a specific agent's performance
   * @param agentName Name of agent to monitor
   * @param lookbackMinutes Time window to analyze
   * @returns Metrics for specific agent
   */
  async monitorAgent(agentName: string, lookbackMinutes: number = 60): Promise<PerformanceMetrics | null> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - lookbackMinutes * 60 * 1000);

      const activities = await this.logger.queryLogs({
        agent: agentName,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      });

      if (!Array.isArray(activities) || activities.length === 0) {
        return null;
      }

      const samples = this.extractExecutionSamples(activities);
      const filteredSamples = samples.filter(s => s.agent === agentName);

      if (filteredSamples.length === 0) {
        return null;
      }

      return this.calculateMetricsForAgent(agentName, filteredSamples);
    } catch {
      return null;
    }
  }

  /**
   * Extract execution samples from activity logs
   */
  private extractExecutionSamples(activities: any[]): ExecutionSample[] {
    const samples: ExecutionSample[] = [];

    for (const activity of activities) {
      if (activity.agent && activity.duration_ms !== undefined) {
        samples.push({
          agent: activity.agent,
          duration_ms: activity.duration_ms,
          timestamp: activity.timestamp,
          success: !activity.error,
        });
      }
    }

    return samples;
  }

  /**
   * Calculate metrics for each agent
   */
  private calculateAgentMetrics(samples: ExecutionSample[]): PerformanceMetrics[] {
    const agentSamples: Record<string, ExecutionSample[]> = {};

    // Group by agent
    for (const sample of samples) {
      if (!agentSamples[sample.agent]) {
        agentSamples[sample.agent] = [];
      }
      agentSamples[sample.agent].push(sample);
    }

    // Calculate metrics for each agent
    const metrics: PerformanceMetrics[] = [];

    for (const [agent, agentData] of Object.entries(agentSamples)) {
      metrics.push(this.calculateMetricsForAgent(agent, agentData));
    }

    return metrics.sort((a, b) => b.avgExecutionTime - a.avgExecutionTime);
  }

  /**
   * Calculate metrics for a single agent
   */
  private calculateMetricsForAgent(agent: string, samples: ExecutionSample[]): PerformanceMetrics {
    const durations = samples.map(s => s.duration_ms);
    const successes = samples.filter(s => s.success).length;

    return {
      agent,
      avgExecutionTime: Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length),
      minExecutionTime: Math.min(...durations),
      maxExecutionTime: Math.max(...durations),
      totalExecutions: samples.length,
      successRate: successes / samples.length,
      lastExecutionTime: durations[durations.length - 1] || 0,
    };
  }

  /**
   * Identify performance bottlenecks
   */
  private identifyBottlenecks(metrics: PerformanceMetrics[]): string[] {
    const bottlenecks: string[] = [];

    for (const metric of metrics) {
      // Slow average execution time
      if (metric.avgExecutionTime > this.DEGRADED_THRESHOLD) {
        bottlenecks.push(
          `${metric.agent}: Slow avg execution (${metric.avgExecutionTime}ms) - threshold ${this.DEGRADED_THRESHOLD}ms`
        );
      }

      // High variance in execution time
      const variance = metric.maxExecutionTime - metric.minExecutionTime;
      if (variance > 5000) {
        bottlenecks.push(
          `${metric.agent}: High variance (${variance}ms) between min and max execution times`
        );
      }

      // Low success rate
      if (metric.successRate < this.MIN_ACCEPTABLE_SUCCESS_RATE) {
        bottlenecks.push(
          `${metric.agent}: Low success rate (${(metric.successRate * 100).toFixed(1)}%) - threshold ${this.MIN_ACCEPTABLE_SUCCESS_RATE * 100}%`
        );
      }
    }

    return bottlenecks;
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(metrics: PerformanceMetrics[], bottlenecks: string[]): string[] {
    const recommendations: string[] = [];

    if (bottlenecks.length === 0) {
      recommendations.push('System performing well - no immediate optimizations needed');
      return recommendations;
    }

    // Analyze slowest agents
    const slowestAgents = metrics.filter(m => m.avgExecutionTime > this.GOOD_THRESHOLD);

    for (const slow of slowestAgents) {
      if (slow.agent.includes('claude') || slow.agent.includes('ollama')) {
        recommendations.push(
          `Optimize ${slow.agent}: Consider caching results or reducing context size`
        );
      } else if (slow.agent.includes('critic') || slow.agent.includes('architect')) {
        recommendations.push(
          `Optimize ${slow.agent}: Consider parallel processing or reducing analysis depth`
        );
      } else {
        recommendations.push(
          `Optimize ${slow.agent}: Review algorithm complexity and I/O operations`
        );
      }
    }

    // Check for agents with low success rates
    const unreliableAgents = metrics.filter(m => m.successRate < this.MIN_ACCEPTABLE_SUCCESS_RATE);

    for (const unreliable of unreliableAgents) {
      recommendations.push(
        `Improve ${unreliable.agent} reliability: Add error handling and retry logic`
      );
    }

    // System-wide recommendations
    if (metrics.length > 10 && metrics.slice(0, 5).every(m => m.avgExecutionTime > this.GOOD_THRESHOLD)) {
      recommendations.push('System-wide slowdown detected: Consider infrastructure scaling');
    }

    return recommendations;
  }

  /**
   * Calculate overall system health
   */
  private calculateOverallHealth(metrics: PerformanceMetrics[]): 'excellent' | 'good' | 'degraded' | 'poor' {
    if (metrics.length === 0) {
      return 'good';
    }

    const avgResponseTime = metrics.reduce((sum, m) => sum + m.avgExecutionTime, 0) / metrics.length;
    const avgSuccessRate = metrics.reduce((sum, m) => sum + m.successRate, 0) / metrics.length;

    // Poor health: slow and unreliable
    if (avgResponseTime > this.DEGRADED_THRESHOLD || avgSuccessRate < 0.8) {
      return 'poor';
    }

    // Degraded health: moderately slow or somewhat unreliable
    if (avgResponseTime > this.GOOD_THRESHOLD || avgSuccessRate < 0.9) {
      return 'degraded';
    }

    // Excellent health: fast and reliable
    if (avgResponseTime < this.EXCELLENT_THRESHOLD && avgSuccessRate > 0.95) {
      return 'excellent';
    }

    // Good health: everything else
    return 'good';
  }

  /**
   * Calculate average response time across all samples
   */
  private calculateAverageResponseTime(samples: ExecutionSample[]): number {
    if (samples.length === 0) return 0;

    const total = samples.reduce((sum, s) => sum + s.duration_ms, 0);
    return Math.round(total / samples.length);
  }

  /**
   * Create empty report when no data is available
   */
  private createEmptyReport(): PerformanceReport {
    return {
      timestamp: new Date().toISOString(),
      overallHealth: 'good',
      agentMetrics: [],
      bottlenecks: [],
      recommendations: ['No performance data available yet - execute some tasks first'],
      totalTasksProcessed: 0,
      avgSystemResponseTime: 0,
    };
  }
}
