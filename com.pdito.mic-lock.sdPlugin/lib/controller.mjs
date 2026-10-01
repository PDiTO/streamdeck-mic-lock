import { classify, shortName, KINDS } from './devices.mjs';
import { keySvg, dataUri } from './key.mjs';

export const HOLD_MS = 700;
export const ACTION = 'com.pdito.mic-lock.cycle';

// What a device looks like on the key, after the user's per-device overrides.
export function describe(device, saved = {}) {
  return { kind: saved.kind || classify(device), label: saved.label || shortName(device) };
}

export class Controller {
  constructor(send, lock, clock = {}) {
    this.send = send; this.lock = lock; this.keys = new Map(); this.inspectors = new Set();
    this.helperOk = true;
    this.now = clock.now || Date.now;
    this.schedule = clock.schedule || setTimeout;
    this.cancel = clock.cancel || clearTimeout;
  }

  releaseTimer(key) { if (key?.press) this.cancel(key.press.timer); }

  handle(event) {
    const { context } = event;
    if (event.event === 'propertyInspectorDidAppear') { this.inspectors.add(context); this.sendDevices(context); return; }
    if (event.event === 'propertyInspectorDidDisappear') { this.inspectors.delete(context); return; }
    if (event.event === 'sendToPlugin') return this.fromInspector(context, event.payload || {});
    if (event.event === 'willDisappear') { this.releaseTimer(this.keys.get(context)); this.keys.delete(context); return; }
    if (event.event === 'willAppear') {
      if (event.action !== ACTION) return;
      this.releaseTimer(this.keys.get(context));
      this.keys.set(context, {});
      this.optIn();
    }
    const key = this.keys.get(context);
    if (!key) return;
    if (event.event === 'keyDown' && !key.press) {
      key.press = { at: this.now(), done: false };
      key.press.timer = this.schedule(() => {
        if (!key.press || key.press.done) return;
        key.press.done = true;
        if (!this.lock.goHome()) this.alert(context);
      }, HOLD_MS);
    }
    if (event.event === 'keyUp' && key.press) {
      const press = key.press;
      this.releaseTimer(key); key.press = null;
      if (!press.done) {
        const ok = this.now() - press.at >= HOLD_MS ? this.lock.goHome() : this.lock.next();
        if (!ok) this.alert(context);
      }
    }
    this.render(context);
  }

  // Adding the key is the opt-in; after that the lock stays on until turned off.
  optIn() {
    if (this.keys.size && this.lock.settings && this.lock.settings.enabled === undefined) this.lock.update({ enabled: true });
  }

  fromInspector(context, message) {
    const lock = this.lock;
    if (!lock.settings) return;
    if (message.type === 'devices') return this.sendDevices(context);
    if (message.type === 'option' && ['enabled', 'strict'].includes(message.name)) lock.update({ [message.name]: !!message.value });
    if (message.type === 'home') lock.update({ home: message.uid || null });
    if (message.type === 'device' && lock.settings.devices[message.uid]) {
      const patch = {};
      if ('skip' in message) patch.skip = !!message.skip;
      if ('kind' in message) patch.kind = message.kind || undefined;
      if ('label' in message) patch.label = String(message.label || '').slice(0, 24) || undefined;
      lock.updateDevice(message.uid, patch);
    }
    if (message.type === 'forget' && !lock.connected(message.uid)) {
      const { [message.uid]: _, ...devices } = lock.settings.devices;
      lock.update({ devices, home: lock.settings.home === message.uid ? null : lock.settings.home });
    }
  }

  inspectorState() {
    const { settings, inputs, current } = this.lock;
    if (!settings || !inputs) return { type: 'devices', ready: false, helperOk: this.helperOk };
    const devices = Object.entries(settings.devices).map(([uid, saved]) => {
      const device = inputs.get(uid) || { uid, name: saved.name };
      return { uid, name: device.name, connected: inputs.has(uid), current: uid === current, auto: classify(device), autoLabel: shortName(device), ...saved };
    });
    return { type: 'devices', ready: true, helperOk: this.helperOk, kinds: KINDS, devices, home: settings.home || null, enabled: !!settings.enabled, strict: !!settings.strict };
  }

  sendDevices(context) {
    this.send({ event: 'sendToPropertyInspector', context, action: ACTION, payload: this.inspectorState() });
  }

  alert(context) { this.send({ event: 'showAlert', context }); }

  view() {
    const { settings, inputs, current } = this.lock;
    if (!this.helperOk) return { kind: 'mic', label: 'No helper', muted: true };
    if (!settings || !inputs) return { kind: 'mic', label: 'Loading', muted: true };
    const device = inputs.get(current);
    if (!device) return { kind: 'mic', label: 'No mic', muted: true };
    const cycle = this.lock.cycle();
    return { ...describe(device, settings.devices[current]), position: cycle.indexOf(current), count: cycle.length, locked: !!settings.enabled };
  }

  render(context) {
    const key = this.keys.get(context);
    if (!key) return;
    const svg = keySvg(this.view());
    if (svg === key.lastSvg) return;
    key.lastSvg = svg;
    this.send({ event: 'setImage', context, payload: { image: dataUri(svg), target: 0 } });
  }

  renderAll() {
    for (const context of this.keys.keys()) this.render(context);
    for (const context of this.inspectors) this.sendDevices(context);
  }

  dispose() { for (const key of this.keys.values()) this.releaseTimer(key); this.keys.clear(); }
}
