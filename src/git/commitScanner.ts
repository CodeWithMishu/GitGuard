/**
 * GitGuard - Commit Scanner
 * 
 * Scans staged files before commit to detect sensitive files.
 * Uses VS Code's Git extension API.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { GitIgnoreRule, StagedFileWarning, RuleSeverity } from '../types';
import { RuleEngine } from '../rules';

// Git extension API types (subset we need)
interface GitExtension {
  getAPI(version: number): GitAPI;
}

interface GitAPI {
  repositories: Repository[];
  onDidOpenRepository: vscode.Event<Repository>;
}

interface Repository {
  rootUri: vscode.Uri;
  state: RepositoryState;
  inputBox: { value: string };
}

interface RepositoryState {
  indexChanges: Change[];
  workingTreeChanges: Change[];
  HEAD: Ref | undefined;
}

interface Change {
  uri: vscode.Uri;
  status: number;
}

interface Ref {
  name: string | undefined;
  commit: string | undefined;
}

/**
 * Scans commits for sensitive files
 */
export class CommitScanner {
  private outputChannel: vscode.OutputChannel;
  private ruleEngine: RuleEngine;
  private gitAPI: GitAPI | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(outputChannel: vscode.OutputChannel, ruleEngine: RuleEngine) {
    this.outputChannel = outputChannel;
    this.ruleEngine = ruleEngine;
  }

  /**
   * Initialize the commit scanner by getting the Git API
   */
  async initialize(): Promise<boolean> {
    try {
      const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
      
      if (!gitExtension) {
        this.log('Git extension not found', 'error');
        return false;
      }

      if (!gitExtension.isActive) {
        await gitExtension.activate();
      }

      this.gitAPI = gitExtension.exports.getAPI(1);
      this.log('Git API initialized successfully');
      return true;
    } catch (error) {
      this.log(`Failed to initialize Git API: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Get all repositories in the workspace
   */
  getRepositories(): Repository[] {
    return this.gitAPI?.repositories || [];
  }

  /**
   * Scan staged files in a repository for risky files
   */
  scanStagedFiles(repository: Repository, rules: GitIgnoreRule[]): StagedFileWarning[] {
    const warnings: StagedFileWarning[] = [];
    const rootPath = repository.rootUri.fsPath;

    for (const change of repository.state.indexChanges) {
      const filePath = change.uri.fsPath;
      const relativePath = path.relative(rootPath, filePath).replace(/\\/g, '/');
      const fileName = path.basename(filePath);

      // Check if file matches any rule
      const matchedRule = this.matchFile(relativePath, fileName, rules);
      
      if (matchedRule) {
        warnings.push({
          filePath: relativePath,
          matchedPattern: matchedRule.pattern,
          severity: matchedRule.severity,
          reason: matchedRule.reason,
        });
      }
    }

    return warnings;
  }

  /**
   * Scan all repositories for risky staged files
   */
  scanAllRepositories(rules: GitIgnoreRule[]): Map<string, StagedFileWarning[]> {
    const results = new Map<string, StagedFileWarning[]>();

    for (const repo of this.getRepositories()) {
      const warnings = this.scanStagedFiles(repo, rules);
      if (warnings.length > 0) {
        results.set(repo.rootUri.fsPath, warnings);
      }
    }

    return results;
  }

  /**
   * Check if a file matches any rule
   */
  private matchFile(
    relativePath: string,
    fileName: string,
    rules: GitIgnoreRule[]
  ): GitIgnoreRule | null {
    for (const rule of rules) {
      if (this.matchesPattern(relativePath, fileName, rule.pattern)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Check if a path matches a gitignore-style pattern
   */
  private matchesPattern(fullPath: string, fileName: string, pattern: string): boolean {
    const normalizedPattern = pattern.replace(/\/$/, '');
    
    // Exact filename match
    if (fileName === normalizedPattern) return true;
    
    // Exact path match
    if (fullPath === normalizedPattern) return true;
    
    // Path starts with pattern (directory)
    if (fullPath.startsWith(normalizedPattern + '/')) return true;
    
    // Path contains pattern as directory
    if (fullPath.includes('/' + normalizedPattern + '/')) return true;
    
    // Handle glob patterns
    if (pattern.includes('*')) {
      const regexPattern = this.globToRegex(pattern);
      const regex = new RegExp(regexPattern);
      return regex.test(fileName) || regex.test(fullPath);
    }
    
    // Check for .env files with any extension
    if (pattern === '.env' && (fileName === '.env' || fileName.startsWith('.env.'))) {
      return true;
    }
    
    return false;
  }

  /**
   * Convert glob pattern to regex
   */
  private globToRegex(glob: string): string {
    return '^' + glob
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.') + '$';
  }

  /**
   * Get critical warnings only
   */
  getCriticalWarnings(warnings: StagedFileWarning[]): StagedFileWarning[] {
    return warnings.filter(w => w.severity === 'critical');
  }

  /**
   * Format warnings for display
   */
  formatWarnings(warnings: StagedFileWarning[]): string {
    if (warnings.length === 0) return '';

    const lines: string[] = [];
    
    // Group by severity
    const critical = warnings.filter(w => w.severity === 'critical');
    const recommended = warnings.filter(w => w.severity === 'recommended');
    const optional = warnings.filter(w => w.severity === 'optional');

    if (critical.length > 0) {
      lines.push('🚨 CRITICAL (Security Risk):');
      for (const w of critical) {
        lines.push(`  • ${w.filePath}`);
        lines.push(`    Reason: ${w.reason}`);
      }
    }

    if (recommended.length > 0) {
      lines.push('');
      lines.push('⚠️ Recommended to ignore:');
      for (const w of recommended) {
        lines.push(`  • ${w.filePath}`);
      }
    }

    if (optional.length > 0) {
      lines.push('');
      lines.push('ℹ️ Optional:');
      for (const w of optional) {
        lines.push(`  • ${w.filePath}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Check if there are any staged files
   */
  hasStagedFiles(repository: Repository): boolean {
    return repository.state.indexChanges.length > 0;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  /**
   * Log a message
   */
  private log(message: string, level: 'info' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '[ERROR]' : '[INFO]';
    this.outputChannel.appendLine(`${timestamp} ${prefix} [CommitScanner] ${message}`);
  }
}
