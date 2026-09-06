import AppKit
import ApplicationServices
import Foundation

// Claude uses its own surface/identity contract. Never reuse Codex selectors.
struct ProviderTarget: Codable, Equatable {
    let provider: String
    let windowId: String
    let sessionId: String
    let environment: String
}
struct ProviderChoice: Codable { let value: String; let label: String }
struct ProviderSessionInfo: Codable {
    let id: String
    let title: String
    let environment: String
}
struct ProviderState: Codable {
    var foreground: String? = nil
    var target: ProviderTarget? = nil
    var reason: String? = nil
    var model: String? = nil
    var effort: String? = nil
    var permission: String? = nil
    var draftEmpty: Bool? = nil
    var sessions: [ProviderSessionInfo]? = nil
    var capabilities: [String] = []
    var options: [ProviderChoice]? = nil
    var observedAt: Double = Date().timeIntervalSince1970 * 1000
}
struct ClaudeRequest: Codable {
    let operation: String
    let target: ProviderTarget
    let value: String?
}

// Promote an environment here only after live acceptance. Development probes
// may opt into one environment without enabling unverified controls in a package.
let verifiedClaudeEnvironments: Set<String> = []
func claudeEnvironmentAccepted(_ environment: String) -> Bool {
    verifiedClaudeEnvironments.contains(environment)
        || ProcessInfo.processInfo.environment["STREAMDECK_CLAUDE_ACCEPTANCE_ENVIRONMENT"] == environment
}

let claudeBundleId = "com.anthropic.claudefordesktop"
func providerForeground() -> String? {
    switch NSWorkspace.shared.frontmostApplication?.bundleIdentifier {
    case "com.openai.codex": return "codex"
    case claudeBundleId: return "claude"
    default: return nil
    }
}

// A URL is identity evidence only for the Code route and a complete session ID.
// No title matching, sidebar recency, or Chat/Cowork fallback.
func claudeCodeSessionId(_ url: String) -> String? {
    guard let parsed = URLComponents(string: url),
          ["https", "http", "claude"].contains(parsed.scheme ?? ""),
          parsed.scheme == "claude" || ["claude.ai", "localhost"].contains(parsed.host ?? "")
    else { return nil }
    let parts = parsed.path.split(separator: "/").map(String.init)
    guard parts.count == 2,
          ["code", "epitaxy", "claude-code-desktop"].contains(parts[0]),
          UUID(uuidString: parts[1]) != nil
    else { return nil }
    return parts[1].lowercased()
}

struct ClaudeMetadata {
    let id: String
    let aliases: Set<String>
    let title: String
    let environment: String
}
func claudeMetadata() -> [ClaudeMetadata] {
    let root = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Claude/claude-code-sessions")
    let fm = FileManager.default
    var rows: [ClaudeMetadata] = []
    // Bounded known directory depth; never traverse transcripts or credentials.
    let accounts = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
    for account in accounts.prefix(100) {
        let projects = (try? fm.contentsOfDirectory(at: account, includingPropertiesForKeys: nil)) ?? []
        for project in projects.prefix(100) {
            let files = (try? fm.contentsOfDirectory(at: project, includingPropertiesForKeys: [.fileSizeKey])) ?? []
            for file in files.filter({ $0.pathExtension == "json" }).prefix(1000) {
                guard let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize,
                      size < 262144,
                      let data = try? Data(contentsOf: file),
                      let record = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                      let id = record["sessionId"] as? String,
                      UUID(uuidString: id) != nil,
                      record["isArchived"] as? Bool != true
                else { continue }
                let aliases = Set([id, record["cliSessionId"] as? String].compactMap { $0?.lowercased() })
                let environment: String
                if record["sshConfig"] is [String: Any] { environment = "ssh" }
                else if record["isRemote"] as? Bool == true || record["cloudSessionId"] is String { environment = "cloud" }
                else if let cwd = record["cwd"] as? String, cwd.hasPrefix("/"), record["cliSessionId"] is String { environment = "local" }
                else { continue }
                rows.append(ClaudeMetadata(id: id.lowercased(), aliases: aliases, title: String((record["title"] as? String ?? "Claude session").prefix(100)), environment: environment))
            }
        }
    }
    return rows
}

func claudeText(_ e: ElementInfo) -> String {
    [e.title, e.description, e.value, e.help].filter { !$0.isEmpty }.joined(separator: " ")
}
func claudeButton(_ snapshot: AXSnapshot, labels: Set<String>) -> ElementInfo? {
    let matches = snapshot.elements.filter {
        !$0.hidden && $0.enabled && ["AXButton", "AXPopUpButton", "AXMenuButton"].contains($0.role)
            && labels.contains(normalized($0.title.isEmpty ? $0.description : $0.title))
    }
    return matches.count == 1 ? matches[0] : nil
}
func claudePickLabel(_ text: String, kind: String) -> String? {
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard value.count <= 100 else { return nil }
    if kind == "model", value.range(of: "^(?:Claude )?(?:Opus|Sonnet|Haiku|Fable) [0-9]+(?:\\.[0-9]+)*(?: \\([^)]*\\))?$", options: .regularExpression) != nil { return value }
    if kind == "reasoning", ["Low", "Medium", "High", "Max", "Extra high"].contains(value) { return value }
    if kind == "permission", ["Manual", "Accept edits", "Plan", "Auto", "Bypass permissions", "Ask permissions", "Auto accept edits", "Plan mode"].contains(value) { return value }
    return nil
}
func claudePicker(_ snapshot: AXSnapshot, kind: String) -> (ElementInfo, String)? {
    let matches = snapshot.elements.compactMap { e -> (ElementInfo, String)? in
        guard !e.hidden, e.enabled, ["AXButton", "AXPopUpButton"].contains(e.role) else { return nil }
        for text in [e.title, e.description] {
            if let label = claudePickLabel(text, kind: kind) { return (e, label) }
        }
        return nil
    }
    return matches.count == 1 ? matches[0] : nil
}
struct ClaudeCapture {
    let app: NSRunningApplication
    let appElement: AXUIElement
    let window: AXUIElement
    let snapshot: AXSnapshot
    let composer: ElementInfo
    let state: ProviderState
}
func captureClaude() throws -> ClaudeCapture {
    guard providerForeground() == "claude",
          let app = NSRunningApplication.runningApplications(withBundleIdentifier: claudeBundleId).first
    else { throw ControlError.failed("BACKGROUND", "NO_FOCUS") }
    guard AXIsProcessTrusted() else { throw ControlError.failed("ACCESS", "UNAVAILABLE") }
    let root = AXUIElementCreateApplication(app.processIdentifier)
    AXUIElementSetMessagingTimeout(root, 0.5)
    _ = initializePickerAccessibility(
        read: { boolAttribute(root, $0 as CFString) },
        enable: { AXUIElementSetAttributeValue(root, $0 as CFString, kCFBooleanTrue) },
        settle: { usleep(2_200_000) }
    )
    let windows = attribute(root, kAXWindowsAttribute as CFString) as? [AXUIElement] ?? []
    let focused = windows.filter { boolAttribute($0, kAXFocusedAttribute as CFString) }
    guard focused.count == 1 else { throw ControlError.failed("NO CHAT", "NO_FOCUS") }
    let window = focused[0]
    let snapshot = captureAXSnapshot(window, maximumDepth: 40)
    let composers = snapshot.elements.filter { !$0.hidden && $0.enabled && $0.role == "AXTextArea" }
    guard composers.count == 1 else { throw ControlError.failed(composers.isEmpty ? "NO DATA" : "WRONG CHAT", "TARGET_MISMATCH") }
    // Only a content-root URL counts. Sidebar link URLs must not identify the target.
    let ids = Set(snapshot.elements.filter { ["AXWebArea", "AXWindow"].contains($0.role) }.compactMap { e -> String? in
        let value = attribute(e.element, kAXURLAttribute as CFString)
        let url = (value as? URL)?.absoluteString ?? (value as? String) ?? ""
        return claudeCodeSessionId(url)
    })
    guard ids.count == 1, let sessionId = ids.first else { throw ControlError.failed("UNSUPPORTED", "TARGET_MISMATCH") }
    let metadata = claudeMetadata().filter { $0.aliases.contains(sessionId) }
    guard metadata.count == 1 else { throw ControlError.failed("UNSUPPORTED", "TARGET_MISMATCH") }
    let row = metadata[0]
    let frame = snapshot.elements.first?.elementFrame
    let matches = (CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? []).filter { info in
        guard (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == app.processIdentifier,
              let bounds = info[kCGWindowBounds as String] as? [String: Any],
              let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary), let frame else { return false }
        return abs(rect.minX - frame.minX) < 2 && abs(rect.minY - frame.minY) < 2
            && abs(rect.width - frame.width) < 2 && abs(rect.height - frame.height) < 2
    }
    let windowNumber = matches.count == 1 ? (matches[0][kCGWindowNumber as String] as? NSNumber)?.stringValue : nil
    guard let windowNumber else { throw ControlError.failed("UNSUPPORTED", "TARGET_MISMATCH") }
    var state = ProviderState(foreground: "claude")
    state.target = ProviderTarget(provider: "claude", windowId: "\(app.processIdentifier):\(windowNumber)", sessionId: row.id, environment: row.environment)
    state.model = claudePicker(snapshot, kind: "model")?.1
    state.effort = claudePicker(snapshot, kind: "reasoning")?.1
    state.permission = claudePicker(snapshot, kind: "permission")?.1
    state.draftEmpty = composers[0].value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    state.sessions = [ProviderSessionInfo(id: row.id, title: row.title, environment: row.environment)]
    // Environment acceptance is explicit: unverified combinations remain unsupported.
    // The source includes guarded picker operations for the hardware acceptance build.
    if state.model != nil { state.capabilities += ["model", "model-options"] }
    if state.effort != nil { state.capabilities += ["reasoning", "reasoning-options"] }
    if state.permission != nil { state.capabilities += ["permission-cycle", "plan"] }
    if claudeButton(snapshot, labels: ["send", "send message"]) != nil { state.capabilities.append("send") }
    if claudeButton(snapshot, labels: ["stop", "stop response"]) != nil { state.capabilities.append("stop") }
    if !claudeEnvironmentAccepted(row.environment) {
        state.capabilities = []
        state.reason = "UNVERIFIED"
    }
    return ClaudeCapture(app: app, appElement: root, window: window, snapshot: snapshot, composer: composers[0], state: state)
}

func observeProviderState() -> ProviderState {
    guard providerForeground() == "claude" else { return ProviderState(foreground: providerForeground()) }
    do { return try captureClaude().state }
    catch { return ProviderState(foreground: "claude", reason: error.localizedDescription) }
}
func verifyClaude(_ captured: ClaudeCapture, target: ProviderTarget) throws -> ClaudeCapture {
    let current = try captureClaude()
    guard current.state.target == target,
          sameElement(captured.window, current.window),
          sameElement(captured.composer.element, current.composer.element)
    else { throw ControlError.failed("Target changed; select again", "TARGET_MISMATCH") }
    return current
}

func claudeMenuOptions(_ snapshot: AXSnapshot, kind: String) -> [(ElementInfo, String)] {
    snapshot.elements.compactMap { e in
        guard !e.hidden, e.enabled, ["AXMenuItem", "AXRadioButton"].contains(e.role) else { return nil }
        for value in [e.title, e.description] {
            if let label = claudePickLabel(value, kind: kind) { return (e, label) }
        }
        return nil
    }
}

func executeClaude(_ request: ClaudeRequest) throws -> ProviderState {
    let captured = try captureClaude()
    guard request.target.provider == "claude", captured.state.target == request.target else {
        throw ControlError.failed("Target changed; select again", "TARGET_MISMATCH")
    }
    // No undocumented equivalent is substituted for unavailable PTT, Fast,
    // workflow launch, approval requests, or remote controls.
    guard captured.state.capabilities.contains(request.operation) else {
        throw ControlError.failed("UNSUPPORTED", "UNAVAILABLE")
    }
    if ["model", "model-options", "reasoning", "reasoning-options", "permission-cycle", "plan"].contains(request.operation) {
        let kind = request.operation.hasPrefix("model") ? "model" : request.operation.hasPrefix("reasoning") ? "reasoning" : "permission"
        guard let picker = claudePicker(captured.snapshot, kind: kind) else { throw ControlError.failed("UNSUPPORTED", "UNAVAILABLE") }
        _ = try verifyClaude(captured, target: request.target)
        guard !captured.snapshot.elements.contains(where: { !$0.hidden && $0.role == "AXMenu" }) else {
            throw ControlError.failed("BUSY", "UNAVAILABLE")
        }
        func dismiss() {
            guard providerForeground() == "claude",
                  let current = try? verifyClaude(captured, target: request.target),
                  current.snapshot.elements.contains(where: { !$0.hidden && $0.role == "AXMenu" }) else { return }
            let source = CGEventSource(stateID: .hidSystemState)
            CGEvent(keyboardEventSource: source, virtualKey: 53, keyDown: true)?.postToPid(captured.app.processIdentifier)
            CGEvent(keyboardEventSource: source, virtualKey: 53, keyDown: false)?.postToPid(captured.app.processIdentifier)
        }
        defer { dismiss() }
        try pressAccessibilityControl(picker.0.element)
        guard let choices = waitUntil(timeout: 1.8, operation: {
            let choices = claudeMenuOptions(captureAXSnapshot(captured.window), kind: kind)
            return choices.isEmpty ? nil : choices
        }) else { throw ControlError.failed("Menu unavailable", "UNAVAILABLE") }
        let labels = choices.map { $0.1 }
        guard Set(labels).count == labels.count else { throw ControlError.failed("Ambiguous menu", "TARGET_MISMATCH") }
        // Dismiss only a menu opened by this operation, in the captured process.
        if request.operation.hasSuffix("-options") {
            dismiss()
            usleep(100_000)
            let after = try verifyClaude(captured, target: request.target)
            guard after.composer.value == captured.composer.value else { throw ControlError.failed("Draft changed", "DRAFT_PRESENT") }
            var state = after.state
            state.options = labels.map { ProviderChoice(value: $0, label: $0) }
            return state
        }
        let value: String
        if request.operation == "permission-cycle" {
            guard let current = labels.firstIndex(of: picker.1), labels.count > 1 else { dismiss(); throw ControlError.failed("UNSUPPORTED", "UNAVAILABLE") }
            value = labels[(current + 1) % labels.count]
        } else if request.operation == "plan" {
            // Restore only a prior mode witnessed in this helper's persisted request.
            // No guessed escalation when the plugin has never observed the prior mode.
            if ["Plan", "Plan mode"].contains(picker.1) {
                guard let previous = request.value, labels.contains(previous), !["Plan", "Plan mode"].contains(previous) else { dismiss(); throw ControlError.failed("Select prior mode", "UNAVAILABLE") }
                value = previous
            } else {
                guard let plan = labels.first(where: { ["Plan", "Plan mode"].contains($0) }) else { dismiss(); throw ControlError.failed("UNSUPPORTED", "UNAVAILABLE") }
                value = plan
            }
        } else {
            guard let requested = request.value, labels.contains(requested) else { dismiss(); throw ControlError.failed("Option unavailable", "UNAVAILABLE") }
            value = requested
        }
        do {
            _ = try verifyClaude(captured, target: request.target)
            guard let item = choices.first(where: { $0.1 == value }) else { throw ControlError.failed("Option unavailable", "UNAVAILABLE") }
            try pressAccessibilityControl(item.0.element)
            guard let result = waitUntil(timeout: 2, operation: { () -> ProviderState? in
                guard let current = try? verifyClaude(captured, target: request.target),
                      current.composer.value == captured.composer.value,
                      claudePicker(current.snapshot, kind: kind)?.1 == value else { return nil }
                return current.state
            }) else { throw ControlError.failed("Selection unverified", "UNCHANGED") }
            return result
        } catch { dismiss(); throw error }
    }
    if request.operation == "send" || request.operation == "stop" {
        let current = try verifyClaude(captured, target: request.target)
        let labels: Set<String> = request.operation == "send" ? ["send", "send message"] : ["stop", "stop response"]
        guard let button = claudeButton(current.snapshot, labels: labels) else { throw ControlError.failed("UNAVAILABLE", "UNAVAILABLE") }
        if request.operation == "send" && current.state.draftEmpty != false { throw ControlError.failed("Empty composer", "DRAFT_PRESENT") }
        try pressAccessibilityControl(button.element)
        guard let result = waitUntil(timeout: 2, operation: { () -> ProviderState? in
            guard let after = try? verifyClaude(captured, target: request.target) else { return nil }
            if request.operation == "send" { return after.state.draftEmpty == true ? after.state : nil }
            return claudeButton(after.snapshot, labels: labels) == nil ? after.state : nil
        }) else { throw ControlError.failed("Action unverified", "UNCHANGED") }
        return result
    }
    throw ControlError.failed("UNSUPPORTED", "UNAVAILABLE")
}

func runProviderAction(_ action: String, requested: String?) {
    if action == "fixture-claude-policy", let requested,
       let data = Data(base64Encoded: requested),
       let fixture = (try? JSONSerialization.jsonObject(with: data)) as? [String: String] {
        let session = claudeCodeSessionId(fixture["url"] ?? "")
        let label = claudePickLabel(fixture["text"] ?? "", kind: fixture["kind"] ?? "")
        emit(ControlResult(ok: true, action: action, requested: nil, model: label, effort: nil, conversationId: session, message: "Claude selector policy fixture"), exitCode: 0)
    }
    guard ["provider-read", "claude"].contains(action) else { return }
    do {
        let state: ProviderState
        if action == "provider-read" { state = observeProviderState() }
        else {
            guard let requested, let request = decodeNativePayload(requested, as: ClaudeRequest.self) else {
                throw ControlError.failed("Malformed Claude request", "UNAVAILABLE")
            }
            state = try executeClaude(request)
        }
        var result = ControlResult(ok: true, action: action, requested: nil, model: state.model, effort: state.effort, message: "Observed desktop provider")
        result.providerState = state
        emit(result, exitCode: 0)
    } catch {
        emit(ControlResult(ok: false, action: action, requested: nil, model: nil, effort: nil, reasonCode: (error as? ControlError)?.reasonCode ?? "UNKNOWN", message: error.localizedDescription), exitCode: 1)
    }
}
