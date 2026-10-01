// The lock: remembers the mic you chose and undoes switches you didn't make.
//
// macOS makes a newly connected Bluetooth headset the default input. A default-input change
// to a device that appeared within GRACE_MS is treated as that automatic switch and reverted.
// Any other change (menu bar, System Settings, another app) is treated as a deliberate choice
// and becomes the new lock, unless strict mode is on.
export const GRACE_MS = 6000;
const PENDING_MS = 2000;
const STORM_LIMIT = 5;
const STORM_MS = 15000;

export class MicLock {
  constructor({ setDefault, save = () => {}, onChange = () => {}, now = Date.now }) {
    this.setDefault = setDefault; this.save = save; this.onChange = onChange; this.now = now;
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

  loadSettings(settings) {
    this.settings = { devices: {}, ...settings };
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

  snapshot({ inputs, defaultInput }) {
    const next = new Map(inputs.map(device => [device.uid, device]));
    const at = this.now();
    if (this.inputs) for (const uid of next.keys()) if (!this.inputs.has(uid)) this.addedAt.set(uid, at);
    for (const uid of this.addedAt.keys()) if (!next.has(uid)) this.addedAt.delete(uid);
    this.inputs = next;
    this.current = defaultInput || null;
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

  select(uid) {
    if (!this.connected(uid)) return false;
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

  adopt(uid) {
    if (this.settings.locked === uid) return;
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
      if (enabled && target && this.current !== target) { this.select(target); return; }
      return this.adopt(this.current);
    }
    if (this.current === locked) { this.pending = null; return; }
    // While our own switch is in flight, a stale default is not a user choice.
    const inFlight = this.pending && at - this.pending.at < PENDING_MS;
    if (!inFlight) this.pending = null;
    if (!enabled) return inFlight ? undefined : this.adopt(this.current);
    if (!this.connected(locked)) {
      // The locked mic went away: fall back to home rather than whatever macOS picked.
      if (this.connected(home) && this.current !== home) { this.select(home); return; }
      return inFlight ? undefined : this.adopt(this.current);
    }
    const automatic = at - (this.addedAt.get(this.current) ?? -Infinity) <= GRACE_MS;
    if (strict || automatic) return this.revert(locked);
    if (!inFlight) this.adopt(this.current);
  }

  revert(uid) {
    const at = this.now();
    this.reverts = this.reverts.filter(t => at - t < STORM_MS);
    if (this.reverts.length >= STORM_LIMIT) return this.adopt(this.current); // Don't fight forever.
    this.reverts.push(at);
    this.pending = { uid, at };
    this.setDefault(uid);
  }
}
