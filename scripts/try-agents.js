// Live check of src/main/agents.js against the agents installed here:
//   node scripts/try-agents.js <folder> [claude-model] [codex-model]
// Each one makes hello-<agent>.txt (its permission prompt answered yes), then answers a follow-up.
const fs = require('node:fs');
const path = require('node:path');
const { createAgents } = require('../src/main/agents');
const [dir, claudeModel = 'haiku', codexModel] = process.argv.slice(2);
const waits = new Map();
const agents = createAgents({
  log: (l) => console.log('  log', l.slice(0, 160)),
  onEvent: (e) => {
    console.log(`  ${e.id} ${e.type} ${JSON.stringify({ ...e, id: undefined, type: undefined }).slice(0, 140)}`);
    if (e.type === 'ask') agents.answer(e.id, e.askId, { decision: 'allow' });
    if (e.type === 'turn' || e.type === 'closed') waits.get(e.id)?.(e);
  },
});
const turn = (id, text) => new Promise((resolve) => { waits.set(id, resolve); agents.send(id, text); });
(async () => {
  for (const [agent, model] of [['claude', claudeModel], ['codex', codexModel]]) {
    const file = path.join(dir, `hello-${agent}.txt`); fs.rmSync(file, { force: true });
    const id = agents.start({ agent, cwd: dir, model });
    console.log(`${agent}:`);
    const a = await turn(id, `Create the file hello-${agent}.txt containing the word hi. Do nothing else.`);
    const b = await turn(id, 'What file did you just create? Answer with the file name only.');
    console.log(`${agent}: ${a.status}/${b.status}, file ${fs.existsSync(file) ? 'made' : 'MISSING'}, resume ${agents.list().find((s) => s.id === id)?.resume}`);
    agents.close(id);
  }
  setTimeout(() => process.exit(0), 500);
})();
setTimeout(() => { console.log('timeout'); process.exit(1); }, 300000);
