/**
 * GitGuard - Base Detector
 * 
 * Abstract base class for framework detection.
 * Each language/framework family extends this.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DetectedFramework, FrameworkId } from '../types';

/**
 * Abstract base class for framework detectors
 */
export abstract class BaseDetector {
  /** The rule category this detector maps to */
  abstract readonly ruleCategory: 'node' | 'python' | 'java';
  
  /** List of files that trigger this detector */
  abstract readonly triggerFiles: string[];

  /**
   * Detect frameworks in the given workspace folder
   * @param workspaceFolder The workspace folder to scan
   * @returns Array of detected frameworks
   */
  abstract detect(workspaceFolder: vscode.WorkspaceFolder): Promise<DetectedFramework[]>;

  /**
   * Check if a file exists in the workspace
   */
  protected async fileExists(workspaceFolder: vscode.WorkspaceFolder, relativePath: string): Promise<boolean> {
    const fullPath = path.join(workspaceFolder.uri.fsPath, relativePath);
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a file's content as string
   */
  protected async readFile(workspaceFolder: vscode.WorkspaceFolder, relativePath: string): Promise<string | null> {
    const fullPath = path.join(workspaceFolder.uri.fsPath, relativePath);
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(fullPath));
      return Buffer.from(content).toString('utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Parse JSON file safely
   */
  protected async readJsonFile<T>(workspaceFolder: vscode.WorkspaceFolder, relativePath: string): Promise<T | null> {
    const content = await this.readFile(workspaceFolder, relativePath);
    if (!content) return null;
    try {
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  /**
   * Find files matching a glob pattern
   */
  protected async findFiles(pattern: string, excludePattern?: string): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles(pattern, excludePattern);
  }

  /**
   * Create a detected framework result
   */
  protected createDetection(
    id: FrameworkId,
    name: string,
    detectedAt: string,
    confidence: number
  ): DetectedFramework {
    return {
      id,
      name,
      detectedAt,
      confidence,
      ruleCategory: this.ruleCategory,
    };
  }
}
