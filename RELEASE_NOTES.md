# 🎉 GitGuard v0.1.0 - Initial Release

**An intelligent VS Code extension that prevents accidental commits of sensitive files**

## 🚀 What's New

This is the inaugural release of GitGuard! 🎊

### ✨ Key Features

- **🔍 Smart Framework Detection** - Automatically detects Node.js, Python, Java projects and their frameworks (React, Django, Maven, etc.)
- **🛡️ Pre-commit Security** - Blocks dangerous commits containing `.env` files, secrets, and sensitive data  
- **📋 100+ Curated Rules** - Comprehensive .gitignore patterns with clear explanations and severity levels
- **👀 Real-time Monitoring** - Watches for risky file creation and offers instant fixes
- **🤝 Developer-Friendly** - Always explains why, never acts without permission
- **🚫 Non-Destructive** - Safe, append-only .gitignore management that never deletes existing rules

### 🎯 Supported Technologies

| Category | Frameworks | Detection Method |
|----------|------------|------------------|
| **JavaScript/TypeScript** | Node.js, React, Next.js, Vue, Angular, Vite, Svelte | `package.json`, config files |
| **Python** | Django, Flask, FastAPI, Generic Python | `requirements.txt`, `pyproject.toml`, `manage.py` |
| **Java** | Maven, Gradle | `pom.xml`, `build.gradle` |

### 🎛️ Configuration Options

- `gitGuard.enabled` - Enable/disable the extension
- `gitGuard.autoSuggest` - Auto-suggest rules when frameworks detected
- `gitGuard.preCommitCheck` - Scan staged files before commits
- `gitGuard.watchFileCreation` - Monitor for risky file creation
- `gitGuard.modifyGitignoreAutomatically` - Add rules without asking (not recommended)
- `gitGuard.suppressedWarnings` - Patterns you've dismissed

### 📝 Commands Available

- **GitGuard: Scan Workspace** - Full security audit of your project
- **GitGuard: Show Detected Frameworks** - View detected technologies  
- **GitGuard: Suggest .gitignore Rules** - Review and add missing patterns
- **GitGuard: Add Pattern to .gitignore** - Manually add custom patterns

## 📦 Installation

### Option 1: Download .vsix
1. Download `gitguard-0.1.0.vsix` from this release
2. Open VS Code → Command Palette (`Ctrl+Shift+P`)
3. Run `Extensions: Install from VSIX...`
4. Select the downloaded file

### Option 2: Build from Source
```bash
git clone https://github.com/CodeWithMishu/GitGuard.git
cd GitGuard
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

## 🔒 Security Focus

GitGuard prioritizes security with three severity levels:

| Level | Examples | Behavior |
|-------|----------|----------|
| 🚨 **Critical** | `.env`, `secrets.json`, `db.sqlite3` | Blocks commits, requires attention |
| ⚠️ **Recommended** | `node_modules/`, `__pycache__/`, `target/` | Strong warning |
| ℹ️ **Optional** | `.DS_Store`, `*.log`, `.idea/` | Gentle suggestion |

## 🛠️ Technical Details

- **Built with**: TypeScript, VS Code Extension API
- **Package Size**: 79.2 KB (70 files)
- **Architecture**: Modular, extensible design
- **License**: MIT (Open Source)
- **VS Code Compatibility**: 1.85.0+

## 🤝 Contributing

GitGuard is open source and welcomes contributions!

- 🐛 [Report bugs](https://github.com/CodeWithMishu/GitGuard/issues)
- 💡 [Request features](https://github.com/CodeWithMishu/GitGuard/issues)
- 🔧 [Contribute code](https://github.com/CodeWithMishu/GitGuard/pulls)
- 📋 Add new framework rules

## 🙏 What's Next?

- Support for more languages (PHP, C#, Go, Rust, Ruby)
- VS Code Marketplace publication
- Community rule packs
- CI/CD integration options

---

**⭐ If GitGuard helps secure your code, please star the repo!**

**🐛 Found an issue?** → [Report it here](https://github.com/CodeWithMishu/GitGuard/issues)