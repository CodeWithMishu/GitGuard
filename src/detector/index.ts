/**
 * GitGuard - Detection Engine
 * 
 * Coordinates all framework detectors and provides a unified API.
 * Supports monorepos with multiple frameworks.
 */

import * as vscode from 'vscode';
import { DetectedFramework } from '../types';
import { BaseDetector } from './base';
import { NodeDetector } from './node';
import { PythonDetector } from './python';
import { JavaDetector } from './java';

/**
 * Main detection engine that coordinates all detectors
 */
export class DetectionEngine {
  private detectors: BaseDetector[];
  private cachedResults: Map<string, DetectedFramework[]> = new Map();
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.detectors = [
      new NodeDetector(),
      new PythonDetector(),
      new JavaDetector(),
    ];
  }

  /**
   * Detect all frameworks in the workspace
   * @param forceRefresh If true, bypasses cache
   */
  async detectAll(forceRefresh = false): Promise<DetectedFramework[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const allDetections: DetectedFramework[] = [];

    for (const folder of workspaceFolders) {
      const cacheKey = folder.uri.fsPath;
      
      // Check cache
      if (!forceRefresh && this.cachedResults.has(cacheKey)) {
        allDetections.push(...this.cachedResults.get(cacheKey)!);
        continue;
      }

      this.log(`Scanning workspace: ${folder.name}`);
      
      const folderDetections: DetectedFramework[] = [];

      // Run all detectors
      for (const detector of this.detectors) {
        try {
          const detected = await detector.detect(folder);
          folderDetections.push(...detected);
          
          for (const framework of detected) {
            this.log(`  Detected: ${framework.name} (${Math.round(framework.confidence * 100)}% confidence) at ${framework.detectedAt}`);
          }
        } catch (error) {
          this.log(`  Error in ${detector.constructor.name}: ${error}`, 'error');
        }
      }

      // Cache results
      this.cachedResults.set(cacheKey, folderDetections);
      allDetections.push(...folderDetections);
    }

    this.log(`Total frameworks detected: ${allDetections.length}`);
    return allDetections;
  }

  /**
   * Detect frameworks for a specific workspace folder
   */
  async detectInFolder(folder: vscode.WorkspaceFolder): Promise<DetectedFramework[]> {
    const detections: DetectedFramework[] = [];

    for (const detector of this.detectors) {
      try {
        const detected = await detector.detect(folder);
        detections.push(...detected);
      } catch (error) {
        this.log(`Error in ${detector.constructor.name}: ${error}`, 'error');
      }
    }

    // Update cache
    this.cachedResults.set(folder.uri.fsPath, detections);
    return detections;
  }

  /**
   * Get unique rule categories from detections
   */
  getRuleCategories(detections: DetectedFramework[]): Set<'node' | 'python' | 'java'> {
    return new Set(detections.map(d => d.ruleCategory));
  }

  /**
   * Get framework IDs from detections
   */
  getFrameworkIds(detections: DetectedFramework[]): Set<string> {
    return new Set(detections.map(d => d.id));
  }

  /**
   * Clear the detection cache
   */
  clearCache(): void {
    this.cachedResults.clear();
    this.log('Detection cache cleared');
  }

  /**
   * Log a message to the output channel
   */
  private log(message: string, level: 'info' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '[ERROR]' : '[INFO]';
    this.outputChannel.appendLine(`${timestamp} ${prefix} ${message}`);
  }
}

// Re-export for convenience
export { BaseDetector } from './base';
export { NodeDetector } from './node';
export { PythonDetector } from './python';
export { JavaDetector } from './java';
