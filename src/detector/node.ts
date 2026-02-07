/**
 * GitGuard - Node.js / JavaScript Detector
 * 
 * Detects JavaScript/TypeScript frameworks:
 * - Node.js (generic)
 * - React
 * - Next.js
 * - Vue
 * - Angular
 * - Vite
 * - Svelte
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { BaseDetector } from './base';
import { DetectedFramework } from '../types';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export class NodeDetector extends BaseDetector {
  readonly ruleCategory = 'node' as const;
  readonly triggerFiles = ['package.json'];

  /**
   * Framework detection patterns
   * Order matters: more specific frameworks first
   */
  private readonly frameworkPatterns = [
    {
      id: 'nextjs' as const,
      name: 'Next.js',
      dependencies: ['next'],
      configFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
      confidence: 0.95,
    },
    {
      id: 'angular' as const,
      name: 'Angular',
      dependencies: ['@angular/core'],
      configFiles: ['angular.json'],
      confidence: 0.95,
    },
    {
      id: 'vue' as const,
      name: 'Vue',
      dependencies: ['vue'],
      configFiles: ['vue.config.js', 'vite.config.ts', 'nuxt.config.js'],
      confidence: 0.9,
    },
    {
      id: 'svelte' as const,
      name: 'Svelte',
      dependencies: ['svelte'],
      configFiles: ['svelte.config.js'],
      confidence: 0.95,
    },
    {
      id: 'vite' as const,
      name: 'Vite',
      dependencies: ['vite'],
      configFiles: ['vite.config.js', 'vite.config.ts'],
      confidence: 0.9,
    },
    {
      id: 'react' as const,
      name: 'React',
      dependencies: ['react', 'react-dom'],
      configFiles: [],
      confidence: 0.85,
    },
  ];

  async detect(workspaceFolder: vscode.WorkspaceFolder): Promise<DetectedFramework[]> {
    const detected: DetectedFramework[] = [];
    const packageJsonPaths = await this.findAllPackageJsons(workspaceFolder);

    for (const packageJsonPath of packageJsonPaths) {
      const relativePath = path.relative(workspaceFolder.uri.fsPath, packageJsonPath);
      const dirPath = path.dirname(packageJsonPath);
      const relativeDir = path.dirname(relativePath);

      const packageJson = await this.readJsonFile<PackageJson>(workspaceFolder, relativePath);
      if (!packageJson) continue;

      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Always add Node.js as base framework if package.json exists
      detected.push(this.createDetection(
        'node',
        'Node.js',
        relativePath,
        0.8
      ));

      // Check for specific frameworks
      for (const framework of this.frameworkPatterns) {
        const hasDependency = framework.dependencies.some(dep => dep in allDeps);
        
        if (hasDependency) {
          // Check for config files to boost confidence
          let confidence = framework.confidence;
          let configFound = false;

          for (const configFile of framework.configFiles) {
            const configPath = path.join(relativeDir, configFile);
            if (await this.fileExists(workspaceFolder, configPath)) {
              configFound = true;
              confidence = Math.min(1, confidence + 0.05);
              break;
            }
          }

          detected.push(this.createDetection(
            framework.id,
            framework.name,
            relativePath,
            confidence
          ));
        }
      }
    }

    // Deduplicate by framework id (keep highest confidence)
    return this.deduplicateDetections(detected);
  }

  /**
   * Find all package.json files in workspace
   */
  private async findAllPackageJsons(workspaceFolder: vscode.WorkspaceFolder): Promise<string[]> {
    const pattern = new vscode.RelativePattern(workspaceFolder, '**/package.json');
    const exclude = '**/node_modules/**';
    const files = await vscode.workspace.findFiles(pattern, exclude);
    return files.map(f => f.fsPath);
  }

  /**
   * Remove duplicate framework detections, keeping highest confidence
   */
  private deduplicateDetections(detections: DetectedFramework[]): DetectedFramework[] {
    const byId = new Map<string, DetectedFramework>();
    
    for (const detection of detections) {
      const existing = byId.get(detection.id);
      if (!existing || detection.confidence > existing.confidence) {
        byId.set(detection.id, detection);
      }
    }

    return Array.from(byId.values());
  }
}
