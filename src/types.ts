/**
 * GitGuard - Type Definitions
 * 
 * Central type definitions for the extension.
 * Keeping types in one place ensures consistency across modules.
 */

/**
 * Severity levels for gitignore rules
 * - critical: Must be ignored (e.g., .env files with secrets)
 * - recommended: Should be ignored (e.g., node_modules)
 * - optional: Nice to ignore (e.g., editor-specific files)
 */
export type RuleSeverity = 'critical' | 'recommended' | 'optional';

/**
 * A single gitignore rule with metadata
 */
export interface GitIgnoreRule {
  /** The pattern to add to .gitignore (e.g., "node_modules/", "*.pyc") */
  pattern: string;
  /** How important it is to ignore this pattern */
  severity: RuleSeverity;
  /** Human-readable explanation of why this should be ignored */
  reason: string;
}

/**
 * Supported framework identifiers
 */
export type FrameworkId = 
  // JavaScript / TypeScript
  | 'node'
  | 'react'
  | 'nextjs'
  | 'vue'
  | 'angular'
  | 'vite'
  | 'svelte'
  // Python
  | 'python'
  | 'django'
  | 'flask'
  | 'fastapi'
  // Java
  | 'maven'
  | 'gradle';

/**
 * Result of framework detection
 */
export interface DetectedFramework {
  /** Unique identifier for the framework */
  id: FrameworkId;
  /** Human-readable name */
  name: string;
  /** Path to the detection source (e.g., package.json location) */
  detectedAt: string;
  /** Confidence level of detection (0-1) */
  confidence: number;
  /** The rule category to load */
  ruleCategory: 'node' | 'python' | 'java';
}

/**
 * Collection of rules for a framework category
 */
export interface RuleSet {
  /** Category identifier */
  category: string;
  /** Display name */
  name: string;
  /** Description of the rule set */
  description?: string;
  /** All rules in this category */
  rules: GitIgnoreRule[];
  /** Framework-specific rule overrides */
  frameworks?: {
    [key: string]: GitIgnoreRule[];
  };
}

/**
 * Result of scanning staged files
 */
export interface StagedFileWarning {
  /** Path to the risky file */
  filePath: string;
  /** The pattern that matched */
  matchedPattern: string;
  /** Severity of the warning */
  severity: RuleSeverity;
  /** Explanation of the risk */
  reason: string;
}

/**
 * User's decision for a warning
 */
export type UserDecision = 
  | 'add-to-gitignore'
  | 'ignore-once'
  | 'disable-warnings'
  | 'cancel';

/**
 * File watcher event types
 */
export interface RiskyFileEvent {
  /** Type of file system event */
  type: 'created' | 'renamed';
  /** Path to the file */
  filePath: string;
  /** The pattern that matched */
  matchedPattern: string;
  /** Rule that triggered the warning */
  rule: GitIgnoreRule;
}

/**
 * Extension configuration (mirrors package.json settings)
 */
export interface GitGuardConfig {
  enabled: boolean;
  autoSuggest: boolean;
  preCommitCheck: boolean;
  modifyGitignoreAutomatically: boolean;
  watchFileCreation: boolean;
  ignoredPatterns: string[];
  suppressedWarnings: string[];
}

/**
 * Result of .gitignore modification
 */
export interface GitIgnoreModificationResult {
  success: boolean;
  /** Path to the .gitignore file */
  filePath: string;
  /** Patterns that were added */
  addedPatterns: string[];
  /** Patterns that already existed */
  existingPatterns: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Workspace scan result
 */
export interface WorkspaceScanResult {
  /** Detected frameworks */
  frameworks: DetectedFramework[];
  /** Suggested rules based on detection */
  suggestedRules: GitIgnoreRule[];
  /** Files that match risky patterns */
  riskyFiles: string[];
  /** Whether .gitignore exists */
  hasGitignore: boolean;
  /** Missing critical patterns */
  missingCriticalPatterns: string[];
}
