# Jr-Continue

**Jr** - Your autonomous junior developer assistant with 17 specialized agents, exposed via MCP.

A multi-agent development system that provides intelligent task routing, code analysis, automated debugging, and seamless integration with Continue.dev through CLAUDE.md sync.

## 🤖 17 Specialized Agents

### Core Agents
- **Router** - Task complexity analysis and routing decisions
- **MetaCoordinator** - Advanced task routing with token budget management
- **SessionManager** - Session lifecycle and state management

### Development Agents
- **Architect** - Project structure analysis and recommendations
- **Critic** - Code quality and security review
- **RepairAgent** - Automated code fixing and refactoring
- **LogicArchivist** - Code documentation and explanation
- **DataExtractor** - Data extraction and transformation utilities

### Execution Agents
- **ClaudeSpecialist** - Claude API execution and integration
- **OllamaSpecialist** - Local Ollama model execution
- **AutoDebug** - Automated debugging assistance
- **DependencyScout** - Dependency analysis and conflict detection
- **PerformanceMonitor** - Performance tracking and optimization

### System Agents
- **Logger** - Centralized logging and audit trails
- **Watcher** - File system monitoring with CLAUDE.md auto-sync
- **ClaudeMdSync** - CLAUDE.md to Continue.dev rules synchronization
- **RoutingOptimizer** - Routing pattern analysis and optimization

## 🔄 State Management & Integration

### Core Components
- **StateManager** - Atomic file-based state persistence with backup/recovery
- **TokenBudget** - AI token usage tracking and optimization
- **Schemas** - Comprehensive TypeScript type definitions

### Continue.dev Integration
- **CLAUDE.md Sync** - Automatic synchronization of project rules to Continue.dev
- **File Watching** - Real-time monitoring of CLAUDE.md file changes
- **Multi-source Merging** - Combines global, project, local, and instruction files

### Key Features
- **Atomic Writes** - Temp-file-then-rename pattern prevents corruption
- **Change Detection** - SHA256 hashing avoids unnecessary syncs
- **Auto-recovery** - Automatic backup restoration on state corruption

## 🚀 Quick Start

### Installation
```bash
npm install
npm run build
```

### As MCP Server
Start the Model Context Protocol server:
```bash
npm run mcp
```

### Development Commands
```bash
npm run build              # Compile TypeScript
npm run test              # Run all tests (22/22 passing)
npm run test:watch        # Watch mode testing
npm run verify:all        # Complete verification pipeline
npm run mvp               # Run MVP demo
npm run pipeline          # Run full development pipeline
```

### Usage Examples

#### Basic Agent Usage
```typescript
import { Router } from './agents/Router';
import { MetaCoordinator } from './agents/MetaCoordinator';
import { StateManager } from './state/StateManager';

// Initialize state management
const stateManager = new StateManager('./state/session_state.json');
await stateManager.initialize();

// Create and use agents
const router = new Router(stateManager, logger);
const complexity = await router.analyzeComplexity("Implement user authentication");

// Use MetaCoordinator for advanced routing
const coordinator = new MetaCoordinator(stateManager, router);
const result = await coordinator.routeTask("Build a React dashboard");
```

#### CLAUDE.md Integration
The system automatically syncs CLAUDE.md files to Continue.dev:
```bash
# Files are merged in priority order:
# 1. ~/.claude/CLAUDE.md (global)
# 2. ./CLAUDE.md (project)
# 3. ./CLAUDE.local.md (local)
# 4. ./.claude/instructions.md (modern)

# Output: .continue/rules/00-claude-md.md
```

## 🧪 Testing & Verification

### Test Suite
```bash
npm run test              # Run all Jest tests (22/22 passing)
npm run test:coverage     # Generate coverage reports
npm run test:watch        # Interactive watch mode

# Single test execution
npm test -- --testNamePattern="specific test name"
npm test -- tests/filename.test.ts
```

### Verification Pipeline
```bash
npm run verify:all        # Complete verification (syntax + build + test + lint)
npm run verify:syntax     # TypeScript compilation check
npm run verify:build      # Build verification
npm run verify:test       # Test verification
npm run verify:lint       # ESLint verification
```

### Real-World Integration Tests
- ✅ **CLAUDE.md Sync**: Automatic synchronization to `.continue/rules/`
- ✅ **File Watching**: Real-time monitoring of CLAUDE.md changes
- ✅ **State Persistence**: Atomic writes with backup/recovery

## 📚 Documentation

- **[AGENTS.md](./AGENTS.md)** - Comprehensive coding guidelines for agentic development
- **[QUICKSTART.md](./QUICKSTART.md)** - Real-world testing guide
- **[HANDOFF.md](./HANDOFF.md)** - CLAUDE.md sync integration details
- **[CLAUDE.md](./CLAUDE.md)** - Project-specific AI assistant rules

## 📦 Package Information

- **Version**: 2.3.0
- **License**: MIT
- **Main**: `dist/index.js`
- **TypeScript**: Strict mode with comprehensive type definitions

## 🤝 Contributing

This project uses a multi-agent architecture with specialized roles. See [AGENTS.md](./AGENTS.md) for coding standards and contribution guidelines.

## License

MIT
