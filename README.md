# GitGuard - VS Code Extension

[![Open Source](https://img.shields.io/badge/Open%20Source-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Extension-blue.svg)](https://marketplace.visualstudio.com/items?itemName=gitguard.gitguard)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-black.svg)](https://github.com/gitguard/gitguard-vscode)

> An open-source VS Code extension that proactively prevents accidental commits of sensitive files by intelligently managing .gitignore

**Never accidentally commit secrets, API keys, or build artifacts again!**

## ✨ Features

- 🔍 **Smart Framework Detection**: Automatically detects Node.js, Python, Java, React, Vue, Angular, Django, Flask, and more
- 🛡️ **Pre-commit Security**: Blocks commits with critical security risks (env files, secrets, databases)
- 📁 **Intelligent .gitignore**: Suggests framework-specific rules with clear explanations
- 👀 **Real-time Monitoring**: Watches for risky file creation and offers instant fixes
- 🎛️ **Developer-Friendly**: Always explains why, never acts without permission
- 🚫 **Non-Destructive**: Append-only .gitignore management, never deletes existing rules

## 🚀 Quick Start

### Installation

**Option 1: From VS Code Marketplace**
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "GitGuard"
4. Click Install

**Option 2: Install from .vsix file**
1. Download the latest `gitguard-x.x.x.vsix` from [Releases](https://github.com/gitguard/gitguard-vscode/releases)
2. Open VS Code
3. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
4. Run `Extensions: Install from VSIX...`
5. Select the downloaded .vsix file

**Option 3: Build from Source**
```bash
git clone https://github.com/codewithmishu/GitGuard.git
cd GitGuard
npm install
npm run compile
# Press F5 to launch Extension Development Host
```

### First Use

1. Open any project with `package.json`, `requirements.txt`, or `pom.xml`
2. GitGuard will automatically detect your frameworks
3. If .gitignore patterns are missing, you'll get a friendly notification
4. Choose "Suggest Rules" to review and add recommended patterns

That's it! GitGuard now protects your commits automatically.

## 🎯 Supported Frameworks

| Language | Frameworks | Detection Method |
|----------|------------|------------------|
| **JavaScript/TypeScript** | Node.js, React, Next.js, Vue, Angular, Vite, Svelte | `package.json`, config files |
| **Python** | Django, Flask, FastAPI, Generic Python | `requirements.txt`, `pyproject.toml`, `manage.py` |
| **Java** | Maven, Gradle | `pom.xml`, `build.gradle` |

> **Expanding Soon**: PHP (Laravel, Symfony), C# (.NET), Go, Rust, Ruby (Rails)

## ⚙️ Configuration

GitGuard respects your preferences with these settings:

```json
{
  "gitGuard.enabled": true,
  "gitGuard.autoSuggest": true,
  "gitGuard.preCommitCheck": true,
  "gitGuard.modifyGitignoreAutomatically": false,
  "gitGuard.watchFileCreation": true,
  "gitGuard.suppressedWarnings": []
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable/disable the extension |
| `autoSuggest` | `true` | Show suggestions when frameworks are detected |
| `preCommitCheck` | `true` | Scan staged files before commits |
| `modifyGitignoreAutomatically` | `false` | Add rules without asking (not recommended) |
| `watchFileCreation` | `true` | Monitor for risky file creation |
| `suppressedWarnings` | `[]` | Patterns you've chosen to ignore |

## 🎛️ Commands

Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

- **GitGuard: Scan Workspace** - Full security audit of your project
- **GitGuard: Show Detected Frameworks** - View detected technologies
- **GitGuard: Suggest .gitignore Rules** - Review and add missing patterns
- **GitGuard: Add Pattern to .gitignore** - Manually add a custom pattern

## 🛡️ How It Protects You

### 1. Framework Detection
Automatically scans your project and detects:
- **Node.js** projects via `package.json`
- **Python** projects via `requirements.txt`, `pyproject.toml`
- **Java** projects via `pom.xml`, `build.gradle`
- **Framework-specific** configurations (Next.js, Django, etc.)

### 2. Smart Rules Engine
100+ carefully curated rules with three severity levels:

| Level | Examples | Action |
|-------|----------|--------|
| 🚨 **Critical** | `.env`, `secrets.json`, `db.sqlite3` | Blocks commit, requires attention |
| ⚠️ **Recommended** | `node_modules/`, `__pycache__/`, `target/` | Strong suggestion |
| ℹ️ **Optional** | `.DS_Store`, `*.log`, `.idea/` | Nice to have |

### 3. Pre-commit Protection
- Scans all staged files before commits
- Shows clear explanations for each risk
- Offers one-click fixes
- **Never blocks** commits silently

### 4. Real-time Monitoring
- Watches for creation of risky files
- Debounces notifications to avoid spam  
- Remembers your decisions per pattern
- Works with monorepos and multiple frameworks

## 🏗️ Architecture

GitGuard is built with a modular, extensible architecture:

```
src/
 ├── extension.ts          # Main coordinator - wires everything together  
 ├── types.ts              # Shared TypeScript interfaces
 ├── detector/
 │   ├── base.ts          # Abstract detector class
 │   ├── node.ts          # JavaScript/TypeScript framework detector
 │   ├── python.ts        # Python framework detector
 │   └── java.ts          # Java build tool detector
 ├── rules/
 │   ├── index.ts         # Rule engine with pattern matching
 │   ├── node.json        # 40+ Node.js/JS rules
 │   ├── python.json      # 35+ Python rules
 │   └── java.json        # 25+ Java rules
 ├── git/
 │   ├── gitignore.ts     # Safe, append-only .gitignore management
 │   └── commitScanner.ts # Pre-commit staged file analysis
 ├── ui/
 │   └── notifications.ts # User-friendly notifications with actions
 └── watcher/
     └── fileWatcher.ts   # Real-time file system monitoring
```

### Key Design Principles

1. **🚫 Non-Destructive**: Never deletes or reorders existing .gitignore content
2. **🤝 User-Centric**: Always explains why, never acts without permission
3. **🔧 Extensible**: Easy to add new frameworks and languages
4. **⚡ Performance**: Cached detection, debounced notifications
5. **🛡️ Security-First**: Critical patterns always prioritized

## 🤝 Contributing

GitGuard is **open source** and welcomes contributions!

### Ways to Contribute

- 🐛 **Report bugs** in [Issues](https://github.com/gitguard/gitguard-vscode/issues)
- 💡 **Suggest features** or new framework support
- 📝 **Improve documentation** 
- 🔧 **Add new framework detectors**
- 📋 **Contribute .gitignore rules**
- 🧪 **Write tests** for better coverage

### Development Setup

```bash
# Clone the repository
git clone https://github.com/gitguard/gitguard-vscode.git
cd gitguard-vscode

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Launch extension in development mode
# Press F5 in VS Code (opens Extension Development Host)

# Watch mode for continuous compilation
npm run watch
```

### Adding New Framework Support

1. **Create detector** in `src/detector/` extending `BaseDetector`
2. **Add rules** in `src/rules/[language].json` 
3. **Register detector** in `src/detector/index.ts`
4. **Update documentation** in README.md
5. **Test thoroughly** with real projects

### Code Style

- Use **TypeScript strict mode**
- Follow **existing patterns** and naming conventions
- Add **JSDoc comments** for public APIs
- Write **descriptive commit messages**

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

**GitGuard** is built by developers, for developers. It's completely **free** and **open source**.

## 🙏 Acknowledgments

- Inspired by [gitignore.io](https://gitignore.io) and community .gitignore templates
- Built on the excellent [VS Code Extension API](https://code.visualstudio.com/api)
- Framework detection patterns sourced from official documentation
- Rule patterns curated from years of developer experience

---

**⭐ If GitGuard helps you, please star the repo and share with your team!**

**🐛 Found an issue?** [Report it here](https://github.com/gitguard/gitguard-vscode/issues)

**💬 Questions or ideas?** [Start a discussion](https://github.com/gitguard/gitguard-vscode/discussions)
