# Changelog

All notable changes to the GitGuard extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-07

### Added
- 🎉 Initial release of GitGuard
- 🔍 Framework detection for Node.js, Python, and Java projects
- 📋 100+ curated .gitignore rules with explanations
- 🛡️ Pre-commit protection against sensitive file commits
- 👀 Real-time monitoring for risky file creation
- 🎛️ User-friendly configuration with 6 customizable settings
- 🚫 Safe, append-only .gitignore management
- 📝 Comprehensive documentation and examples

### Framework Support
- **JavaScript/TypeScript**: Node.js, React, Next.js, Vue, Angular, Vite, Svelte
- **Python**: Generic Python, Django, Flask, FastAPI
- **Java**: Maven, Gradle

### Key Features
- Critical security warnings for .env files, secrets, and databases
- Debounced notifications to prevent spam
- Pattern suppression and user preference memory
- Monorepo and multi-framework project support
- Detailed output channel logging for debugging

### Commands
- `GitGuard: Scan Workspace for Risky Files`
- `GitGuard: Add Pattern to .gitignore` 
- `GitGuard: Show Detected Frameworks`
- `GitGuard: Suggest .gitignore Rules`