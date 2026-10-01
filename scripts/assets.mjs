// Turn the source artwork in design/icons into the plugin's images.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { KINDS } from '../com.pdito.mic-lock.sdPlugin/lib/devices.mjs';

const plugin = new URL('../com.pdito.mic-lock.sdPlugin/imgs/', import.meta.url);
const devices = new URL('devices/', plugin);
mkdirSync(devices, { recursive: true });

// Fade the artwork's edges to transparent so it sits on the key's black background seamlessly.
const SIZE = 216;
const fade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><defs><radialGradient id="g" r="0.5"><stop offset="0.78" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/></svg>`);
for (const kind of Object.keys(KINDS)) {
  const source = new URL(`../design/icons/${kind}.png`, import.meta.url).pathname;
  await sharp(source).resize(SIZE, SIZE).ensureAlpha().composite([{ input: fade, blend: 'dest-in' }]).png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(new URL(`${kind}.png`, devices).pathname);
}

// key.mjs reads the device images at import time, so load it after they exist.
const { keySvg } = await import('../com.pdito.mic-lock.sdPlugin/lib/key.mjs');
const png = (svg, size, name) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(new URL(`${name}.png`, plugin).pathname);
const keyImage = keySvg({ kind: 'broadcast', label: 'Mic Lock' });
await png(keyImage, 144, 'key'); await png(keyImage, 288, 'key@2x');

// Action list and category glyphs: a white microphone outline, as Stream Deck expects.
const glyph = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"><rect x="7" y="2" width="6" height="10" rx="3"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v3M7 18h6"/></svg>';
await png(glyph, 20, 'action'); await png(glyph, 40, 'action@2x');
await png(glyph, 28, 'category'); await png(glyph, 56, 'category@2x');
await png(keySvg({ kind: 'broadcast', label: '' }), 256, 'plugin'); await png(keySvg({ kind: 'broadcast', label: '' }), 512, 'plugin@2x');

// A preview of every icon for the README.
const kinds = Object.keys(KINDS);
const labels = { broadcast: 'Wave XLR', 'usb-mic': 'Wave:3', airpods: 'AirPods Pro 3', 'airpods-max': 'AirPods Max', beats: 'Beats Fit Pro', headphones: 'WH-1000XM4', webcam: 'Insta360 Link', iphone: 'iPhone', builtin: 'MacBook Pro', virtual: 'Loopback', mic: 'USB Audio' };
const tiles = await Promise.all(kinds.map(async (kind, i) => ({
  input: await sharp(Buffer.from(keySvg({ kind, label: labels[kind], position: i % 4, count: 4, locked: true }))).resize(144, 144).png().toBuffer(),
  left: 12 + (i % 6) * 156, top: 12 + Math.floor(i / 6) * 156,
})));
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
await sharp({ create: { width: 12 + 6 * 156, height: 12 + Math.ceil(kinds.length / 6) * 156, channels: 4, background: '#1b1b1b' } })
  .composite(tiles).png().toFile(new URL('../docs/icons.png', import.meta.url).pathname);
console.log(`Wrote ${kinds.length} device icons and plugin images.`);
