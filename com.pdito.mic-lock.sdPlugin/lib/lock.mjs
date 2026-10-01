// The lock: remembers the mic you chose and undoes switches you didn't make.
//
// macOS makes Bluetooth headsets the default input when they connect, and again when their
// audio moves to the Mac (AirPods can sit connected while playing from an iPhone, then take
// the mic when a video starts). So a switch Mic Lock didn't make is reverted when it lands on
// a Bluetooth device, or on any device that appeared within GRACE_MS. Other changes (menu bar,
// System Settings, another app) count as deliberate and become the new lock, unless strict.
export const GRACE_MS = 6000;
const PENDING_MS = 2000;
const STORM_LIMIT = 5;
const STORM_MS = 15000;

export class MicLock {
  constructor({ setDefault, save = () => {}, onChange = () => {}, log = () => {}, now = Date.now }) {
    this.setDefault = setDefault; this.save = save; this.onChange = onChange; this.log = log; this.now = now;
    this.settings = null;
    this.inputs = null; // Map uid -> device; null until the helper reports.
    this.current = null;
    this.addedAt = new Map();
    this.pending = null;
    this.reverts = [];
    this.started = false;
  }

  get ready() { return this.settings !== null && this.inputs !== null; }
  connected(uid) { return !!uid && !!this.inputs?.has(uid); }
  name(uid) { return this.inputs?.get(uid)?.name || this.settings?.devices?.[uid]?.name || uid || 'none'; }
  bluetooth(uid) { return ['blue', 'blea'].includes(this.inputs?.get(uid)?.transport); }

  loadSettings(settings) {
    this.settings = { devices: {}, ...settings };
    this.log(`settings: lock ${this.settings.enabled ? 'on' : 'off'}${this.settings.strict ? ', strict' : ''}, home ${this.name(this.settings.home)}, locked ${this.name(this.settings.locked)}`);
    this.enforce();
    this.onChange();
  }

  update(patch) {
    this.settings = { ...this.settings, ...patch };
    this.save(this.settings);
    this.enforce();
    this.onChange();
  }

  updateDevice(uid, patch) {
    const devices = { ...this.settings.devices, [uid]: { ...this.settings.devices[uid], ...patch } };
    this.update({ devices });
  }

  snapshot({ inputs, defaultInput, reason = 'update' }) {
    const next = new Map(inputs.map(device => [device.uid, device]));
    const at = this.now();
    const added = this.inputs ? [...next.keys()].filter(uid => !this.inputs.has(uid)) : [];
    const removed = this.inputs ? [...this.inputs.keys()].filter(uid => !next.has(uid)) : [];
    for (const uid of added) this.addedAt.set(uid, at);
    for (const uid of removed) this.addedAt.delete(uid);
    const changed = (defaultInput || null) !== this.current;
    const previous = this.inputs;
    const names = uids => uids.map(uid => (next.get(uid) || previous.get(uid)).name).join(', ');
    this.inputs = next;
    this.current = defaultInput || null;
    if (!this.started || changed || added.length || removed.length) {
      this.log(`${reason}: mic ${this.name(this.current)}${added.length ? `; connected ${names(added)}` : ''}${removed.length ? `; disconnected ${names(removed)}` : ''}`);
    }
    if (this.settings) this.remember();
    this.enforce();
    this.onChange();
  }

  // Keep a record of every input ever seen so settings survive disconnects, in first-seen order.
  remember() {
    let changed = false;
    const devices = { ...this.settings.devices };
    for (const device of this.inputs.values()) {
      if (devices[device.uid]?.name === device.name) continue;
      devices[device.uid] = { ...devices[device.uid], name: device.name };
      changed = true;
    }
    if (changed) { this.settings = { ...this.settings, devices }; this.save(this.settings); }
  }

  // Devices a tap cycles through, in first-seen order with the home mic first.
  cycle() {
    if (!this.ready) return [];
    const home = this.settings.home;
    return Object.keys(this.settings.devices)
      .filter(uid => this.connected(uid) && !this.settings.devices[uid].skip)
      .sort((a, b) => (b === home) - (a === home));
  }

  select(uid, why = 'selected') {
    if (!this.connected(uid)) return false;
    this.log(`${why} ${this.name(uid)}`);
    this.pending = { uid, at: this.now() };
    if (this.settings.locked !== uid) { this.settings = { ...this.settings, locked: uid }; this.save(this.settings); }
    if (this.current !== uid) this.setDefault(uid);
    this.onChange();
    return true;
  }

  next() {
    const list = this.cycle();
    if (!list.length) return false;
    const index = list.indexOf(this.current);
    return this.select(list[(index + 1) % list.length]);
  }

  goHome() {
    const home = this.connected(this.settings?.home) ? this.settings.home : this.cycle()[0];
    return home ? this.select(home) : false;
  }

  adopt(uid, why = 'keeping your choice of') {
    if (this.settings.locked === uid) return;
    this.log(`${why} ${this.name(uid)}`);
    this.settings = { ...this.settings, locked: uid };
    this.save(this.settings);
  }

  enforce() {
    if (!this.ready || !this.current) return;
    const { locked, home, strict, enabled } = this.settings;
    const at = this.now();
    if (!this.started) {
      this.started = true;
      // Until the user picks one, the home mic is whatever was in use on first run.
      if (!home && this.connected(this.current)) { this.settings = { ...this.settings, home: this.current }; this.save(this.settings); }
      // On launch, restore the lock (the Mac may have rebooted onto another mic).
      const target = this.connected(locked) ? locked : this.connected(home) ? home : null;
      if (enabled && target && this.current !== target) { this.select(target, 'restoring'); return; }
      return this.adopt(this.current);
    }
    if (this.current === locked) { this.pending = null; return; }
    // While our own switch is in flight, a stale default is not a user choice.
    const inFlight = this.pending && at - this.pending.at < PENDING_MS;
    if (!inFlight) this.pending = null;
    if (!enabled) return inFlight ? undefined : this.adopt(this.current);
    if (!this.connected(locked)) {
      // The locked mic went away: fall back to home rather than whatever macOS picked.
      if (this.connected(home) && this.current !== home) { this.select(home, `${this.name(locked)} is gone, back to`); return; }
      return inFlight ? undefined : this.adopt(this.current);
    }
    const fresh = at - (this.addedAt.get(this.current) ?? -Infinity) <= GRACE_MS;
    if (strict || fresh || this.bluetooth(this.current)) return this.revert(locked);
    if (!inFlight) this.adopt(this.current);
  }

  revert(uid) {
    const at = this.now();
    this.reverts = this.reverts.filter(t => at - t < STORM_MS);
    if (this.reverts.length >= STORM_LIMIT) return this.adopt(this.current, 'giving up after repeated switches, keeping'); // Don't fight forever.
    this.reverts.push(at);
    this.log(`switching back from ${this.name(this.current)} to ${this.name(uid)}`);
    this.pending = { uid, at };
    this.setDefault(uid);
  }
}
