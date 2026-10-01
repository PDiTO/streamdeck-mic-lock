import { readFileSync, existsSync } from 'node:fs';
import { KINDS } from './devices.mjs';

const icons = Object.fromEntries(Object.keys(KINDS).map(kind => {
  const file = new URL(`../imgs/devices/${kind}.png`, import.meta.url);
  return [kind, existsSync(file) ? readFileSync(file).toString('base64') : null];
}));

const escape = text => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// Shrink long names to fit the 144px key on one line, using rough bold glyph widths.
function labelSize(text) {
  const em = [...text].reduce((sum, c) => sum + (/[A-Z0-9MWmw]/.test(c) ? 0.68 : /[il.,:;'’| -]/.test(c) ? 0.32 : 0.56), 0);
  return Math.max(11, Math.min(22, Math.floor(130 / Math.max(em, 1))));
}

// position/count draw the dots that show where you are in the cycle.
export function keySvg({ kind = 'mic', label = 'Mic', position = -1, count = 0, locked = false, muted = false } = {}) {
  const icon = icons[kind] || icons.mic;
  const size = labelSize(label);
  const dots = count > 1 && count <= 8 ? Array.from({ length: count }, (_, i) => {
    const x = 72 + (i - (count - 1) / 2) * 11;
    return `<circle cx="${x}" cy="10" r="${i === position ? 3.5 : 2.5}" fill="${i === position ? '#ffffff' : '#5c6370'}"/>`;
  }).join('') : '';
  const lock = locked ? '<g transform="translate(124 4)" fill="#8ab4f8"><rect x="0" y="6" width="12" height="9" rx="2"/><path d="M3 6V4a3 3 0 0 1 6 0v2" stroke="#8ab4f8" stroke-width="2" fill="none"/></g>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144">`
    + '<rect width="144" height="144" fill="#000"/>'
    + (icon ? `<image x="18" y="10" width="108" height="108" opacity="${muted ? 0.35 : 1}" xlink:href="data:image/png;base64,${icon}"/>` : '')
    + dots + lock
    + `<text x="72" y="137" font-family="Helvetica Neue, Arial, sans-serif" font-weight="700" font-size="${size}" text-anchor="middle" fill="${muted ? '#8a8f98' : '#ffffff'}">${escape(label)}</text>`
    + '</svg>';
}

export const dataUri = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
