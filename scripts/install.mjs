// Link this checkout into Stream Deck's plugin folder for local development.
import { existsSync, mkdirSync, symlinkSync, lstatSync, readlinkSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const plugin = join(root, 'com.pdito.mic-lock.sdPlugin');
const target = join(homedir(), 'Library/Application Support/com.elgato.StreamDeck/Plugins/com.pdito.mic-lock.sdPlugin');
function ownedLink() {
  try { return lstatSync(target).isSymbolicLink() && resolve(dirname(target), readlinkSync(target)) === plugin; }
  catch { return false; }
}
if (process.argv.includes('--uninstall')) {
  if (ownedLink()) { unlinkSync(target); console.log('Removed local plugin link.'); }
  process.exit(0);
}
if (!existsSync(join(plugin, 'bin/miclock'))) throw new Error('Run `npm run build` first.');
if (existsSync(target) && !ownedLink()) throw new Error('Another plugin already occupies the installation path.');
mkdirSync(dirname(target), { recursive: true });
if (!ownedLink()) symlinkSync(plugin, target);
console.log('Installed Mic Lock. Restart Stream Deck, then drag "Mic Lock" onto a key.');
