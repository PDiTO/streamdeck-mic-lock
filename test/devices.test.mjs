import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, shortName } from '../com.pdito.mic-lock.sdPlugin/lib/devices.mjs';

// Real CoreAudio reports from a Mac, plus common devices.
const cases = [
  [{ name: 'Elgato Wave XLR Dock MK.2', manufacturer: 'Elgato', transport: 'usb' }, 'broadcast', 'Wave XLR Dock'],
  [{ name: 'Insta360 Link', manufacturer: 'Insta360', transport: 'usb' }, 'webcam', 'Insta360 Link'],
  [{ name: 'PD16 Microphone', manufacturer: 'Apple Inc.', model: 'iPhone Mic', transport: 'ccwd' }, 'iphone', 'PD16'],
  [{ name: 'WH-1000XM4', manufacturer: 'Apple Inc.', transport: 'blue' }, 'headphones', 'WH-1000XM4'],
  [{ name: 'Paul’s AirPods Pro 3', manufacturer: 'Apple Inc.', transport: 'blue' }, 'airpods', 'AirPods Pro 3'],
  [{ name: "Sam's AirPods Max", manufacturer: 'Apple Inc.', transport: 'blue' }, 'airpods-max', 'AirPods Max'],
  [{ name: 'Beats Fit Pro', manufacturer: 'Apple Inc.', transport: 'blue' }, 'beats', 'Beats Fit Pro'],
  [{ name: 'MacBook Pro Microphone', manufacturer: 'Apple Inc.', transport: 'bltn' }, 'builtin', 'MacBook Pro'],
  [{ name: 'Elgato Wave:3', manufacturer: 'Elgato', transport: 'usb' }, 'usb-mic', 'Elgato Wave:3'],
  [{ name: 'Scarlett 2i2 USB', manufacturer: 'Focusrite', transport: 'usb' }, 'broadcast', 'Scarlett 2i2 USB'],
  [{ name: 'BlackHole 2ch', manufacturer: 'Existential Audio Inc.', transport: 'virt' }, 'virtual', 'BlackHole 2ch'],
  [{ name: 'Elgato Wave Link Stream', manufacturer: 'Elgato', transport: 'virt' }, 'virtual', 'Wave Link Stream'],
  [{ name: 'Logitech BRIO', manufacturer: 'Logitech', transport: 'usb' }, 'webcam', 'Logitech BRIO'],
];

for (const [device, kind, label] of cases) {
  test(`${device.name} -> ${kind}, "${label}"`, () => {
    assert.equal(classify(device), kind);
    assert.equal(shortName(device), label);
  });
}
