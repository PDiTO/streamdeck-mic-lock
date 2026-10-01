import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { MicLock } from './lib/lock.mjs';
import { Controller } from './lib/controller.mjs';

const args = Object.fromEntries(Array.from({ length: Math.floor((process.argv.length - 2) / 2) }, (_, i) => [process.argv[2 + i * 2], process.argv[3 + i * 2]]));
if (!/^\d+$/.test(args['-port'] || '') || args['-registerEvent'] !== 'registerPlugin' || !args['-pluginUUID']) throw new Error('Launch this plugin from Stream Deck.');
const pluginUUID = args['-pluginUUID'];

const ws = new WebSocket(`ws://127.0.0.1:${args['-port']}`);
const send = message => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };

// A small rolling log of what the lock saw and did, for figuring out surprises.
const logDir = join(homedir(), 'Library/Logs/Mic Lock');
const logFile = join(logDir, 'mic-lock.log');
function log(message) {
  try {
    mkdirSync(logDir, { recursive: true });
    if ((statSync(logFile, { throwIfNoEntry: false })?.size ?? 0) > 512 * 1024) renameSync(logFile, `${logFile}.old`);
    appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
  } catch { /* Logging must never break the lock. */ }
}
log('started');

let helper = null;
let restartDelay = 1000;
let stopping = false;
const lock = new MicLock({
  setDefault: uid => helper?.stdin.write(`set ${uid}\n`),
  save: settings => send({ event: 'setGlobalSettings', context: pluginUUID, payload: settings }),
  onChange: () => controller.renderAll(),
  log,
});
const controller = new Controller(send, lock);

function startHelper() {
  const child = spawn(fileURLToPath(new URL('./bin/miclock', import.meta.url)), ['watch'], { stdio: ['pipe', 'pipe', 'ignore'] });
  helper = child;
  child.stdin.on('error', () => {});
  child.on('error', () => {});
  createInterface({ input: child.stdout }).on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.type !== 'snapshot') return;
    restartDelay = 1000;
    controller.helperOk = true;
    lock.snapshot(message);
  });
  child.on('exit', code => {
    if (helper === child) helper = null;
    if (stopping) return;
    log(`helper exited (${code}), restarting`);
    controller.helperOk = false;
    controller.renderAll();
    setTimeout(startHelper, restartDelay);
    restartDelay = Math.min(restartDelay * 2, 30000);
  });
}

ws.addEventListener('open', () => {
  send({ event: args['-registerEvent'], uuid: pluginUUID });
  send({ event: 'getGlobalSettings', context: pluginUUID });
  startHelper();
});
ws.addEventListener('message', ev => {
  let event;
  try { event = JSON.parse(ev.data); } catch { return; }
  if (event.event === 'didReceiveGlobalSettings') {
    lock.loadSettings(event.payload?.settings || {});
    controller.optIn();
    return;
  }
  controller.handle(event);
});

function stop() {
  stopping = true;
  controller.dispose();
  helper?.kill();
  process.exit(0);
}
ws.addEventListener('close', stop);
ws.addEventListener('error', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
