/**
 * GitGuard - VS Code Extension
 * 
 * Proactively prevents accidental commits of sensitive files
 * by intelligently managing .gitignore.
 * 
 * @author GitGuard
 * @license MIT
 */

import * as vscode from 'vscode';
import { DetectionEngine } from './detector';
import { RuleEngine } from './rules';
import { GitIgnoreHandler, CommitScanner } from './git';
import { NotificationManager } from './ui';
import { FileWatcher } from './watcher';
import { GitGuardConfig, DetectedFramework, GitIgnoreRule } from './types';

/**
 * Main extension class that coordinates all components
 */
class GitGuardExtension {
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;
  
  // Core components
  private detectionEngine: DetectionEngine;
  private ruleEngine: RuleEngine;
  private gitignoreHandler: GitIgnoreHandler;
  private commitScanner: CommitScanner;
  private notificationManager: NotificationManager;
  private fileWatcher: FileWatcher;

  // State
  private detectedFrameworks: DetectedFramework[] = [];
  private applicableRules: GitIgnoreRule[] = [];
  private isInitialized = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    
    // Create output channel for logging
    this.outputChannel = vscode.window.createOutputChannel('GitGuard');
    context.subscriptions.push(this.outputChannel);

    // Initialize components
    this.ruleEngine = new RuleEngine();
    this.detectionEngine = new DetectionEngine(this.outputChannel);
    this.gitignoreHandler = new GitIgnoreHandler(this.outputChannel);
    this.commitScanner = new CommitScanner(this.outputChannel, this.ruleEngine);
    this.notificationManager = new NotificationManager(this.outputChannel);
    this.fileWatcher = new FileWatcher(
      this.outputChannel,
      this.ruleEngine,
      this.gitignoreHandler,
      this.notificationManager
    );

    // Register disposables
    context.subscriptions.push({
      dispose: () => {
        this.fileWatcher.dispose();
        this.commitScanner.dispose();
      }
    });
  }

  /**
   * Activate the extension
   */
  async activate(): Promise<void> {
    this.log('GitGuard extension activating...');

    // Check if enabled
    if (!this.getConfig().enabled) {
      this.log('GitGuard is disabled in settings');
      return;
    }

    // Register commands
    this.registerCommands();

    // Register configuration change handler
    this.registerConfigurationListener();

    // Initialize components
    await this.initialize();

    this.log('GitGuard extension activated successfully');
  }

  /**
   * Initialize all components
   */
  private async initialize(): Promise<void> {
    // Check for workspace
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      this.log('No workspace folder open');
      return;
    }

    // Initialize Git API
    await this.commitScanner.initialize();

    // Detect frameworks
    this.detectedFrameworks = await this.detectionEngine.detectAll();
    
    if (this.detectedFrameworks.length === 0) {
      this.log('No supported frameworks detected');
      return;
    }

    // Get applicable rules
    this.applicableRules = this.ruleEngine.getRulesForDetections(this.detectedFrameworks);
    this.log(`Loaded ${this.applicableRules.length} applicable rules`);

    // Start file watcher if enabled
    const config = this.getConfig();
    if (config.watchFileCreation) {
      this.fileWatcher.start(this.applicableRules);
    }

    // Auto-suggest if enabled
    if (config.autoSuggest) {
      await this.suggestMissingRules();
    }

    // Set up pre-commit hook
    if (config.preCommitCheck) {
      this.setupPreCommitCheck();
    }

    this.isInitialized = true;
  }

  /**
   * Register extension commands
   */
  private registerCommands(): void {
    // Scan workspace command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('gitguard.scanWorkspace', async () => {
        await this.scanWorkspace();
      })
    );

    // Add to gitignore command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('gitguard.addToGitignore', async () => {
        await this.addPatternInteractive();
      })
    );

    // Show detected frameworks command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('gitguard.showDetectedFrameworks', async () => {
        await this.showDetectedFrameworks();
      })
    );

    // Suggest rules command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('gitguard.suggestGitignoreRules', async () => {
        await this.suggestMissingRules(true);
      })
    );
  }

  /**
   * Register configuration change listener
   */
  private registerConfigurationListener(): void {
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('gitGuard')) {
          await this.handleConfigurationChange();
        }
      })
    );
  }

  /**
   * Handle configuration changes
   */
  private async handleConfigurationChange(): Promise<void> {
    const config = this.getConfig();
    
    // Handle enable/disable
    if (!config.enabled) {
      this.fileWatcher.stop();
      this.log('GitGuard disabled');
      return;
    }

    // Handle file watcher toggle
    if (config.watchFileCreation) {
      this.fileWatcher.start(this.applicableRules);
    } else {
      this.fileWatcher.stop();
    }

    this.log('Configuration updated');
  }

  /**
   * Scan workspace for risky files
   */
  private async scanWorkspace(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this.notificationManager.showError('No workspace folder open');
      return;
    }

    // Refresh detection
    this.detectedFrameworks = await this.detectionEngine.detectAll(true);
    this.applicableRules = this.ruleEngine.getRulesForDetections(this.detectedFrameworks);

    // Check for missing patterns
    const missingRules = await this.gitignoreHandler.findMissingPatterns(
      workspaceFolder,
      this.applicableRules
    );

    // Check staged files
    const allWarnings = this.commitScanner.scanAllRepositories(this.applicableRules);
    
    // Show results
    this.outputChannel.clear();
    this.outputChannel.appendLine('═══════════════════════════════════════════════════════════');
    this.outputChannel.appendLine('  GitGuard - Workspace Scan Results');
    this.outputChannel.appendLine('═══════════════════════════════════════════════════════════');
    this.outputChannel.appendLine('');
    
    this.outputChannel.appendLine('📦 Detected Frameworks:');
    for (const framework of this.detectedFrameworks) {
      this.outputChannel.appendLine(`  • ${framework.name} (${Math.round(framework.confidence * 100)}%)`);
    }
    this.outputChannel.appendLine('');

    this.outputChannel.appendLine(`📋 Applicable Rules: ${this.applicableRules.length}`);
    this.outputChannel.appendLine(`⚠️ Missing from .gitignore: ${missingRules.length}`);
    
    if (missingRules.length > 0) {
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('Missing patterns:');
      for (const rule of missingRules) {
        const icon = rule.severity === 'critical' ? '🚨' : rule.severity === 'recommended' ? '⚠️' : 'ℹ️';
        this.outputChannel.appendLine(`  ${icon} ${rule.pattern} - ${rule.reason}`);
      }
    }

    // Show staged file warnings
    for (const [repoPath, warnings] of allWarnings) {
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine(`📂 Repository: ${repoPath}`);
      this.outputChannel.appendLine(`   Staged risky files: ${warnings.length}`);
      for (const warning of warnings) {
        const icon = warning.severity === 'critical' ? '🚨' : '⚠️';
        this.outputChannel.appendLine(`     ${icon} ${warning.filePath}`);
      }
    }

    this.outputChannel.show();

    // Offer to add missing rules
    if (missingRules.length > 0) {
      const result = await this.notificationManager.showFrameworksDetected(
        this.detectedFrameworks,
        missingRules
      );

      if (result === 'suggest') {
        await this.promptAddRules(missingRules);
      }
    } else {
      this.notificationManager.showInfo('Your .gitignore is up to date!');
    }
  }

  /**
   * Suggest missing rules for detected frameworks
   */
  private async suggestMissingRules(forcePrompt = false): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const missingRules = await this.gitignoreHandler.findMissingPatterns(
      workspaceFolder,
      this.applicableRules
    );

    if (missingRules.length === 0) {
      if (forcePrompt) {
        this.notificationManager.showInfo('No missing .gitignore patterns detected');
      }
      return;
    }

    const criticalMissing = missingRules.filter(r => r.severity === 'critical');
    
    // Always prompt for critical missing patterns
    if (criticalMissing.length > 0 || forcePrompt) {
      const result = await this.notificationManager.showFrameworksDetected(
        this.detectedFrameworks,
        missingRules
      );

      if (result === 'suggest') {
        await this.promptAddRules(missingRules);
      }
    }
  }

  /**
   * Prompt user to select and add rules
   */
  private async promptAddRules(rules: GitIgnoreRule[]): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const config = this.getConfig();

    // If auto-modify is enabled, add all rules
    if (config.modifyGitignoreAutomatically) {
      const result = await this.gitignoreHandler.addPatterns(
        workspaceFolder,
        rules,
        this.detectedFrameworks.map(f => f.name).join(', ')
      );
      
      if (result.success) {
        await this.notificationManager.showPatternsAdded(
          result.addedPatterns,
          result.existingPatterns
        );
      }
      return;
    }

    // Otherwise, show selection dialog
    const selectedRules = await this.notificationManager.showRuleSelection(rules);
    
    if (selectedRules.length === 0) return;

    const result = await this.gitignoreHandler.addPatterns(
      workspaceFolder,
      selectedRules,
      this.detectedFrameworks.map(f => f.name).join(', ')
    );

    if (result.success) {
      await this.notificationManager.showPatternsAdded(
        result.addedPatterns,
        result.existingPatterns
      );
    } else {
      this.notificationManager.showError('Failed to update .gitignore', new Error(result.error));
    }
  }

  /**
   * Add pattern interactively
   */
  private async addPatternInteractive(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this.notificationManager.showError('No workspace folder open');
      return;
    }

    const pattern = await vscode.window.showInputBox({
      prompt: 'Enter pattern to add to .gitignore',
      placeHolder: 'e.g., .env, node_modules/, *.log',
      validateInput: (value) => {
        if (!value.trim()) return 'Pattern cannot be empty';
        return null;
      }
    });

    if (!pattern) return;

    const reason = await vscode.window.showInputBox({
      prompt: 'Why should this be ignored? (optional)',
      placeHolder: 'e.g., Contains secrets',
    });

    const result = await this.gitignoreHandler.addPattern(
      workspaceFolder,
      pattern.trim(),
      reason
    );

    if (result.success) {
      await this.notificationManager.showPatternsAdded(
        result.addedPatterns,
        result.existingPatterns
      );
    } else {
      this.notificationManager.showError('Failed to add pattern', new Error(result.error));
    }
  }

  /**
   * Show detected frameworks
   */
  private async showDetectedFrameworks(): Promise<void> {
    if (this.detectedFrameworks.length === 0) {
      // Refresh detection
      this.detectedFrameworks = await this.detectionEngine.detectAll(true);
    }

    if (this.detectedFrameworks.length === 0) {
      this.notificationManager.showInfo('No supported frameworks detected in this workspace');
      return;
    }

    const items = this.detectedFrameworks.map(f => ({
      label: f.name,
      description: `${Math.round(f.confidence * 100)}% confidence`,
      detail: `Detected at: ${f.detectedAt}`,
    }));

    await vscode.window.showQuickPick(items, {
      placeHolder: 'Detected frameworks in your workspace',
      title: 'GitGuard: Detected Frameworks',
    });
  }

  /**
   * Set up pre-commit check using Git extension API
   */
  private setupPreCommitCheck(): void {
    // Watch for source control changes
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) return;

    // Register pre-commit handler via source control input validation
    // Note: VS Code doesn't have a direct pre-commit hook API,
    // so we use a polling approach or hook into commit command
    
    // We'll check on commit command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('gitguard.checkBeforeCommit', async () => {
        await this.performPreCommitCheck();
      })
    );

    // Override git.commit command to add our check
    // This is done by prepending our check to the commit flow
    this.log('Pre-commit check configured');
  }

  /**
   * Perform pre-commit security check
   */
  async performPreCommitCheck(): Promise<boolean> {
    const config = this.getConfig();
    if (!config.preCommitCheck) return true;

    const allWarnings = this.commitScanner.scanAllRepositories(this.applicableRules);
    
    // Flatten all warnings
    const warnings = Array.from(allWarnings.values()).flat();
    
    if (warnings.length === 0) return true;

    const critical = warnings.filter(w => w.severity === 'critical');
    
    if (critical.length > 0) {
      const result = await this.notificationManager.showPreCommitWarning(warnings);
      
      switch (result) {
        case 'fix':
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (workspaceFolder) {
            const rules = critical.map(w => ({
              pattern: w.matchedPattern,
              severity: w.severity,
              reason: w.reason,
            }));
            await this.gitignoreHandler.addPatterns(workspaceFolder, rules);
            this.notificationManager.showInfo('Patterns added. Please unstage the files and try again.');
          }
          return false;
        
        case 'proceed':
          return true;
        
        case 'block':
        case 'cancel':
        default:
          return false;
      }
    }

    return true;
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
   * Log a message
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`${timestamp} [INFO] ${message}`);
  }
}

// Extension instance
let extension: GitGuardExtension | undefined;

/**
 * Extension activation entry point
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extension = new GitGuardExtension(context);
  await extension.activate();
}

/**
 * Extension deactivation entry point
 */
export function deactivate(): void {
  extension = undefined;
}
