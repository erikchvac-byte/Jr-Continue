const { ClaudeMdSync } = require('./dist/agents/ClaudeMdSync');
const { StateManager } = require('./dist/state/StateManager');

async function testSync() {
  const projectRoot = __dirname;
  const path = require('path');
  const statePath = path.join(projectRoot, '.jr-continue', 'state.json');
  const stateManager = new StateManager(statePath);
  await stateManager.initialize();
  const sync = new ClaudeMdSync(projectRoot, stateManager);

  const result = await sync.sync();
  console.log('Sync result:', result);
}

testSync().catch(console.error);
