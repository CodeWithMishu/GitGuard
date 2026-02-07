/**
 * GitGuard - Rule Engine
 * 
 * Loads and manages gitignore rules from JSON files.
 * Provides rule lookup by framework and severity.
 */

import * as path from 'path';
import { DetectedFramework, GitIgnoreRule, RuleSet, RuleSeverity } from '../types';

// Import rule sets
import nodeRules from './node.json';
import pythonRules from './python.json';
import javaRules from './java.json';

/**
 * Rule engine that manages gitignore rules
 */
export class RuleEngine {
  private ruleSets: Map<string, RuleSet>;

  constructor() {
    this.ruleSets = new Map();
    this.loadRuleSets();
  }

  /**
   * Load all rule sets from JSON files
   */
  private loadRuleSets(): void {
    this.ruleSets.set('node', nodeRules as RuleSet);
    this.ruleSets.set('python', pythonRules as RuleSet);
    this.ruleSets.set('java', javaRules as RuleSet);
  }

  /**
   * Get all rules for a category
   */
  getRulesForCategory(category: 'node' | 'python' | 'java'): GitIgnoreRule[] {
    const ruleSet = this.ruleSets.get(category);
    return ruleSet?.rules || [];
  }

  /**
   * Get framework-specific rules
   */
  getFrameworkRules(category: 'node' | 'python' | 'java', frameworkId: string): GitIgnoreRule[] {
    const ruleSet = this.ruleSets.get(category);
    if (!ruleSet?.frameworks) return [];
    return ruleSet.frameworks[frameworkId] || [];
  }

  /**
   * Get all applicable rules for detected frameworks
   * Combines base category rules with framework-specific rules
   */
  getRulesForDetections(detections: DetectedFramework[]): GitIgnoreRule[] {
    const allRules: GitIgnoreRule[] = [];
    const seenPatterns = new Set<string>();

    // Group detections by category
    const byCategory = new Map<string, DetectedFramework[]>();
    for (const detection of detections) {
      const existing = byCategory.get(detection.ruleCategory) || [];
      existing.push(detection);
      byCategory.set(detection.ruleCategory, existing);
    }

    // For each category, add base rules and framework-specific rules
    for (const [category, categoryDetections] of byCategory) {
      // Add base category rules
      const baseRules = this.getRulesForCategory(category as 'node' | 'python' | 'java');
      for (const rule of baseRules) {
        if (!seenPatterns.has(rule.pattern)) {
          allRules.push(rule);
          seenPatterns.add(rule.pattern);
        }
      }

      // Add framework-specific rules
      for (const detection of categoryDetections) {
        const frameworkRules = this.getFrameworkRules(
          category as 'node' | 'python' | 'java',
          detection.id
        );
        for (const rule of frameworkRules) {
          if (!seenPatterns.has(rule.pattern)) {
            allRules.push(rule);
            seenPatterns.add(rule.pattern);
          }
        }
      }
    }

    return allRules;
  }

  /**
   * Filter rules by severity
   */
  filterBySeverity(rules: GitIgnoreRule[], minSeverity: RuleSeverity): GitIgnoreRule[] {
    const severityOrder: RuleSeverity[] = ['critical', 'recommended', 'optional'];
    const minIndex = severityOrder.indexOf(minSeverity);
    
    return rules.filter(rule => {
      const ruleIndex = severityOrder.indexOf(rule.severity);
      return ruleIndex <= minIndex;
    });
  }

  /**
   * Get only critical rules
   */
  getCriticalRules(rules: GitIgnoreRule[]): GitIgnoreRule[] {
    return rules.filter(rule => rule.severity === 'critical');
  }

  /**
   * Check if a file path matches any rule
   */
  matchesAnyRule(filePath: string, rules: GitIgnoreRule[]): GitIgnoreRule | null {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const fileName = path.basename(normalizedPath);
    
    for (const rule of rules) {
      if (this.matchesPattern(normalizedPath, fileName, rule.pattern)) {
        return rule;
      }
    }
    
    return null;
  }

  /**
   * Check if a file path matches a gitignore pattern
   * Simplified matching - handles common patterns
   */
  private matchesPattern(fullPath: string, fileName: string, pattern: string): boolean {
    // Normalize pattern
    const normalizedPattern = pattern.replace(/\/$/, '');
    
    // Exact filename match
    if (fileName === normalizedPattern) {
      return true;
    }

    // Check if pattern matches anywhere in path
    if (fullPath.includes(normalizedPattern)) {
      return true;
    }

    // Handle glob patterns
    if (pattern.includes('*')) {
      const regexPattern = this.globToRegex(pattern);
      const regex = new RegExp(regexPattern);
      return regex.test(fileName) || regex.test(fullPath);
    }

    // Check if it's a directory pattern
    if (pattern.endsWith('/')) {
      const dirName = pattern.slice(0, -1);
      return fullPath.includes(`/${dirName}/`) || fullPath.startsWith(`${dirName}/`);
    }

    return false;
  }

  /**
   * Convert a simple glob pattern to regex
   */
  private globToRegex(glob: string): string {
    return glob
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
  }

  /**
   * Get all available categories
   */
  getCategories(): string[] {
    return Array.from(this.ruleSets.keys());
  }

  /**
   * Get rule set metadata
   */
  getRuleSetInfo(category: string): { name: string; description: string; ruleCount: number } | null {
    const ruleSet = this.ruleSets.get(category);
    if (!ruleSet) return null;

    let totalRules = ruleSet.rules.length;
    if (ruleSet.frameworks) {
      for (const frameworkRules of Object.values(ruleSet.frameworks)) {
        totalRules += frameworkRules.length;
      }
    }

    return {
      name: ruleSet.name,
      description: ruleSet.description || '',
      ruleCount: totalRules,
    };
  }
}
