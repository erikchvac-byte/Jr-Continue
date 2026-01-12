# AGENTS.md

## Build/Lint/Test Commands

```bash
# Core Commands
npm run build              # TypeScript compilation to dist/
npm run test               # Run all Jest tests
npm run test:coverage      # Run tests with coverage report
npm run test:watch         # Jest watch mode for development

# Single Test Execution (CRITICAL)
npm test -- --testNamePattern="specific test name"
npm test -- tests/filename.test.ts

# Verification Pipeline
npm run verify:all         # Complete verification (syntax → build → test → lint)
npm run verify:syntax      # TypeScript syntax check only
npm run verify:build       # Build verification
npm run verify:test        # Test verification
npm run verify:lint        # ESLint verification

# Development
npm run mvp                # Run MVP demo
npm run pipeline           # Run full pipeline
npm run mcp                # Start MCP server
```

## TypeScript Conventions

- **Strict Mode**: All files use strict TypeScript (tsconfig.json:8)
- **Interfaces**: Define all types in state/schemas.ts, use for function parameters
- **Type Annotations**: Explicit return types for async methods
- **Generic Types**: Use `<K extends keyof Interface>` for type-safe updates
- **ISO Timestamps**: All timestamps use ISO 8601 string format
- **File Extensions**: .ts for source, .test.ts for tests

## Import Organization

```typescript
// External libraries (node, fs, path, etc.)
import * as fs from 'fs';
import * as path from 'path';

// Internal modules (state, utils, agents)
import { StateManager } from '../state/StateManager';
import { Logger } from './Logger';

// Type imports from schemas
import { AgentStatus, TaskComplexity } from '../state/schemas';
```

## Naming Conventions

- **Classes**: PascalCase (Router, StateManager, Logger)
- **Methods**: camelCase (analyzeComplexity, logAgentActivity)
- **Constants**: UPPER_SNAKE_CASE (BASE_SCORE, KEYWORD_SCORE_ADJUSTMENT)
- **Files**: PascalCase.ts for classes, camelCase.ts for utilities
- **Interfaces**: PascalCase (ComplexityAnalysis, SessionState)

## Error Handling Patterns

```typescript
try {
  const result = await operation();
  return result;
} catch (error: any) {
  await this.logger.logFailure({
    timestamp: new Date().toISOString(),
    agent: 'agent-name',
    error: error instanceof Error ? error.message : String(error),
    task,
    retry_count: 0,
  });
  throw error;
}
```

## Testing Guidelines

- **Framework**: Jest with ts-jest preset (jest.config.js)
- **Test Location**: tests/**/*.test.ts
- **Test Structure**: describe() → beforeEach() → it() → afterEach()
- **Coverage**: Configured for agents/, utils/, state/ directories
- **Test Data**: Use real data only, NO simulated data or placeholders
- **Cleanup**: Always clean up test files/directories in afterEach()
- **Assertions**: expect().toBe() for exact matches, expect().toBeDefined() for existence

## Project-Specific Patterns

- **Agent Architecture**: Class-based agents with async methods
- **State Management**: Use StateManager for all state operations, atomic writes
- **File I/O**: Use temp-file-then-rename pattern for atomic writes
- **Logging**: Use Logger agent for all activity/failure logging
- **Constants**: Define readonly constants at class level
- **Async Methods**: All agent methods are async and return Promise<T>

## File Structure

```
agents/          - Specialized AI agent classes
state/           - State management and schemas
utils/           - Helper functions and utilities
tests/           - Jest test files
dist/            - Build output (generated)
```

## Critical Notes

- **ESLint Config**: .eslintrc.js needs to be created for lint commands
- **Type Safety**: Never use `any` type except in error handling
- **State**: Always use StateManager.readState() and writeState()
- **Logs**: Always log agent activity via Logger.logAgentActivity()
- **Tests**: Nothing is complete if using simulated data or placeholders
