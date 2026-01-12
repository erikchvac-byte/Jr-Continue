# Session Handoff: CLAUDE.md Sync Integration

## Task Overview
Integrate CLAUDE.md sync functionality directly into Jr-Continue by porting the logic from the VS-Claude-Continue extension. This eliminates the VS Code extension dependency and makes Jr-Continue self-contained.

## Context
- **Current workspace**: `C:\Users\erikc\Dev\Jr-Continue`
- **Extension source code**: `C:\Users\erikc\Dev\claude-md-continue\src\extension.ts`
- **Goal**: Create a standalone `ClaudeMdSync` agent that syncs CLAUDE.md files to `.continue/rules/`

## What Was Decided

### Architecture Choice
- **New agent**: `agents/ClaudeMdSync.ts` (primary implementation)
- **Utilities**: `utils/claudeMd.ts` (pure functions for parsing/merging)
- **Integration point**: SessionManager calls sync during initialization
- **File watching**: Watcher agent monitors CLAUDE.md changes

### File Priority (merge order)
1. `~/.claude/CLAUDE.md` (global rules)
2. `./CLAUDE.md` (project rules)
3. `./CLAUDE.local.md` (local/personal rules)
4. `./.claude/instructions.md` (modern convention)

### Output Format
Merged content written to `.continue/rules/00-claude-md.md` with YAML frontmatter:
```yaml
---
name: CLAUDE.md Project Rules
alwaysApply: true
description: Auto-synced rules from CLAUDE.md files
---
```

## Implementation Plan

### Phase 1: Create Utilities (`utils/claudeMd.ts`)
Extract pure functions:
- `mergeClaudeMdFiles()` - Read and merge from 4 file locations
- `generateContinueRule()` - Add YAML frontmatter
- `calculateContentHash()` - SHA256 for change detection

**Reference**: Lines 133-214 in `C:\Users\erikc\Dev\claude-md-continue\src\extension.ts`

### Phase 2: Create ClaudeMdSync Agent (`agents/ClaudeMdSync.ts`)
Core responsibilities:
```typescript
export class ClaudeMdSync {
  async sync(): Promise<ClaudeMdSyncResult>
  async needsSync(): Promise<boolean>
  private async writeContinueRule(content: string): Promise<void>
}
```

### Phase 3: Update State Schema (`state/schemas.ts`)
Add to SessionState:
```typescript
export interface ClaudeMdState {
  content: string;
  hash: string;
  lastSync: string;
  sources: { global, project, local, instructions };
  continueRulePath: string;
}
```

### Phase 4: Integrate with SessionManager (`agents/SessionManager.ts`)
Add sync call in `initialize()`:
```typescript
const claudeMdSync = new ClaudeMdSync(this.projectRoot, this.stateManager);
const syncResult = await claudeMdSync.sync();
```

### Phase 5: Add File Watching (`agents/Watcher.ts`)
Monitor CLAUDE.md changes and trigger re-sync:
```typescript
private isClaudeMdFile(filePath: string): boolean
private async handleClaudeMdChange(filePath: string): Promise<void>
```

### Phase 6: Write Tests
- Unit tests for ClaudeMdSync
- Integration tests with SessionManager and Watcher
- Manual verification with Continue.dev

## Critical Files

### To Create
- `agents/ClaudeMdSync.ts` - Main sync agent
- `utils/claudeMd.ts` - Helper utilities
- `tests/ClaudeMdSync.test.ts` - Unit tests

### To Modify
- `state/schemas.ts` - Add ClaudeMdState interface
- `agents/SessionManager.ts` - Call sync during init
- `agents/Watcher.ts` - Add CLAUDE.md monitoring
- `package.json` - Ensure chokidar dependency (likely already present)

## Reference Code
Extension source: `C:\Users\erikc\Dev\claude-md-continue\src\extension.ts`

**Key sections to port**:
- Lines 133-176: Reading files from 4 locations
- Line 180: Merging with section headers
- Lines 206-214: YAML frontmatter generation
- Lines 52-78: File watching patterns

## Success Criteria
✅ ClaudeMdSync reads and merges CLAUDE.md files
✅ Output written to `.continue/rules/00-claude-md.md`
✅ Hash-based change detection (no unnecessary writes)
✅ Watcher triggers re-sync on file changes
✅ State persisted in StateManager
✅ No VS Code dependencies
✅ Tests pass
✅ Continue.dev can read and apply rules

## Next Steps for Implementation

1. **Start with Phase 1**: Create `utils/claudeMd.ts` with pure functions
2. **Test utilities**: Ensure file reading and merging works correctly
3. **Build agent**: Implement `agents/ClaudeMdSync.ts`
4. **Integrate**: Wire into SessionManager and Watcher
5. **Verify**: Create test CLAUDE.md file and confirm sync works

## How to Begin

```bash
# You're already in the correct workspace
# Start by creating the utilities file
code utils/claudeMd.ts
```

**First task**: Implement `mergeClaudeMdFiles()` function that reads from the 4 file locations and merges their content with section headers.

## Questions Resolved
- ✅ Integration method: Native agent (not VS Code extension)
- ✅ Entry point: SessionManager initialization
- ✅ File watching: Watcher agent handles monitoring
- ✅ State storage: StateManager.architectural_design.CLAUDE_md
- ✅ Continue.dev interaction: Function calls/imports (not MCP server)

## Additional Context
- Token budget system: Configurable (already implemented in TokenBudget.ts)
- Pipeline flow: Router → Specialist → Critic (basic flow chosen)
- Todo list was created earlier but is now stale (can be cleared)

---

**Ready to implement. All design decisions made. Reference extension code at `C:\Users\erikc\Dev\claude-md-continue\src\extension.ts` for porting logic.**
