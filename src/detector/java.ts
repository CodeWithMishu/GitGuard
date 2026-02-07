/**
 * GitGuard - Java Detector
 * 
 * Detects Java build tools:
 * - Maven
 * - Gradle
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { BaseDetector } from './base';
import { DetectedFramework } from '../types';

export class JavaDetector extends BaseDetector {
  readonly ruleCategory = 'java' as const;
  readonly triggerFiles = ['pom.xml', 'build.gradle', 'build.gradle.kts'];

  async detect(workspaceFolder: vscode.WorkspaceFolder): Promise<DetectedFramework[]> {
    const detected: DetectedFramework[] = [];

    // Check for Maven projects
    const pomFiles = await this.findPomFiles(workspaceFolder);
    for (const pomPath of pomFiles) {
      const relativePath = path.relative(workspaceFolder.uri.fsPath, pomPath);
      detected.push(this.createDetection(
        'maven',
        'Maven',
        relativePath,
        0.95
      ));
    }

    // Check for Gradle projects
    const gradleFiles = await this.findGradleFiles(workspaceFolder);
    for (const gradlePath of gradleFiles) {
      const relativePath = path.relative(workspaceFolder.uri.fsPath, gradlePath);
      
      // Check for Kotlin DSL
      const isKotlinDsl = gradlePath.endsWith('.kts');
      
      detected.push(this.createDetection(
        'gradle',
        isKotlinDsl ? 'Gradle (Kotlin DSL)' : 'Gradle',
        relativePath,
        0.95
      ));
    }

    // Deduplicate (prefer root-level detections)
    return this.deduplicateByProximity(detected, workspaceFolder);
  }

  /**
   * Find all pom.xml files
   */
  private async findPomFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<string[]> {
    const pattern = new vscode.RelativePattern(workspaceFolder, '**/pom.xml');
    const exclude = '**/target/**';
    const files = await vscode.workspace.findFiles(pattern, exclude);
    return files.map(f => f.fsPath);
  }

  /**
   * Find all build.gradle files (both Groovy and Kotlin DSL)
   */
  private async findGradleFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<string[]> {
    const patterns = [
      new vscode.RelativePattern(workspaceFolder, '**/build.gradle'),
      new vscode.RelativePattern(workspaceFolder, '**/build.gradle.kts'),
    ];
    
    const allFiles: string[] = [];
    const exclude = '**/{build,.gradle}/**';

    for (const pattern of patterns) {
      const files = await vscode.workspace.findFiles(pattern, exclude);
      allFiles.push(...files.map(f => f.fsPath));
    }

    return allFiles;
  }

  /**
   * Deduplicate detections, preferring those closer to workspace root
   */
  private deduplicateByProximity(
    detections: DetectedFramework[], 
    workspaceFolder: vscode.WorkspaceFolder
  ): DetectedFramework[] {
    const byId = new Map<string, DetectedFramework>();
    
    for (const detection of detections) {
      const existing = byId.get(detection.id);
      if (!existing) {
        byId.set(detection.id, detection);
      } else {
        // Prefer detection closer to root (fewer path segments)
        const existingDepth = existing.detectedAt.split(path.sep).length;
        const newDepth = detection.detectedAt.split(path.sep).length;
        
        if (newDepth < existingDepth) {
          byId.set(detection.id, detection);
        }
      }
    }

    return Array.from(byId.values());
  }
}
