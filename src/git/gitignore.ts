/**
 * GitGuard - .gitignore Handler
 * 
 * Safe, append-only management of .gitignore files.
 * NEVER deletes or reorders existing content.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { GitIgnoreRule, GitIgnoreModificationResult, DetectedFramework } from '../types';

/**
 * Manages .gitignore files safely
 */
export class GitIgnoreHandler {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * Check if .gitignore exists in the workspace
   */
  async exists(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
    const gitignorePath = this.getGitignorePath(workspaceFolder);
    try {
      await vscode.workspace.fs.stat(gitignorePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read the current .gitignore content
   */
  async read(workspaceFolder: vscode.WorkspaceFolder): Promise<string | null> {
    const gitignorePath = this.getGitignorePath(workspaceFolder);
    try {
      const content = await vscode.workspace.fs.readFile(gitignorePath);
      return Buffer.from(content).toString('utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Parse .gitignore and return existing patterns
   */
  async getExistingPatterns(workspaceFolder: vscode.WorkspaceFolder): Promise<Set<string>> {
    const content = await this.read(workspaceFolder);
    if (!content) return new Set();

    const patterns = new Set<string>();
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;
      // Normalize pattern (remove trailing slashes for comparison)
      patterns.add(this.normalizePattern(trimmed));
    }

    return patterns;
  }

  /**
   * Check which patterns are missing from .gitignore
   */
  async findMissingPatterns(
    workspaceFolder: vscode.WorkspaceFolder,
    rules: GitIgnoreRule[]
  ): Promise<GitIgnoreRule[]> {
    const existing = await this.getExistingPatterns(workspaceFolder);
    
    return rules.filter(rule => {
      const normalized = this.normalizePattern(rule.pattern);
      return !existing.has(normalized);
    });
  }

  /**
   * Add patterns to .gitignore (append-only)
   * 
   * This method NEVER:
   * - Deletes existing content
   * - Reorders existing lines
   * - Modifies existing patterns
   * 
   * It only appends new patterns that don't already exist.
   */
  async addPatterns(
    workspaceFolder: vscode.WorkspaceFolder,
    rules: GitIgnoreRule[],
    frameworkName?: string
  ): Promise<GitIgnoreModificationResult> {
    const gitignorePath = this.getGitignorePath(workspaceFolder);
    const existing = await this.getExistingPatterns(workspaceFolder);
    
    const toAdd: GitIgnoreRule[] = [];
    const alreadyExists: string[] = [];

    // Determine which patterns need to be added
    for (const rule of rules) {
      const normalized = this.normalizePattern(rule.pattern);
      if (existing.has(normalized)) {
        alreadyExists.push(rule.pattern);
      } else {
        toAdd.push(rule);
      }
    }

    // If nothing to add, return early
    if (toAdd.length === 0) {
      return {
        success: true,
        filePath: gitignorePath.fsPath,
        addedPatterns: [],
        existingPatterns: alreadyExists,
      };
    }

    try {
      // Read current content
      let currentContent = await this.read(workspaceFolder) || '';
      
      // Ensure file ends with newline
      if (currentContent && !currentContent.endsWith('\n')) {
        currentContent += '\n';
      }

      // Build new content to append
      const newLines: string[] = [];
      
      // Add blank line separator if file has content
      if (currentContent.trim()) {
        newLines.push('');
      }

      // Add header comment
      const header = frameworkName 
        ? `# Added by GitGuard (${frameworkName})`
        : '# Added by GitGuard';
      newLines.push(header);

      // Add patterns with their reasons as comments
      for (const rule of toAdd) {
        // Add reason as comment for critical rules
        if (rule.severity === 'critical') {
          newLines.push(`# ${rule.reason}`);
        }
        newLines.push(rule.pattern);
      }

      // Write updated content
      const newContent = currentContent + newLines.join('\n') + '\n';
      await vscode.workspace.fs.writeFile(
        gitignorePath,
        Buffer.from(newContent, 'utf-8')
      );

      this.log(`Added ${toAdd.length} patterns to .gitignore`);

      return {
        success: true,
        filePath: gitignorePath.fsPath,
        addedPatterns: toAdd.map(r => r.pattern),
        existingPatterns: alreadyExists,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to update .gitignore: ${errorMessage}`, 'error');
      
      return {
        success: false,
        filePath: gitignorePath.fsPath,
        addedPatterns: [],
        existingPatterns: alreadyExists,
        error: errorMessage,
      };
    }
  }

  /**
   * Add a single pattern to .gitignore
   */
  async addPattern(
    workspaceFolder: vscode.WorkspaceFolder,
    pattern: string,
    reason?: string
  ): Promise<GitIgnoreModificationResult> {
    const rule: GitIgnoreRule = {
      pattern,
      severity: 'recommended',
      reason: reason || 'Added by user',
    };
    return this.addPatterns(workspaceFolder, [rule]);
  }

  /**
   * Create a new .gitignore file with initial patterns
   */
  async create(
    workspaceFolder: vscode.WorkspaceFolder,
    rules: GitIgnoreRule[],
    detections: DetectedFramework[]
  ): Promise<GitIgnoreModificationResult> {
    const gitignorePath = this.getGitignorePath(workspaceFolder);

    // Check if file already exists
    if (await this.exists(workspaceFolder)) {
      // File exists, use addPatterns instead
      const frameworks = detections.map(d => d.name).join(', ');
      return this.addPatterns(workspaceFolder, rules, frameworks);
    }

    try {
      const lines: string[] = [];

      // Add header
      lines.push('# GitGuard - Auto-generated .gitignore');
      lines.push(`# Detected frameworks: ${detections.map(d => d.name).join(', ')}`);
      lines.push(`# Generated on: ${new Date().toISOString()}`);
      lines.push('');

      // Group rules by severity
      const critical = rules.filter(r => r.severity === 'critical');
      const recommended = rules.filter(r => r.severity === 'recommended');
      const optional = rules.filter(r => r.severity === 'optional');

      // Add critical rules
      if (critical.length > 0) {
        lines.push('# === Critical (Security) ===');
        for (const rule of critical) {
          lines.push(`# ${rule.reason}`);
          lines.push(rule.pattern);
        }
        lines.push('');
      }

      // Add recommended rules
      if (recommended.length > 0) {
        lines.push('# === Recommended ===');
        for (const rule of recommended) {
          lines.push(rule.pattern);
        }
        lines.push('');
      }

      // Add optional rules
      if (optional.length > 0) {
        lines.push('# === Optional ===');
        for (const rule of optional) {
          lines.push(rule.pattern);
        }
        lines.push('');
      }

      const content = lines.join('\n');
      await vscode.workspace.fs.writeFile(
        gitignorePath,
        Buffer.from(content, 'utf-8')
      );

      this.log(`Created .gitignore with ${rules.length} patterns`);

      return {
        success: true,
        filePath: gitignorePath.fsPath,
        addedPatterns: rules.map(r => r.pattern),
        existingPatterns: [],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to create .gitignore: ${errorMessage}`, 'error');
      
      return {
        success: false,
        filePath: gitignorePath.fsPath,
        addedPatterns: [],
        existingPatterns: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Check if a file path is covered by .gitignore
   */
  async isIgnored(workspaceFolder: vscode.WorkspaceFolder, filePath: string): Promise<boolean> {
    const patterns = await this.getExistingPatterns(workspaceFolder);
    const relativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const fileName = path.basename(normalizedPath);

    for (const pattern of patterns) {
      if (this.matchesPattern(normalizedPath, fileName, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get path to .gitignore file
   */
  private getGitignorePath(workspaceFolder: vscode.WorkspaceFolder): vscode.Uri {
    return vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, '.gitignore'));
  }

  /**
   * Normalize a pattern for comparison
   */
  private normalizePattern(pattern: string): string {
    return pattern.trim().replace(/\/+$/, '');
  }

  /**
   * Check if a file matches a gitignore pattern
   */
  private matchesPattern(fullPath: string, fileName: string, pattern: string): boolean {
    const normalizedPattern = pattern.replace(/\/$/, '');
    
    // Exact filename match
    if (fileName === normalizedPattern) return true;
    
    // Path contains pattern
    if (fullPath.includes(normalizedPattern)) return true;
    
    // Handle glob patterns
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(fileName) || regex.test(fullPath);
    }
    
    return false;
  }

  /**
   * Log a message
   */
  private log(message: string, level: 'info' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '[ERROR]' : '[INFO]';
    this.outputChannel.appendLine(`${timestamp} ${prefix} [GitIgnore] ${message}`);
  }
}
