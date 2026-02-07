/**
 * GitGuard - Python Detector
 * 
 * Detects Python frameworks:
 * - Python (generic)
 * - Django
 * - Flask
 * - FastAPI
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { BaseDetector } from './base';
import { DetectedFramework } from '../types';

interface PyProjectToml {
  project?: {
    dependencies?: string[];
  };
  tool?: {
    poetry?: {
      dependencies?: Record<string, unknown>;
    };
  };
}

export class PythonDetector extends BaseDetector {
  readonly ruleCategory = 'python' as const;
  readonly triggerFiles = ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'];

  /**
   * Framework detection patterns
   */
  private readonly frameworkPatterns = [
    {
      id: 'django' as const,
      name: 'Django',
      packages: ['django', 'Django'],
      configFiles: ['manage.py', 'settings.py'],
      configDirs: ['*/settings.py', '*/wsgi.py'],
      confidence: 0.9,
    },
    {
      id: 'flask' as const,
      name: 'Flask',
      packages: ['flask', 'Flask'],
      configFiles: ['app.py', 'wsgi.py'],
      configDirs: [],
      confidence: 0.85,
    },
    {
      id: 'fastapi' as const,
      name: 'FastAPI',
      packages: ['fastapi', 'FastAPI'],
      configFiles: ['main.py'],
      configDirs: [],
      confidence: 0.85,
    },
  ];

  async detect(workspaceFolder: vscode.WorkspaceFolder): Promise<DetectedFramework[]> {
    const detected: DetectedFramework[] = [];
    let isPythonProject = false;

    // Check for various Python project indicators
    const requirementsPath = await this.findRequirementFiles(workspaceFolder);
    const pyprojectPath = await this.findPyprojectToml(workspaceFolder);
    const hasPythonFiles = await this.hasPythonSourceFiles(workspaceFolder);

    // Collect all dependencies
    const allPackages = new Set<string>();

    // Parse requirements.txt files
    for (const reqPath of requirementsPath) {
      isPythonProject = true;
      const relativePath = path.relative(workspaceFolder.uri.fsPath, reqPath);
      const packages = await this.parseRequirementsTxt(workspaceFolder, relativePath);
      packages.forEach(pkg => allPackages.add(pkg.toLowerCase()));
    }

    // Parse pyproject.toml
    if (pyprojectPath) {
      isPythonProject = true;
      const packages = await this.parsePyprojectToml(workspaceFolder, pyprojectPath);
      packages.forEach(pkg => allPackages.add(pkg.toLowerCase()));
    }

    // If Python files exist but no deps file, still detect as Python
    if (hasPythonFiles && !isPythonProject) {
      isPythonProject = true;
    }

    if (!isPythonProject) {
      return [];
    }

    // Add base Python detection
    const detectionSource = requirementsPath[0] 
      ? path.relative(workspaceFolder.uri.fsPath, requirementsPath[0])
      : pyprojectPath || '*.py files';
      
    detected.push(this.createDetection(
      'python',
      'Python',
      detectionSource,
      0.8
    ));

    // Check for specific frameworks
    for (const framework of this.frameworkPatterns) {
      const hasPackage = framework.packages.some(pkg => 
        allPackages.has(pkg.toLowerCase())
      );

      if (hasPackage) {
        let confidence = framework.confidence;

        // Check for config files to boost confidence
        for (const configFile of framework.configFiles) {
          if (await this.fileExists(workspaceFolder, configFile)) {
            confidence = Math.min(1, confidence + 0.05);
            break;
          }
        }

        // Special case: Django manage.py detection
        if (framework.id === 'django') {
          if (await this.fileExists(workspaceFolder, 'manage.py')) {
            confidence = 0.98;
          }
        }

        detected.push(this.createDetection(
          framework.id,
          framework.name,
          detectionSource,
          confidence
        ));
      }
    }

    // Also check for Django without requirements (manage.py presence)
    if (!detected.some(d => d.id === 'django')) {
      if (await this.fileExists(workspaceFolder, 'manage.py')) {
        detected.push(this.createDetection(
          'django',
          'Django',
          'manage.py',
          0.95
        ));
      }
    }

    return detected;
  }

  /**
   * Find all requirements*.txt files
   */
  private async findRequirementFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<string[]> {
    const pattern = new vscode.RelativePattern(workspaceFolder, '**/requirements*.txt');
    const exclude = '**/{venv,.venv,env,.env,node_modules}/**';
    const files = await vscode.workspace.findFiles(pattern, exclude);
    return files.map(f => f.fsPath);
  }

  /**
   * Find pyproject.toml
   */
  private async findPyprojectToml(workspaceFolder: vscode.WorkspaceFolder): Promise<string | null> {
    const pattern = new vscode.RelativePattern(workspaceFolder, '**/pyproject.toml');
    const exclude = '**/{venv,.venv,env,.env,node_modules}/**';
    const files = await vscode.workspace.findFiles(pattern, exclude, 1);
    return files.length > 0 ? path.relative(workspaceFolder.uri.fsPath, files[0].fsPath) : null;
  }

  /**
   * Check if workspace has Python source files
   */
  private async hasPythonSourceFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
    const pattern = new vscode.RelativePattern(workspaceFolder, '**/*.py');
    const exclude = '**/{venv,.venv,env,.env,node_modules,__pycache__}/**';
    const files = await vscode.workspace.findFiles(pattern, exclude, 1);
    return files.length > 0;
  }

  /**
   * Parse requirements.txt to extract package names
   */
  private async parseRequirementsTxt(workspaceFolder: vscode.WorkspaceFolder, relativePath: string): Promise<string[]> {
    const content = await this.readFile(workspaceFolder, relativePath);
    if (!content) return [];

    const packages: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Skip -r, -e, and other flags
      if (trimmed.startsWith('-')) continue;

      // Extract package name (before any version specifier)
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)/);
      if (match) {
        packages.push(match[1]);
      }
    }

    return packages;
  }

  /**
   * Parse pyproject.toml to extract dependencies
   * Note: This is a simplified parser for common formats
   */
  private async parsePyprojectToml(workspaceFolder: vscode.WorkspaceFolder, relativePath: string): Promise<string[]> {
    const content = await this.readFile(workspaceFolder, relativePath);
    if (!content) return [];

    const packages: string[] = [];

    // Simple regex-based extraction for common patterns
    // Matches: package-name, "package-name", 'package-name'
    const depPatterns = [
      /dependencies\s*=\s*\[([\s\S]*?)\]/g,
      /\[project\.dependencies\]([\s\S]*?)(?:\[|$)/g,
      /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\[|$)/g,
    ];

    for (const pattern of depPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const section = match[1];
        // Extract package names from the section
        const pkgMatches = section.matchAll(/["']?([a-zA-Z0-9_-]+)["']?\s*[=><]/g);
        for (const pkgMatch of pkgMatches) {
          packages.push(pkgMatch[1]);
        }
      }
    }

    return packages;
  }
}
