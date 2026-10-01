// Device classification and naming. Everything here works from what CoreAudio reports,
// so it covers devices we have never seen; users can override the kind per device.
export const KINDS = {
  broadcast: 'XLR / broadcast mic',
  'usb-mic': 'USB microphone',
  airpods: 'AirPods',
  'airpods-max': 'AirPods Max',
  beats: 'Beats / sport earbuds',
  headphones: 'Bluetooth headphones',
  webcam: 'Webcam',
  iphone: 'iPhone',
  builtin: 'Built-in mic',
  virtual: 'Virtual / software',
  mic: 'Generic microphone',
};

const INTERFACE = /\bxlr\b|scarlett|focusrite|motu|audient|apollo|universal audio|\bvolt\b|\bssl\b|solid state|goxlr|rodecaster|podtrak|steinberg|presonus|tascam|behringer|\bumc\d|\bevo\b|interface/i;
const WEBCAM = /insta360|webcam|camera|\bcam\b|brio|\bc9\d\d\b|kiyo|facecam|obsbot|opal|emeet/i;
const VIRTUAL = /blackhole|loopback|soundflower|krisp|virtual|wave link|zoomaudio|ms teams|aggregate/i;

export function classify(device) {
  const name = device.name || '';
  const transport = device.transport || '';
  if (/^cc/.test(transport) || /iphone/i.test(name) || /iphone/i.test(device.model || '')) return 'iphone';
  if (transport === 'bltn') return 'builtin';
  if (['virt', 'grup', 'fgrp'].includes(transport) || VIRTUAL.test(name)) return 'virtual';
  if (/airpods max/i.test(name)) return 'airpods-max';
  if (/airpods/i.test(name)) return 'airpods';
  if (/beats|powerbeats/i.test(name)) return 'beats';
  if (WEBCAM.test(name)) return 'webcam';
  if (INTERFACE.test(name)) return 'broadcast';
  if (transport === 'blue' || transport === 'blea') return 'headphones';
  if (transport === 'usb') return 'usb-mic';
  return 'mic';
}

// "Paul’s AirPods Pro 3" -> "AirPods Pro 3", "Elgato Wave XLR Dock MK.2" -> "Wave XLR Dock",
// "PD16 Microphone" -> "PD16".
export function shortName(device) {
  let name = (device.name || '').trim();
  name = name.replace(/^[^\s]+['’]s\s+/, '');
  // Drop the maker's name only when the label would otherwise be too long for the key.
  const maker = (device.manufacturer || '').split(/\s/)[0];
  if (name.length > 14 && maker.length > 2 && name.toLowerCase().startsWith(`${maker.toLowerCase()} `)) name = name.slice(maker.length + 1);
  name = name.replace(/\s+(mk\.?\s?\d+|mk\s?i+|gen\s?\d+)$/i, '');
  name = name.replace(/\s+(microphone|mic)$/i, '');
  return name.trim() || device.name || 'Mic';
}
