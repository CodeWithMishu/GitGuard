/**
 * GitGuard - Notification UI
 * 
 * User-friendly notifications with clear explanations and actions.
 * Follows UX principles: no spam, explain why, always ask.
 */

import * as vscode from 'vscode';
import { 
  DetectedFramework, 
  GitIgnoreRule, 
  StagedFileWarning,
  RiskyFileEvent,
  UserDecision 
} from '../types';

/**
 * Action items for notifications
 */
interface NotificationAction {
  title: string;
  action: UserDecision | 'view-details' | 'open-gitignore' | 'run-scan' | 'dismiss';
}

/**
 * Manages user notifications
 */
export class NotificationManager {
  private outputChannel: vscode.OutputChannel;
  
  // Track suppressed warnings to avoid spam
  private sessionSuppressed: Set<string> = new Set();

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * Show notification when frameworks are detected
   */
  async showFrameworksDetected(
    frameworks: DetectedFramework[],
    missingRules: GitIgnoreRule[]
  ): Promise<'suggest' | 'ignore' | 'dismiss'> {
    const frameworkNames = frameworks.map(f => f.name).join(', ');
    const criticalCount = missingRules.filter(r => r.severity === 'critical').length;
    
    let message = `GitGuard detected: ${frameworkNames}`;
    
    if (criticalCount > 0) {
      message += `\n\n⚠️ ${criticalCount} critical pattern(s) missing from .gitignore`;
    } else if (missingRules.length > 0) {
      message += `\n\n${missingRules.length} recommended pattern(s) can be added to .gitignore`;
    }

    const actions = ['Suggest Rules', 'Ignore', 'Dismiss'];
    
    const result = await vscode.window.showInformationMessage(
      message,
      { modal: false },
      ...actions
    );

    switch (result) {
      case 'Suggest Rules':
        return 'suggest';
      case 'Ignore':
        return 'ignore';
      default:
        return 'dismiss';
    }
  }

  /**
   * Show quick pick for selecting rules to add
   */
  async showRuleSelection(rules: GitIgnoreRule[]): Promise<GitIgnoreRule[]> {
    // Group rules by severity for better UX
    const items: vscode.QuickPickItem[] = rules.map(rule => ({
      label: rule.pattern,
      description: this.getSeverityIcon(rule.severity) + ' ' + rule.severity,
      detail: rule.reason,
      picked: rule.severity === 'critical' || rule.severity === 'recommended',
    }));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Select patterns to add to .gitignore',
      title: 'GitGuard: Add to .gitignore',
    });

    if (!selected) return [];

    // Map back to rules
    const selectedPatterns = new Set(selected.map(s => s.label));
    return rules.filter(r => selectedPatterns.has(r.pattern));
  }

  /**
   * Show warning when risky file is created
   */
  async showRiskyFileWarning(event: RiskyFileEvent): Promise<UserDecision> {
    // Check if suppressed
    if (this.sessionSuppressed.has(event.matchedPattern)) {
      return 'ignore-once';
    }

    const severityIcon = this.getSeverityIcon(event.rule.severity);
    const message = `${severityIcon} GitGuard: "${event.filePath}" should be in .gitignore`;
    const detail = event.rule.reason;

    const actions: NotificationAction[] = [
      { title: 'Add to .gitignore', action: 'add-to-gitignore' },
      { title: 'Ignore Once', action: 'ignore-once' },
      { title: 'Don\'t Warn Again', action: 'disable-warnings' },
    ];

    const result = await vscode.window.showWarningMessage(
      `${message}\n\n${detail}`,
      ...actions.map(a => a.title)
    );

    switch (result) {
      case 'Add to .gitignore':
        return 'add-to-gitignore';
      case 'Ignore Once':
        return 'ignore-once';
      case 'Don\'t Warn Again':
        this.sessionSuppressed.add(event.matchedPattern);
        return 'disable-warnings';
      default:
        return 'cancel';
    }
  }

  /**
   * Show pre-commit warning for staged risky files
   */
  async showPreCommitWarning(warnings: StagedFileWarning[]): Promise<'block' | 'fix' | 'proceed' | 'cancel'> {
    const critical = warnings.filter(w => w.severity === 'critical');
    const recommended = warnings.filter(w => w.severity === 'recommended');

    let message: string;
    
    if (critical.length > 0) {
      message = `🚨 SECURITY RISK: ${critical.length} sensitive file(s) staged for commit!`;
    } else {
      message = `⚠️ ${recommended.length} file(s) are typically excluded from version control`;
    }

    // Build detailed message
    const details: string[] = [];
    
    if (critical.length > 0) {
      details.push('Critical files:');
      for (const w of critical.slice(0, 3)) {
        details.push(`  • ${w.filePath}: ${w.reason}`);
      }
      if (critical.length > 3) {
        details.push(`  ... and ${critical.length - 3} more`);
      }
    }

    if (recommended.length > 0 && critical.length === 0) {
      details.push('Files to review:');
      for (const w of recommended.slice(0, 3)) {
        details.push(`  • ${w.filePath}`);
      }
      if (recommended.length > 3) {
        details.push(`  ... and ${recommended.length - 3} more`);
      }
    }

    // For critical files, use modal dialog
    if (critical.length > 0) {
      const result = await vscode.window.showErrorMessage(
        message + '\n\n' + details.join('\n'),
        { modal: true },
        'Fix & Add to .gitignore',
        'View Details',
        'Proceed Anyway'
      );

      switch (result) {
        case 'Fix & Add to .gitignore':
          return 'fix';
        case 'View Details':
          this.showDetailedWarnings(warnings);
          return 'cancel';
        case 'Proceed Anyway':
          return 'proceed';
        default:
          return 'cancel';
      }
    } else {
      // For recommended, use warning (non-modal)
      const result = await vscode.window.showWarningMessage(
        message,
        'Add to .gitignore',
        'View Details',
        'Proceed'
      );

      switch (result) {
        case 'Add to .gitignore':
          return 'fix';
        case 'View Details':
          this.showDetailedWarnings(warnings);
          return 'cancel';
        case 'Proceed':
          return 'proceed';
        default:
          return 'cancel';
      }
    }
  }

  /**
   * Show detailed warnings in output channel
   */
  showDetailedWarnings(warnings: StagedFileWarning[]): void {
    this.outputChannel.clear();
    this.outputChannel.appendLine('═══════════════════════════════════════════════════════════');
    this.outputChannel.appendLine('  GitGuard - Staged File Analysis');
    this.outputChannel.appendLine('═══════════════════════════════════════════════════════════');
    this.outputChannel.appendLine('');

    const critical = warnings.filter(w => w.severity === 'critical');
    const recommended = warnings.filter(w => w.severity === 'recommended');
    const optional = warnings.filter(w => w.severity === 'optional');

    if (critical.length > 0) {
      this.outputChannel.appendLine('🚨 CRITICAL - Security Risk:');
      this.outputChannel.appendLine('─────────────────────────────');
      for (const w of critical) {
        this.outputChannel.appendLine(`  File: ${w.filePath}`);
        this.outputChannel.appendLine(`  Pattern: ${w.matchedPattern}`);
        this.outputChannel.appendLine(`  Reason: ${w.reason}`);
        this.outputChannel.appendLine('');
      }
    }

    if (recommended.length > 0) {
      this.outputChannel.appendLine('⚠️ RECOMMENDED - Best Practice:');
      this.outputChannel.appendLine('────────────────────────────────');
      for (const w of recommended) {
        this.outputChannel.appendLine(`  File: ${w.filePath}`);
        this.outputChannel.appendLine(`  Pattern: ${w.matchedPattern}`);
        this.outputChannel.appendLine(`  Reason: ${w.reason}`);
        this.outputChannel.appendLine('');
      }
    }

    if (optional.length > 0) {
      this.outputChannel.appendLine('ℹ️ OPTIONAL - Consider Ignoring:');
      this.outputChannel.appendLine('─────────────────────────────────');
      for (const w of optional) {
        this.outputChannel.appendLine(`  File: ${w.filePath}`);
        this.outputChannel.appendLine(`  Pattern: ${w.matchedPattern}`);
        this.outputChannel.appendLine('');
      }
    }

    this.outputChannel.show();
  }

  /**
   * Show success message after adding patterns
   */
  async showPatternsAdded(patterns: string[], alreadyExisted: string[]): Promise<void> {
    if (patterns.length === 0 && alreadyExisted.length > 0) {
      vscode.window.showInformationMessage(
        `GitGuard: All ${alreadyExisted.length} pattern(s) already in .gitignore`
      );
      return;
    }

    const message = `GitGuard: Added ${patterns.length} pattern(s) to .gitignore`;
    const result = await vscode.window.showInformationMessage(
      message,
      'Open .gitignore'
    );

    if (result === 'Open .gitignore') {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const gitignorePath = vscode.Uri.joinPath(workspaceFolder.uri, '.gitignore');
        const doc = await vscode.workspace.openTextDocument(gitignorePath);
        await vscode.window.showTextDocument(doc);
      }
    }
  }

  /**
   * Show error message
   */
  showError(message: string, error?: Error): void {
    const fullMessage = error 
      ? `GitGuard: ${message} - ${error.message}`
      : `GitGuard: ${message}`;
    
    vscode.window.showErrorMessage(fullMessage);
    this.outputChannel.appendLine(`[ERROR] ${fullMessage}`);
  }

  /**
   * Show info message
   */
  showInfo(message: string): void {
    vscode.window.showInformationMessage(`GitGuard: ${message}`);
  }

  /**
   * Get severity icon
   */
  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'recommended':
        return '⚠️';
      case 'optional':
        return 'ℹ️';
      default:
        return '•';
    }
  }

  /**
   * Clear session-suppressed warnings
   */
  clearSuppressed(): void {
    this.sessionSuppressed.clear();
  }
}
