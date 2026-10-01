// miclock: a tiny CoreAudio bridge for the Mic Lock Stream Deck plugin.
//
//   miclock list         Print one snapshot of the input devices as JSON.
//   miclock set <uid>    Make <uid> the system default input.
//   miclock watch        Print a snapshot line on every device or default-input change.
//                        Reads "set <uid>" lines from stdin; exits when stdin closes.
import CoreAudio
import Foundation

let system = AudioObjectID(kAudioObjectSystemObject)
let queue = DispatchQueue(label: "miclock")

func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}

func string(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String? {
  var addr = address(selector)
  var value: Unmanaged<CFString>?
  var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  guard AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &value) == noErr, let value else { return nil }
  return value.takeRetainedValue() as String
}

func uint32(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector) -> UInt32? {
  var addr = address(selector)
  var value: UInt32 = 0
  var size = UInt32(MemoryLayout<UInt32>.size)
  return AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &value) == noErr ? value : nil
}

func fourCC(_ value: UInt32) -> String {
  let bytes = [24, 16, 8, 0].map { UInt8((value >> UInt32($0)) & 0xff) }
  return String(decoding: bytes, as: UTF8.self).trimmingCharacters(in: .whitespaces)
}

func hasInput(_ id: AudioObjectID) -> Bool {
  var addr = address(kAudioDevicePropertyStreams, kAudioObjectPropertyScopeInput)
  var size: UInt32 = 0
  return AudioObjectGetPropertyDataSize(id, &addr, 0, nil, &size) == noErr && size > 0
}

func deviceIDs() -> [AudioDeviceID] {
  var addr = address(kAudioHardwarePropertyDevices)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(system, &addr, 0, nil, &size) == noErr else { return [] }
  var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
  guard AudioObjectGetPropertyData(system, &addr, 0, nil, &size, &ids) == noErr else { return [] }
  return ids
}

func defaultInput() -> AudioDeviceID? {
  guard let id = uint32(system, kAudioHardwarePropertyDefaultInputDevice), id != kAudioObjectUnknown else { return nil }
  return id
}

func snapshot(_ reason: String) -> [String: Any] {
  let inputs: [[String: Any]] = deviceIDs().compactMap { id in
    guard hasInput(id), uint32(id, kAudioDevicePropertyIsHidden) != 1, let uid = string(id, kAudioDevicePropertyDeviceUID) else { return nil }
    return [
      "uid": uid,
      "name": string(id, kAudioObjectPropertyName) ?? uid,
      "manufacturer": string(id, kAudioObjectPropertyManufacturer) ?? "",
      "model": string(id, kAudioDevicePropertyModelUID) ?? "",
      "transport": uint32(id, kAudioDevicePropertyTransportType).map(fourCC) ?? "",
    ]
  }
  let current = defaultInput().flatMap { string($0, kAudioDevicePropertyDeviceUID) }
  return ["type": "snapshot", "reason": reason, "defaultInput": current ?? NSNull(), "inputs": inputs]
}

func emit(_ object: [String: Any]) {
  guard var data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return }
  data.append(0x0a)
  FileHandle.standardOutput.write(data)
}

func setDefault(_ uid: String) -> Bool {
  var addr = address(kAudioHardwarePropertyTranslateUIDToDevice)
  var cfUID = uid as CFString
  var id = AudioDeviceID(kAudioObjectUnknown)
  var size = UInt32(MemoryLayout<AudioDeviceID>.size)
  let status = withUnsafeMutablePointer(to: &cfUID) {
    AudioObjectGetPropertyData(system, &addr, UInt32(MemoryLayout<CFString>.size), $0, &size, &id)
  }
  guard status == noErr, id != kAudioObjectUnknown, hasInput(id) else { return false }
  var target = address(kAudioHardwarePropertyDefaultInputDevice)
  return AudioObjectSetPropertyData(system, &target, 0, nil, UInt32(MemoryLayout<AudioDeviceID>.size), &id) == noErr
}

let args = CommandLine.arguments.dropFirst()
switch args.first {
case "list":
  emit(snapshot("list"))
case "set" where args.count == 2:
  exit(setDefault(args.last!) ? 0 : 1)
case "watch":
  for selector in [kAudioHardwarePropertyDevices, kAudioHardwarePropertyDefaultInputDevice] {
    var addr = address(selector)
    let reason = selector == kAudioHardwarePropertyDevices ? "devices" : "default"
    AudioObjectAddPropertyListenerBlock(system, &addr, queue) { _, _ in emit(snapshot(reason)) }
  }
  queue.async { emit(snapshot("initial")) }
  Thread.detachNewThread {
    while let line = readLine() {
      let parts = line.split(separator: " ", maxSplits: 1).map(String.init)
      guard parts.count == 2, parts[0] == "set" else { continue }
      queue.async { emit(["type": "set", "uid": parts[1], "ok": setDefault(parts[1])]) }
    }
    exit(0) // The plugin went away; don't linger.
  }
  dispatchMain()
default:
  FileHandle.standardError.write(Data("usage: miclock list | set <uid> | watch\n".utf8))
  exit(64)
}
