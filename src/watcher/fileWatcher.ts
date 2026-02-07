/**
 * GitGuard - File Watcher
 * 
 * Monitors file system for creation of risky files.
 * Provides real-time warnings with actionable suggestions.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { GitIgnoreRule, RiskyFileEvent, GitGuardConfig } from '../types';
import { RuleEngine } from '../rules';
import { GitIgnoreHandler } from '../git/gitignore';
import { NotificationManager } from '../ui/notifications';

/**
 * Watches for risky file creation
 */
export class FileWatcher {
  private outputChannel: vscode.OutputChannel;
  private ruleEngine: RuleEngine;
  private gitignoreHandler: GitIgnoreHandler;
  private notificationManager: NotificationManager;
  
  private watcher: vscode.FileSystemWatcher | null = null;
  private disposables: vscode.Disposable[] = [];
  
  // Debounce notifications for batch file creation
  private pendingNotifications: Map<string, RiskyFileEvent> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly debounceDelay = 500; // ms

  // Current rules to check against
  private activeRules: GitIgnoreRule[] = [];

  // Track permanently dismissed patterns
  private permanentlyDismissed: Set<string> = new Set();

  constructor(
    outputChannel: vscode.OutputChannel,
    ruleEngine: RuleEngine,
    gitignoreHandler: GitIgnoreHandler,
    notificationManager: NotificationManager
  ) {
    this.outputChannel = outputChannel;
    this.ruleEngine = ruleEngine;
    this.gitignoreHandler = gitignoreHandler;
    this.notificationManager = notificationManager;
  }

  /**
   * Start watching for file creation
   */
  start(rules: GitIgnoreRule[]): void {
    this.activeRules = rules;
    
    // Stop existing watcher
    this.stop();

    // Create file system watcher for all files
    this.watcher = vscode.workspace.createFileSystemWatcher(
      '**/*',
      false, // Don't ignore creates
      true,  // Ignore changes
      true   // Ignore deletes
    );

    // Handle file creation
    this.disposables.push(
      this.watcher.onDidCreate(uri => this.handleFileCreated(uri))
    );

    this.log('File watcher started');
  }

  /**
   * Update the rules being watched for
   */
  updateRules(rules: GitIgnoreRule[]): void {
    this.activeRules = rules;
    this.log(`Updated watcher with ${rules.length} rules`);
  }

  /**
   * Handle file creation event
   */
  private async handleFileCreated(uri: vscode.Uri): Promise<void> {
    // Skip if no rules
    if (this.activeRules.length === 0) return;

    // Get workspace folder
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) return;

    // Get relative path
    const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const fileName = path.basename(uri.fsPath);

    // Skip if already in .gitignore
    const isIgnored = await this.gitignoreHandler.isIgnored(workspaceFolder, uri.fsPath);
    if (isIgnored) return;

    // Check against rules
    const matchedRule = this.matchAgainstRules(normalizedPath, fileName);
    if (!matchedRule) return;

    // Skip if permanently dismissed
    if (this.permanentlyDismissed.has(matchedRule.pattern)) return;

    // Check user settings for suppressed warnings
    const config = this.getConfig();
    if (config.suppressedWarnings.includes(matchedRule.pattern)) return;

    // Create event
    const event: RiskyFileEvent = {
      type: 'created',
      filePath: normalizedPath,
      matchedPattern: matchedRule.pattern,
      rule: matchedRule,
    };

    // Queue notification (debounced)
    this.queueNotification(event);
  }

  /**
   * Match file against rules
   */
  private matchAgainstRules(relativePath: string, fileName: string): GitIgnoreRule | null {
    for (const rule of this.activeRules) {
      if (this.matchesPattern(relativePath, fileName, rule.pattern)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Check if path matches pattern
   */
  private matchesPattern(fullPath: string, fileName: string, pattern: string): boolean {
    const normalizedPattern = pattern.replace(/\/$/, '');
    
    // Exact filename match
    if (fileName === normalizedPattern) return true;
    
    // .env variations
    if (normalizedPattern === '.env') {
      if (fileName === '.env' || fileName.startsWith('.env.')) return true;
    }
    
    // Path contains pattern as directory
    if (fullPath.includes('/' + normalizedPattern + '/')) return true;
    if (fullPath.startsWith(normalizedPattern + '/')) return true;
    
    // Glob patterns
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*');
      const regex = new RegExp(`(^|/)${regexPattern}$`);
      return regex.test(fullPath) || regex.test(fileName);
    }
    
    return false;
  }

  /**
   * Queue notification with debounce
   */
  private queueNotification(event: RiskyFileEvent): void {
    this.pendingNotifications.set(event.filePath, event);
    
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.processPendingNotifications();
    }, this.debounceDelay);
  }

  /**
   * Process queued notifications
   */
  private async processPendingNotifications(): Promise<void> {
    const events = Array.from(this.pendingNotifications.values());
    this.pendingNotifications.clear();

    if (events.length === 0) return;

    // If multiple files, show consolidated notification
    if (events.length > 1) {
      await this.showBatchNotification(events);
    } else {
      await this.showSingleNotification(events[0]);
    }
  }

  /**
   * Show notification for single file
   */
  private async showSingleNotification(event: RiskyFileEvent): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const decision = await this.notificationManager.showRiskyFileWarning(event);

    switch (decision) {
      case 'add-to-gitignore':
        await this.gitignoreHandler.addPattern(
          workspaceFolder,
          event.rule.pattern,
          event.rule.reason
        );
        this.notificationManager.showInfo(`Added "${event.rule.pattern}" to .gitignore`);
        break;
      
      case 'disable-warnings':
        this.permanentlyDismissed.add(event.matchedPattern);
        await this.addToSuppressedWarnings(event.matchedPattern);
        break;
      
      case 'ignore-once':
        // Do nothing, already ignored for this session
        break;
    }
  }

  /**
   * Show consolidated notification for multiple files
   */
  private async showBatchNotification(events: RiskyFileEvent[]): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    // Group by pattern
    const byPattern = new Map<string, RiskyFileEvent[]>();
    for (const event of events) {
      const existing = byPattern.get(event.matchedPattern) || [];
      existing.push(event);
      byPattern.set(event.matchedPattern, existing);
    }

    const patternCount = byPattern.size;
    const fileCount = events.length;

    const message = `GitGuard: ${fileCount} risky file(s) detected matching ${patternCount} pattern(s)`;
    
    const result = await vscode.window.showWarningMessage(
      message,
      'Add All to .gitignore',
      'View Details',
      'Ignore'
    );

    switch (result) {
      case 'Add All to .gitignore':
        const uniqueRules = Array.from(byPattern.keys()).map(pattern => {
          const event = byPattern.get(pattern)![0];
          return event.rule;
        });
        await this.gitignoreHandler.addPatterns(workspaceFolder, uniqueRules);
        this.notificationManager.showInfo(`Added ${uniqueRules.length} pattern(s) to .gitignore`);
        break;
      
      case 'View Details':
        this.showBatchDetails(events);
        break;
    }
  }

  /**
   * Show batch details in output channel
   */
  private showBatchDetails(events: RiskyFileEvent[]): void {
    this.outputChannel.clear();
    this.outputChannel.appendLine('═══════════════════════════════════════════════════════════');
    this.outputChannel.appendLine('  GitGuard - Risky Files Detected');
    this.outputChannel.appendLine('═══════════════════════════════════════════════════════════');
    this.outputChannel.appendLine('');

    // Group by severity
    const critical = events.filter(e => e.rule.severity === 'critical');
    const recommended = events.filter(e => e.rule.severity === 'recommended');
    const optional = events.filter(e => e.rule.severity === 'optional');

    if (critical.length > 0) {
      this.outputChannel.appendLine('🚨 CRITICAL:');
      for (const e of critical) {
        this.outputChannel.appendLine(`  • ${e.filePath}`);
        this.outputChannel.appendLine(`    Reason: ${e.rule.reason}`);
      }
      this.outputChannel.appendLine('');
    }

    if (recommended.length > 0) {
      this.outputChannel.appendLine('⚠️ RECOMMENDED:');
      for (const e of recommended) {
        this.outputChannel.appendLine(`  • ${e.filePath}`);
      }
      this.outputChannel.appendLine('');
    }

    if (optional.length > 0) {
      this.outputChannel.appendLine('ℹ️ OPTIONAL:');
      for (const e of optional) {
        this.outputChannel.appendLine(`  • ${e.filePath}`);
      }
    }

    this.outputChannel.show();
  }

  /**
   * Add pattern to suppressed warnings in settings
   */
  private async addToSuppressedWarnings(pattern: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('gitGuard');
    const current = config.get<string[]>('suppressedWarnings') || [];
    
    if (!current.includes(pattern)) {
      current.push(pattern);
      await config.update('suppressedWarnings', current, vscode.ConfigurationTarget.Workspace);
    }
  }

  /**
   * Get current configuration
   */
  private getConfig(): GitGuardConfig {
    const config = vscode.workspace.getConfiguration('gitGuard');
    return {
      enabled: config.get('enabled', true),
      autoSuggest: config.get('autoSuggest', true),
      preCommitCheck: config.get('preCommitCheck', true),
      modifyGitignoreAutomatically: config.get('modifyGitignoreAutomatically', false),
      watchFileCreation: config.get('watchFileCreation', true),
      ignoredPatterns: config.get('ignoredPatterns', []),
      suppressedWarnings: config.get('suppressedWarnings', []),
    };
  }

  /**
   * Stop the file watcher
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.pendingNotifications.clear();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = null;
    }

    this.log('File watcher stopped');
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.stop();
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`${timestamp} [INFO] [FileWatcher] ${message}`);
  }
}
