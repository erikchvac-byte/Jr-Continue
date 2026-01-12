const { Watcher } = require('./dist/agents/Watcher');
const { StateManager } = require('./dist/state/StateManager');
const path = require('path');
const fs = require('fs');

async function testWatcher() {
  const projectRoot = __dirname;
  const statePath = path.join(projectRoot, '.jr-continue', 'state.json');
  const stateManager = new StateManager(statePath);
  await stateManager.initialize();

  const watcher = new Watcher(projectRoot, stateManager);

  console.log('Starting watcher...');
  await watcher.start();

  console.log('Watcher started. Modify CLAUDE.md to test auto-sync.');
  console.log('Press Ctrl+C to stop.\n');

  // Keep process alive
  process.on('SIGINT', async () => {
    console.log('\nStopping watcher...');
    await watcher.stop();
    process.exit(0);
  });
}

testWatcher().catch(console.error);
