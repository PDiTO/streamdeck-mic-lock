import test from 'node:test';
import assert from 'node:assert/strict';
import { MicLock } from '../com.pdito.mic-lock.sdPlugin/lib/lock.mjs';
import { Controller, HOLD_MS, ACTION } from '../com.pdito.mic-lock.sdPlugin/lib/controller.mjs';

const XLR = { uid: 'xlr', name: 'Elgato Wave XLR Dock MK.2', manufacturer: 'Elgato', transport: 'usb' };
const PODS = { uid: 'pods', name: 'Paul’s AirPods Pro 3', transport: 'blue' };

function setup(settings = {}) {
  let now = 1000, id = 0;
  const timers = new Map(), sent = [], sets = [];
  const lock = new MicLock({ setDefault: uid => sets.push(uid), save: () => {}, now: () => now });
  const c = new Controller(x => sent.push(x), lock, {
    now: () => now, schedule: fn => { timers.set(++id, fn); return id; }, cancel: i => timers.delete(i),
  });
  lock.onChange = () => c.renderAll();
  lock.loadSettings(settings);
  lock.snapshot({ inputs: [XLR, PODS], defaultInput: 'xlr' });
  const event = (name, extra = {}) => c.handle({ event: name, context: 'k', action: ACTION, payload: {}, ...extra });
  event('willAppear');
  return { c, lock, sent, sets, timers, event, advance: ms => { now += ms; } };
}

test('Adding the key turns the lock on once; a later "off" is respected', () => {
  const s = setup();
  assert.equal(s.lock.settings.enabled, true);
  s.c.handle({ event: 'sendToPlugin', context: 'k', payload: { type: 'option', name: 'enabled', value: false } });
  s.event('willAppear');
  assert.equal(s.lock.settings.enabled, false);
});

test('Tap selects the next mic; hold returns home', () => {
  const s = setup({ home: 'xlr' });
  s.event('keyDown'); s.advance(100); s.event('keyUp');
  assert.deepEqual(s.sets, ['pods']);
  s.lock.snapshot({ inputs: [XLR, PODS], defaultInput: 'pods' });
  s.event('keyDown'); s.advance(HOLD_MS); [...s.timers.values()][0](); s.event('keyUp');
  assert.deepEqual(s.sets, ['pods', 'xlr']);
  assert.equal(s.timers.size, 0);
});

test('The key shows the actual system mic with the user label', () => {
  const s = setup({ home: 'xlr' });
  s.c.handle({ event: 'sendToPlugin', context: 'k', payload: { type: 'device', uid: 'xlr', label: 'SM7B' } });
  const image = s.sent.filter(m => m.event === 'setImage').at(-1).payload.image;
  assert.match(Buffer.from(image.split(',')[1], 'base64').toString(), />SM7B</);
});

test('The settings page gets every remembered device', () => {
  const s = setup({ home: 'xlr' });
  s.c.handle({ event: 'propertyInspectorDidAppear', context: 'k' });
  const payload = s.sent.filter(m => m.event === 'sendToPropertyInspector').at(-1).payload;
  assert.deepEqual(payload.devices.map(d => [d.uid, d.auto, d.current]), [['xlr', 'broadcast', true], ['pods', 'airpods', false]]);
});

test('A device can only be forgotten while disconnected', () => {
  const s = setup();
  s.c.handle({ event: 'sendToPlugin', context: 'k', payload: { type: 'forget', uid: 'pods' } });
  assert.ok(s.lock.settings.devices.pods);
  s.lock.snapshot({ inputs: [XLR], defaultInput: 'xlr' });
  s.c.handle({ event: 'sendToPlugin', context: 'k', payload: { type: 'forget', uid: 'pods' } });
  assert.equal(s.lock.settings.devices.pods, undefined);
});
