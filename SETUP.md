# Jr-Continue Setup Guide

## What Was Copied

All general-purpose agents and their dependencies from ClaudeTeelamma have been copied to Jr-Continue for Continue.dev integration.

### Agents (16 files)
1. **Architect.ts** - Project structure analysis
2. **AutoDebug.ts** - Automated debugging
3. **ClaudeSpecialist.ts** - Claude API integration
4. **Critic.ts** - Code quality and security review
5. **DataExtractor.ts** - Data extraction and transformation
6. **DependencyScout.ts** - Dependency analysis
7. **Logger.ts** - Centralized logging
8. **LogicArchivist.ts** - Automatic documentation
9. **MetaCoordinator.ts** - Token budget enforcement
10. **OllamaSpecialist.ts** - Local Ollama integration
11. **PerformanceMonitor.ts** - Performance tracking
12. **RepairAgent.ts** - Automated code fixing
13. **Router.ts** - Task complexity analysis
14. **RoutingOptimizer.ts** - Routing pattern optimization
15. **SessionManager.ts** - Session state management
16. **Watcher.ts** - File system monitoring

### State Management (3 files)
1. **StateManager.ts** - Persistent state handling
2. **TokenBudget.ts** - Token usage tracking
3. **schemas.ts** - Type definitions

### Core Files
1. **pipeline.ts** - Complete task execution pipeline
2. **package.json** - Dependencies
3. **tsconfig.json** - TypeScript configuration
4. **TOKEN_BUDGET_IMPLEMENTATION.md** - Documentation

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests (when added)
npm test
```

## Integration with Continue.dev

This system provides:
- Intelligent task routing
- Token budget management
- Code quality review
- Automated fixing
- Documentation generation

All components are designed to work seamlessly with Continue.dev's extension architecture.

## Token Budget

The system includes a built-in token budget system:
- **Daily limit**: 10,000 tokens
- **Auto-fallback**: Routes to Ollama when exhausted
- **Persistent**: State survives restarts
- **Manual override**: Force agent selection when needed

## Next Steps

1. Configure Continue.dev to use these agents
2. Set up environment variables if needed
3. Customize agent behavior for your workflow
4. Add tests for your specific use cases

## Repository Structure

```
Jr-Continue/
├── agents/          # All agent implementations
├── state/           # State management and schemas
├── pipeline.ts      # Main execution pipeline
├── package.json     # Dependencies
├── tsconfig.json    # TypeScript config
└── README.md        # Main documentation
```

## Related Repositories

- **ClaudeTeelamma**: MCP server implementation
- **Agents**: Standalone agent collection
