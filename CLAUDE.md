# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Context Crafter is a browser-based GUI application for generating detailed context prompts from local codebases for AI programming assistants. It uses the File System Access API to operate entirely in the browser without requiring a terminal.

**Stack**: Vanilla HTML5, CSS3, and JavaScript (no frameworks or build tools required)

## Development Commands

```bash
# Start development server (port 8080, no auto-browser)
npm run start

# Start with Chrome
npm run start-chrome

# Start with Edge
npm run start-edge
```

Alternative: Open `index.html` directly in a browser (works but no live reload).

## Architecture

### Core Files

- **index.html**: Single-page application with 4 main sections (folder selection, additional files, task description, context output)
- **script.js**: All application logic (~1100 lines)
- **style.css**: Dark theme (default)
- **light.css**: Light theme variant
- **context-crafter-presets.json**: User presets storage (prompts and projects)

### State Model

The app uses closure-based state initialized on DOMContentLoaded:

```javascript
panels[]              // Two panel objects with directory handles, fileHandles Map, dependency Maps
fileHighlightStates   // Map tracking search/highlight state per file
additionalFileHandles // Map for files added outside main folders
appPresets            // Object: { prompts: {}, projects: {} }
presetsFileHandle     // Reference to loaded presets JSON file
```

### Data Persistence

- **IndexedDB** (ContextCrafterDB): Stores file/directory handles for permission persistence across sessions
- Key pattern: `project-{projectName}-panel-{index}`

### Key Functional Modules

1. **Directory Traversal**: `traverseDirectory()` builds file trees, respects DEFAULT_BLACKLIST
2. **Dependency Analysis**: Regex-based import detection via `buildDependencyGraph()`, builds bidirectional `dependencies` and `dependents` Maps
3. **Search**: `handleSearch()` scans file contents (max 10MB per file)
4. **Context Generation**: `handleGenerateContext()` combines preset prompt, task description, file tree (ASCII), and file contents

### File Inclusion Modes

Files can be set to one of three modes via radio buttons:
- **Full**: Include complete file content
- **Path**: Include file path only
- **Ignore**: Exclude from output

### Default Blacklist

Automatically excluded directories: `.git`, `.svn`, `.hg`, `.vscode`, `.idea`, `.DS_Store`, `__pycache__`, `.venv`, `venv`, `env`, `.env`, `dist`, `build`, `node_modules`, `package-lock.json`, `yarn.lock`

## Important Implementation Details

- Token estimation uses `CHARS_PER_TOKEN = 4`
- Dependency detection regex: `/(?:from|require|import)\s*\(?\s*['"]((?:\.\/|\.\.\/|\/)?[\w@/.-]+)['"]/g`
- Dual panels allow comparing two projects side-by-side
- All paths are normalized to forward slashes
