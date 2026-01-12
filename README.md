# Jr-Continue

Collection of general-purpose AI agents and state management utilities.

## Agents

- **Architect** - Project structure analysis
- **AutoDebug** - Automated debugging assistance
- **ClaudeSpecialist** - Claude API execution
- **ClaudeMdSync** - CLAUDE.md to Continue.dev rules sync (✅ verified working)
- **Critic** - Code quality and security review
- **DataExtractor** - Data extraction and transformation
- **DependencyScout** - Dependency analysis
- **Logger** - Centralized logging
- **LogicArchivist** - Code documentation
- **MetaCoordinator** - Task routing with token budget management
- **OllamaSpecialist** - Local Ollama execution
- **PerformanceMonitor** - Performance tracking
- **RepairAgent** - Automated code fixing
- **Router** - Task complexity analysis
- **RoutingOptimizer** - Routing pattern optimization
- **SessionManager** - Session state management
- **Watcher** - File system monitoring with CLAUDE.md auto-sync (✅ verified working)

## State Management

- **StateManager** - Persistent state handling
- **TokenBudget** - Token usage tracking
- **schemas** - Type definitions

## Installation

```bash
npm install
```

## Usage

Import agents as needed:

```typescript
import { Router } from './agents/Router';
import { MetaCoordinator } from './agents/MetaCoordinator';
import { StateManager } from './state/StateManager';

// Use agents individually or compose them
```

## Testing

Run real-world tests:

```bash
npm run build
node test_sync.js      # Test CLAUDE.md sync
node test_watcher.js   # Test file watching auto-sync
```

## License

MIT
