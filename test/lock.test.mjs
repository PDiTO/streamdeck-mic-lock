import test from 'node:test';
import assert from 'node:assert/strict';
import { MicLock, GRACE_MS } from '../com.pdito.mic-lock.sdPlugin/lib/lock.mjs';

const XLR = { uid: 'xlr', name: 'Elgato Wave XLR Dock MK.2', transport: 'usb' };
const CAM = { uid: 'cam', name: 'Insta360 Link', transport: 'usb' };
const PODS = { uid: 'pods', name: 'Paul’s AirPods Pro 3', transport: 'blue' };
const XM4 = { uid: 'xm4', name: 'WH-1000XM4', transport: 'blue' };

function setup(settings = { enabled: true, home: 'xlr' }, inputs = [XLR, CAM], current = 'xlr') {
  let now = 1000;
  const sets = [], saves = [];
  const lock = new MicLock({ setDefault: uid => sets.push(uid), save: s => saves.push(s), now: () => now });
  lock.loadSettings(settings);
  lock.snapshot({ inputs, defaultInput: current });
  // Simulate macOS: report the default changing, optionally with new device list.
  const report = (defaultInput, list = [...lock.inputs.values()]) => lock.snapshot({ inputs: list, defaultInput });
  // Apply the helper's pending set, as macOS would.
  const land = () => report(sets.at(-1));
  return { lock, sets, saves, report, land, advance: ms => { now += ms; } };
}

test('Connecting headphones that grab the mic switches it back', () => {
  const s = setup();
  s.report('xlr', [XLR, CAM, PODS]);
  s.advance(800);
  s.report('pods');
  assert.deepEqual(s.sets, ['xlr']);
  s.land();
  assert.equal(s.lock.settings.locked, 'xlr');
});

test('macOS switching after the device list event, in either order, is still reverted', () => {
  const s = setup();
  s.report('pods', [XLR, CAM, PODS]); // Default change and new device in one snapshot.
  assert.deepEqual(s.sets, ['xlr']);
  s.land();
  // AirPods renegotiating a moment later grabs it again; still within the grace window.
  s.advance(1500);
  s.report('pods');
  assert.deepEqual(s.sets, ['xlr', 'xlr']);
});

test('A menu-bar change to an existing device becomes the new lock', () => {
  const s = setup(undefined, [XLR, CAM, PODS]);
  s.advance(GRACE_MS * 2);
  s.report('cam');
  assert.deepEqual(s.sets, []);
  assert.equal(s.lock.settings.locked, 'cam');
});

test('Choosing freshly connected headphones from the menu after the grace window sticks', () => {
  const s = setup();
  s.report('xlr', [XLR, CAM, PODS]);
  s.advance(GRACE_MS + 1);
  s.report('pods');
  assert.deepEqual(s.sets, []);
  assert.equal(s.lock.settings.locked, 'pods');
});

test('Strict mode reverts every change it did not make', () => {
  const s = setup({ enabled: true, strict: true, home: 'xlr' });
  s.advance(GRACE_MS * 2);
  s.report('cam');
  assert.deepEqual(s.sets, ['xlr']);
});

test('With the lock off, the key just follows the system', () => {
  const s = setup({ enabled: false, home: 'xlr' });
  s.report('pods', [XLR, CAM, PODS]);
  assert.deepEqual(s.sets, []);
  assert.equal(s.lock.settings.locked, 'pods');
});

test('Tapping cycles through connected, included devices with home first, and the choice holds', () => {
  const s = setup(undefined, [CAM, XLR, PODS]);
  s.lock.updateDevice('cam', { skip: true });
  assert.deepEqual(s.lock.cycle(), ['xlr', 'pods']);
  s.lock.next(); s.land();
  assert.equal(s.lock.current, 'pods');
  assert.equal(s.lock.settings.locked, 'pods');
  // Connecting another headset doesn't take the mic off the AirPods.
  s.report('xm4', [CAM, XLR, PODS, XM4]);
  assert.equal(s.sets.at(-1), 'pods');
  s.land();
  s.lock.next(); s.land();
  assert.equal(s.lock.current, 'xm4');
  s.lock.next(); s.land();
  assert.equal(s.lock.current, 'xlr');
});

test('A stale default reported while our switch is in flight is not adopted', () => {
  const s = setup();
  s.lock.next(); // Asks for cam.
  s.report('xlr'); // Unrelated event before the switch lands.
  assert.equal(s.lock.settings.locked, 'cam');
  s.land();
  assert.equal(s.lock.current, 'cam');
});

test('When the locked mic disconnects, fall back to home', () => {
  const s = setup(undefined, [XLR, CAM, PODS]);
  s.lock.select('pods'); s.land();
  s.advance(GRACE_MS * 2);
  s.report('cam', [XLR, CAM]); // AirPods out; macOS picks the webcam.
  assert.equal(s.sets.at(-1), 'xlr');
  s.land();
  assert.equal(s.lock.settings.locked, 'xlr');
});

test('Hold goes home', () => {
  const s = setup(undefined, [XLR, CAM, PODS]);
  s.lock.select('pods'); s.land();
  s.advance(5000);
  assert.equal(s.lock.goHome(), true);
  assert.equal(s.sets.at(-1), 'xlr');
});

test('On launch the saved lock is restored', () => {
  const s = setup({ enabled: true, home: 'xlr', locked: 'cam', devices: { xlr: { name: XLR.name }, cam: { name: CAM.name } } }, [XLR, CAM], 'xlr');
  assert.deepEqual(s.sets, ['cam']);
});

test('It stops fighting if something keeps switching the mic', () => {
  const s = setup({ enabled: true, strict: true, home: 'xlr' });
  for (let i = 0; i < 8; i++) { s.advance(2001); s.report('cam'); } // Each past the in-flight window.
  assert.equal(s.sets.length, 5);
  assert.equal(s.lock.settings.locked, 'cam');
});

test('Devices are remembered in first-seen order for the settings page', () => {
  const s = setup(undefined, [XLR]);
  s.report('xlr', [XLR, PODS]);
  s.report('xlr', [XLR]);
  assert.deepEqual(Object.keys(s.lock.settings.devices), ['xlr', 'pods']);
  assert.deepEqual(s.lock.cycle(), ['xlr']);
});

test('The mic in use on first run becomes home', () => {
  const s = setup({ enabled: true }, [XLR, CAM], 'cam');
  assert.equal(s.lock.settings.home, 'cam');
});
