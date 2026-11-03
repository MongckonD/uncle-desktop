// macOS twin of computer.ps1 + computer-native.cs: the same JSON lines in and out (computer.js).
// Windows are read through the Accessibility API, input goes through CGEvent. Like on Windows,
// every input re-checks the target window, password fields are refused, and a stop file or Escape
// ends the job. Built on CI (npm run build:mac-helper) and shipped next to the app.
//
//   uncle-computer <her pid> <stop file>
import Cocoa
import ApplicationServices

@_silgen_name("_AXUIElementGetWindow") func _AXUIElementGetWindow(_ e: AXUIElement, _ id: UnsafeMutablePointer<CGWindowID>) -> AXError

struct Fail: Error { let message: String; init(_ m: String) { message = m } }
let args = CommandLine.arguments
let ownerPid = pid_t(args.count > 1 ? args[1] : "0") ?? 0
let cancelFile = args.count > 2 ? args[2] : ""
let selfPid = getpid()
let ok: [String: Any] = ["ok": true]
let ACCESS = "กรุณาอนุญาต Rocky ใน System Settings › Privacy & Security › Accessibility แล้วลองใหม่"

func attr(_ e: AXUIElement, _ name: String) -> AnyObject? { var v: AnyObject?; return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil }
func str(_ e: AXUIElement, _ name: String) -> String { (attr(e, name) as? String) ?? "" }
func frame(_ e: AXUIElement) -> CGRect? {
  guard let p = attr(e, kAXPositionAttribute), let s = attr(e, kAXSizeAttribute) else { return nil }
  var point = CGPoint.zero, size = CGSize.zero
  AXValueGetValue(p as! AXValue, .cgPoint, &point); AXValueGetValue(s as! AXValue, .cgSize, &size)
  return CGRect(origin: point, size: size)
}
func pidOf(_ e: AXUIElement) -> pid_t { var p: pid_t = 0; AXUIElementGetPid(e, &p); return p }
func allowed(_ pid: pid_t) -> Bool { pid != ownerPid && pid != selfPid }

// windows: by their window number (the id CGWindowList and Windows' handles play the part of)
func appWindows(_ pid: pid_t) -> [(Int, AXUIElement)] {
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue) // Electron and Chrome apps: their tree
  guard let wins = attr(app, kAXWindowsAttribute) as? [AXUIElement] else { return [] }
  return wins.compactMap { w in var id: CGWindowID = 0; return _AXUIElementGetWindow(w, &id) == .success && id != 0 ? (Int(id), w) : nil }
}
func apps() -> [NSRunningApplication] { NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular && allowed($0.processIdentifier) } }
func windowInfo(_ id: Int, _ pid: pid_t, _ w: AXUIElement) -> [String: Any] {
  let f = frame(w) ?? .zero, name = NSRunningApplication(processIdentifier: pid)?.localizedName ?? "", title = str(w, kAXTitleAttribute)
  return ["window": id, "title": title.isEmpty ? name : title, "process": name, "processId": Int(pid), "x": Int(f.minX), "y": Int(f.minY), "width": Int(f.width), "height": Int(f.height)]
}
func listWindows() -> [[String: Any]] {
  var out: [[String: Any]] = []
  for app in apps() { for (id, w) in appWindows(app.processIdentifier) where out.count < 40 && (attr(w, kAXMinimizedAttribute) as? Bool) != true { out.append(windowInfo(id, app.processIdentifier, w)) } }
  return out
}
func find(_ id: Int) throws -> (pid_t, AXUIElement) {
  for app in apps() { for (wid, w) in appWindows(app.processIdentifier) where wid == id { return (app.processIdentifier, w) } }
  throw Fail("หน้าต่างปิดไปแล้ว")
}
func frontWindow() -> (Int, pid_t, AXUIElement)? {
  guard let app = NSWorkspace.shared.frontmostApplication, allowed(app.processIdentifier) else { return nil }
  let pid = app.processIdentifier
  if let w = attr(AXUIElementCreateApplication(pid), kAXFocusedWindowAttribute) {
    var id: CGWindowID = 0
    if _AXUIElementGetWindow(w as! AXUIElement, &id) == .success, id != 0 { return (Int(id), pid, w as! AXUIElement) }
  }
  return appWindows(pid).first.map { ($0.0, pid, $0.1) }
}

let ROLES = ["AXTextField": "Edit", "AXComboBox": "ComboBox", "AXTextArea": "Document", "AXButton": "Button", "AXMenuButton": "Button",
  "AXMenuItem": "MenuItem", "AXPopUpButton": "ComboBox", "AXLink": "Hyperlink", "AXCheckBox": "CheckBox", "AXRadioButton": "RadioButton",
  "AXStaticText": "Text", "AXSlider": "Slider", "AXRow": "ListItem", "AXCell": "DataItem", "AXScrollBar": "ScrollBar",
  "AXIncrementor": "Spinner", "AXDisclosureTriangle": "TreeItem"]
func label(_ e: AXUIElement) -> String {
  for k in [kAXTitleAttribute, kAXDescriptionAttribute, "AXPlaceholderValue", kAXHelpAttribute] { let s = str(e, k); if !s.isEmpty { return s } }
  return ""
}
func secret(_ e: AXUIElement) -> Bool {
  if str(e, kAXSubroleAttribute) == "AXSecureTextField" { return true }
  let role = str(e, kAXRoleAttribute)
  return (role == "AXTextField" || role == "AXTextArea") && label(e).range(of: "password|passcode|card.?number|credit.?card|cvv|cvc|รหัสผ่าน|เลขบัตร|\\botp\\b", options: [.regularExpression, .caseInsensitive]) != nil
}
var targets: [Int: AXUIElement] = [:]
var lastWindow = 0

func read(_ requested: Int) throws -> [String: Any] {
  guard AXIsProcessTrusted() else { throw Fail(ACCESS) }
  targets = [:]
  let pick: (Int, pid_t, AXUIElement)
  if requested != 0 { let (p, w) = try find(requested); pick = (requested, p, w) }
  else if let f = frontWindow() { pick = f }
  else if let first = listWindows().first, let id = first["window"] as? Int { let (p, w) = try find(id); pick = (id, p, w) }
  else { throw Fail("ไม่พบหน้าต่างเป้าหมาย") }
  lastWindow = pick.0
  var rows: [[String: Any]] = [], queue = [pick.2], visited = 0
  let start = Date()
  while !queue.isEmpty && rows.count < 100 && visited < 650 && Date().timeIntervalSince(start) < 2.5 {
    let e = queue.removeFirst(); visited += 1
    let axRole = str(e, kAXRoleAttribute)
    if let role = ROLES[axRole], (attr(e, kAXEnabledAttribute) as? Bool) != false, let f = frame(e), f.width > 0, f.height > 0 {
      let id = rows.count + 1, hidden = secret(e); targets[id] = e
      var value = hidden ? "" : (attr(e, kAXValueAttribute) as? String) ?? ""
      if value.count > 1500 { value = String(value.prefix(1500)) }
      rows.append(["id": id, "identity": "\(axRole):\(Int(f.minX)),\(Int(f.minY))", "role": role, "name": hidden ? "[private field]" : label(e), "value": value,
        "secret": hidden, "focused": (attr(e, kAXFocusedAttribute) as? Bool) ?? false, "multiline": axRole == "AXTextArea",
        "x": Int(f.minX), "y": Int(f.minY), "width": Int(f.width), "height": Int(f.height)])
    }
    if let kids = attr(e, kAXChildrenAttribute) as? [AXUIElement] { queue.append(contentsOf: kids.prefix(100)) }
  }
  return ["app": windowInfo(pick.0, pick.1, pick.2), "foreground": frontWindow()?.0 ?? 0, "targets": rows]
}

func cancelled() throws {
  if !cancelFile.isEmpty && FileManager.default.fileExists(atPath: cancelFile) { throw Fail("หยุดแล้ว") }
  if CGEventSource.keyState(.combinedSessionState, key: 53) { throw Fail("หยุดด้วย Escape") }
}
func check(_ id: Int) throws -> (pid_t, AXUIElement) {
  try cancelled()
  let (p, w) = try find(id)
  if (attr(w, kAXMinimizedAttribute) as? Bool) == true { throw Fail("หน้าต่างถูกย่อ กรุณาเปิดให้เห็นก่อนเริ่ม") }
  return (p, w)
}
func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap) }
func mouse(_ type: CGEventType, _ p: CGPoint, _ button: CGMouseButton = .left, clicks: Int = 1) {
  let e = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: button)
  e?.setIntegerValueField(.mouseEventClickState, value: Int64(clicks)); post(e)
}
func focusedElement() -> AXUIElement? { attr(AXUIElementCreateSystemWide(), kAXFocusedUIElementAttribute).map { $0 as! AXUIElement } }

// Windows' key names: CTRL is ⌘ on a Mac (copy, paste, select all), WIN is control
let KEYS: [String: CGKeyCode] = {
  var k: [String: CGKeyCode] = ["ENTER": 36, "TAB": 48, "SPACE": 49, "BACKSPACE": 51, "ESC": 53, "DELETE": 117, "HOME": 115, "END": 119, "PAGEUP": 116, "PAGEDOWN": 121,
    "LEFT": 123, "RIGHT": 124, "DOWN": 125, "UP": 126, "PLUS": 24, "MINUS": 27, "PERIOD": 47, "INSERT": 114, "PRINTSCREEN": 105,
    "CTRL": 55, "SHIFT": 56, "ALT": 58, "WIN": 59]
  let letters: [CGKeyCode] = [0, 11, 8, 2, 14, 3, 5, 4, 34, 38, 40, 37, 46, 45, 31, 35, 12, 15, 1, 17, 32, 9, 13, 7, 16, 6]
  for (i, c) in "ABCDEFGHIJKLMNOPQRSTUVWXYZ".enumerated() { k[String(c)] = letters[i] }
  for (i, code) in ([29, 18, 19, 20, 21, 23, 22, 26, 28, 25] as [CGKeyCode]).enumerated() { k[String(i)] = code }
  for (i, code) in ([122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111] as [CGKeyCode]).enumerated() { k["F\(i + 1)"] = code }
  return k
}()
let FLAGS: [String: CGEventFlags] = ["CTRL": .maskCommand, "SHIFT": .maskShift, "ALT": .maskAlternate, "WIN": .maskControl]

func act(_ r: [String: Any]) throws -> [String: Any] {
  let action = r["action"] as? String ?? "", window = r["window"] as? Int ?? 0, target = r["target"] as? Int ?? 0, text = r["text"] as? String ?? ""
  var x = r["x"] as? Int ?? 0, y = r["y"] as? Int ?? 0
  let endX = r["endX"] as? Int ?? 0, endY = r["endY"] as? Int ?? 0, duration = r["duration"] as? Int ?? 600
  let (pid, w) = try find(window)
  if action == "focus" {
    NSRunningApplication(processIdentifier: pid)?.activate(options: [])
    AXUIElementSetAttributeValue(w, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
    AXUIElementPerformAction(w, kAXRaiseAction as CFString)
    usleep(180_000); _ = try check(window); return ok
  }
  _ = try check(window)
  if action == "minimize" { AXUIElementSetAttributeValue(w, kAXMinimizedAttribute as CFString, kCFBooleanTrue); return ok }
  if action == "close" { if let b = attr(w, kAXCloseButtonAttribute) { AXUIElementPerformAction(b as! AXUIElement, kAXPressAction as CFString) }; return ok }
  if window != lastWindow { throw Fail("ต้องอ่านหน้าต่างก่อนลงมือ") }
  var element: AXUIElement?
  if target > 0 {
    guard let e = targets[target] else { throw Fail("ไม่พบปุ่มเป้าหมาย") }
    if secret(e) { throw Fail("กรุณากรอกรหัสผ่านด้วยตนเอง") }
    guard let f = frame(e), f.width > 0, (attr(e, kAXEnabledAttribute) as? Bool) != false else { throw Fail("ปุ่มเป้าหมายยังใช้งานไม่ได้") }
    element = e; x = Int(f.midX); y = Int(f.midY)
  }
  if ["click", "double_click", "triple_click", "middle_click", "right_click", "scroll", "drag", "mouse_move"].contains(action) {
    let bounds = frame(w) ?? .zero, p = CGPoint(x: x, y: y)
    if !bounds.contains(p) { throw Fail("พิกัดอยู่นอกหน้าต่างเป้าหมาย") }
    // what's under the pointer: that app's, and never a password field
    var hit: AXUIElement?
    if AXUIElementCopyElementAtPosition(AXUIElementCreateSystemWide(), Float(x), Float(y), &hit) == .success, let h = hit {
      if pidOf(h) != pid { throw Fail("มีหน้าต่างอื่นบังเป้าหมาย กรุณาปิดก่อนทำต่อ") }
      if secret(h) { throw Fail("กรุณากรอกรหัสผ่านด้วยตนเอง") }
    }
    try cancelled(); mouse(.mouseMoved, p)
    if action == "mouse_move" { return ok }
    if action == "drag" {
      let end = CGPoint(x: endX, y: endY)
      if !bounds.contains(end) { throw Fail("ปลายทางอยู่นอกหน้าต่าง") }
      let ms = max(100, min(3000, duration))
      mouse(.leftMouseDown, p)
      defer { mouse(.leftMouseUp, end) }
      for i in 1...30 { try cancelled(); mouse(.leftMouseDragged, CGPoint(x: p.x + (end.x - p.x) * CGFloat(i) / 30, y: p.y + (end.y - p.y) * CGFloat(i) / 30)); usleep(useconds_t(ms * 1000 / 30)) }
    } else if action == "scroll" {
      let dy: Int32 = text == "up" ? 5 : text == "down" ? -5 : 0, dx: Int32 = text == "left" ? 5 : text == "right" ? -5 : 0
      post(CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0))
    } else {
      let (down, up, button): (CGEventType, CGEventType, CGMouseButton) = action == "right_click" ? (.rightMouseDown, .rightMouseUp, .right)
        : action == "middle_click" ? (.otherMouseDown, .otherMouseUp, .center) : (.leftMouseDown, .leftMouseUp, .left)
      let n = action == "triple_click" ? 3 : action == "double_click" ? 2 : 1
      for i in 1...n { if i > 1 { usleep(80_000); try cancelled() }; mouse(down, p, button, clicks: i); mouse(up, p, button, clicks: i) }
    }
  } else if action == "type" {
    if let e = element { AXUIElementSetAttributeValue(e, kAXFocusedAttribute as CFString, kCFBooleanTrue) }
    try cancelled()
    guard let focused = focusedElement(), pidOf(focused) == pid, !secret(focused) else { throw Fail("ช่องกรอกไม่ถูกต้อง") }
    for unit in text.utf16 {
      try cancelled()
      var c = unit
      for down in [true, false] { let e = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: down); e?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &c); post(e) }
    }
  } else if action == "hold_and_press" { // games: hold one key down, press another meanwhile
    let pair = text.uppercased().split(separator: "|").map(String.init)
    guard pair.count == 2 else { throw Fail("ระบุคีย์ที่กดค้างและคีย์ที่กด") }
    let codes = { (s: String) throws -> [CGKeyCode] in try s.split(separator: "+").map { guard let k = KEYS[String($0)] else { throw Fail("คีย์นี้ยังไม่รองรับ") }; return k } }
    let held = try codes(pair[0]), tap = try codes(pair[1])
    let key = { (code: CGKeyCode, down: Bool) in post(CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down)) }
    try cancelled()
    held.forEach { key($0, true) }
    defer { held.reversed().forEach { key($0, false) } }
    usleep(60_000); tap.forEach { key($0, true) }; tap.reversed().forEach { key($0, false) }
    let ms = max(50, min(3000, duration)); var t = 0; while t < ms { try cancelled(); usleep(20_000); t += 20 }
  } else if action == "key" || action == "hold_key" {
    if let f = focusedElement(), secret(f), !["TAB", "SHIFT+TAB", "ESC"].contains(text) { throw Fail("กรุณากรอกรหัสผ่านด้วยตนเอง") }
    let names = text.uppercased().split(separator: "+").map(String.init)
    var codes: [CGKeyCode] = [], flags: CGEventFlags = []
    for n in names { guard let k = KEYS[n] else { throw Fail("คีย์นี้ยังไม่รองรับ") }; codes.append(k); if let f = FLAGS[n] { flags.insert(f) } }
    let press = { (code: CGKeyCode, down: Bool) in let e = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down); e?.flags = flags; post(e) }
    try cancelled()
    codes.forEach { press($0, true) }
    if action == "hold_key" { let ms = max(50, min(3000, duration)); var t = 0; while t < ms { try? cancelled(); usleep(20_000); t += 20 } }
    codes.reversed().forEach { press($0, false) }
  } else { throw Fail("ไม่รู้จักคำสั่งควบคุม") }
  return ok
}

func osa(_ source: String) throws -> String {
  var error: NSDictionary?
  guard let out = NSAppleScript(source: source)?.executeAndReturnError(&error), error == nil else { throw Fail("macOS ปฏิเสธคำสั่ง (\(error?[NSAppleScript.errorMessage] ?? ""))") }
  return out.stringValue ?? ""
}
func shell(_ path: String, _ arguments: [String]) throws {
  let p = Process(); p.executableURL = URL(fileURLWithPath: path); p.arguments = arguments
  try p.run(); p.waitUntilExit()
  if p.terminationStatus != 0 { throw Fail("\(path) ทำงานไม่สำเร็จ") }
}
func audio(_ action: String, _ level: Double) throws -> [String: Any] {
  let set = ["volume_set": "set volume output volume \(Int(level))", "volume_up": "set volume output volume ((output volume of (get volume settings)) + 10)",
    "volume_down": "set volume output volume ((output volume of (get volume settings)) - 10)", "mute": "set volume with output muted", "unmute": "set volume without output muted"][action]
  guard let script = set else { throw Fail("คำสั่งเสียงไม่ถูกต้อง") }
  _ = try osa(script)
  let state = try osa("set s to get volume settings\nreturn ((output volume of s) as text) & \",\" & ((output muted of s) as text)").split(separator: ",")
  return ["level": Int(state.first ?? "0") ?? 0, "muted": state.last == "true"]
}
func nowPlaying() throws -> [String: Any] {
  for player in ["Spotify", "Music"] {
    let out = try osa("if application \"\(player)\" is running then\ntell application \"\(player)\"\nif player state is stopped then return \"\"\nreturn (name of current track) & \"|\" & (artist of current track) & \"|\" & (album of current track) & \"|\" & (player state as text)\nend tell\nend if\nreturn \"\"")
    let f = out.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
    if f.count == 4 { return ["title": f[0], "artist": f[1], "album": f[2], "status": f[3] == "playing" ? "Playing" : "Paused"] }
  }
  return ["title": "", "artist": "", "status": "None"]
}
func picture(_ window: Int) throws -> [String: Any] {
  _ = try check(window)
  let file = NSTemporaryDirectory() + "uncle-shot-\(UUID().uuidString).jpg"
  defer { try? FileManager.default.removeItem(atPath: file) }
  try shell("/usr/sbin/screencapture", ["-x", "-o", "-t", "jpg", "-l\(window)", file]) // Screen Recording: macOS asks once
  try shell("/usr/bin/sips", ["-Z", "1280", file])
  guard let data = FileManager.default.contents(atPath: file), let image = NSBitmapImageRep(data: data) else { throw Fail("ถ่ายภาพหน้าต่างไม่สำเร็จ กรุณาอนุญาต Screen Recording") }
  return ["data": data.base64EncodedString(), "width": image.pixelsWide, "height": image.pixelsHigh]
}
func cursor() -> [String: Any] {
  let at = CGEvent(source: nil)?.location ?? .zero, flags = CGEventSource.flagsState(.combinedSessionState)
  return ["x": Int(at.x), "y": Int(at.y), "leftDown": CGEventSource.buttonState(.combinedSessionState, button: .left),
    "controlDown": flags.contains(.maskCommand), "shiftDown": flags.contains(.maskShift), "altDown": flags.contains(.maskAlternate)]
}

func handle(_ r: [String: Any]) throws -> Any {
  switch r["action"] as? String ?? "" {
  case "cursor": return cursor()
  case "windows": guard AXIsProcessTrusted() else { throw Fail(ACCESS) }; return listWindows()
  case "read": return try read(r["window"] as? Int ?? 0)
  case "audio": return try audio(r["text"] as? String ?? "", (r["level"] as? NSNumber)?.doubleValue ?? 0)
  case "sleep": try cancelled(); try shell("/usr/bin/pmset", ["sleepnow"]); return ok
  case "now_playing": return try nowPlaying()
  case "picture": return try picture(r["window"] as? Int ?? 0)
  case "trusted": return ["trusted": AXIsProcessTrusted()]
  default: guard AXIsProcessTrusted() else { throw Fail(ACCESS) }; return try act(r)
  }
}

// asks for Accessibility once (System Settings opens on its own the first time)
_ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue(): CommandLine.arguments.contains("--no-prompt") ? false : true] as CFDictionary)
setvbuf(stdout, nil, _IOLBF, 0)
while let line = readLine() {
  var id: Any = NSNull(), reply: [String: Any]
  do {
    guard let r = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any] else { continue }
    id = r["id"] ?? NSNull()
    reply = ["id": id, "ok": true, "value": try handle(r)]
  } catch let f as Fail { reply = ["id": id, "ok": false, "error": f.message] } catch { reply = ["id": id, "ok": false, "error": "\(error)"] }
  if let data = try? JSONSerialization.data(withJSONObject: reply), let text = String(data: data, encoding: .utf8) { print(text) }
}
