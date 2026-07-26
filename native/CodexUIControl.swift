import AppKit
import ApplicationServices
import Foundation

struct ControlResult: Codable {
    let ok: Bool
    let action: String
    let requested: String?
    let model: String?
    let effort: String?
    var mode: String? = nil
    var active: Bool? = nil
    var pendingInput: Bool? = nil
    var inputKind: String? = nil
    var inputTitle: String? = nil
    let message: String
}

struct ElementInfo {
    let element: AXUIElement
    let role: String
    let title: String
    let description: String
}

enum ControlError: LocalizedError {
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .failed(let message): return message
        }
    }
}

let modelLabels = [
    "gpt-5.6-luna": "Luna",
    "gpt-5.6-terra": "Terra",
    "gpt-5.6-sol": "Sol",
]

let effortLabels = [
    "low": "Light",
    "medium": "Medium",
    "high": "High",
    "xhigh": "Extra High",
    "max": "Max",
    "ultra": "Ultra",
]

func attribute(_ element: AXUIElement, _ name: CFString) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name, &value) == .success else {
        return nil
    }
    return value
}

func stringAttribute(_ element: AXUIElement, _ name: CFString) -> String {
    attribute(element, name) as? String ?? ""
}

func boolAttribute(_ element: AXUIElement, _ name: CFString) -> Bool {
    if let number = attribute(element, name) as? NSNumber {
        return number.boolValue
    }
    return false
}

func childElements(_ element: AXUIElement) -> [AXUIElement] {
    attribute(element, kAXChildrenAttribute as CFString) as? [AXUIElement] ?? []
}

func allElements(_ root: AXUIElement, maximumDepth: Int = 40) -> [ElementInfo] {
    var result: [ElementInfo] = []
    var queue: [(AXUIElement, Int)] = [(root, 0)]
    var index = 0

    while index < queue.count {
        let (element, depth) = queue[index]
        index += 1
        result.append(
            ElementInfo(
                element: element,
                role: stringAttribute(element, kAXRoleAttribute as CFString),
                title: stringAttribute(element, kAXTitleAttribute as CFString),
                description: stringAttribute(element, kAXDescriptionAttribute as CFString)
            )
        )
        if depth < maximumDepth {
            queue.append(contentsOf: childElements(element).map { ($0, depth + 1) })
        }
    }
    return result
}

func frame(_ element: AXUIElement) -> CGRect? {
    guard
        let positionValue = attribute(element, kAXPositionAttribute as CFString),
        let sizeValue = attribute(element, kAXSizeAttribute as CFString),
        CFGetTypeID(positionValue) == AXValueGetTypeID(),
        CFGetTypeID(sizeValue) == AXValueGetTypeID()
    else {
        return nil
    }

    var point = CGPoint.zero
    var size = CGSize.zero
    guard
        AXValueGetValue(positionValue as! AXValue, .cgPoint, &point),
        AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)
    else {
        return nil
    }
    return CGRect(origin: point, size: size)
}

func click(_ element: AXUIElement) throws {
    guard let elementFrame = frame(element), !elementFrame.isEmpty else {
        throw ControlError.failed("The Codex control has no clickable frame.")
    }
    let point = CGPoint(x: elementFrame.midX, y: elementFrame.midY)
    guard
        let down = CGEvent(
            mouseEventSource: nil,
            mouseType: .leftMouseDown,
            mouseCursorPosition: point,
            mouseButton: .left
        ),
        let up = CGEvent(
            mouseEventSource: nil,
            mouseType: .leftMouseUp,
            mouseCursorPosition: point,
            mouseButton: .left
        )
    else {
        throw ControlError.failed("Could not create a paired mouse click.")
    }

    var postedDown = false
    defer {
        if postedDown {
            up.post(tap: .cghidEventTap)
        }
    }
    down.post(tap: .cghidEventTap)
    postedDown = true
    usleep(35_000)
}

func pressEscape() {
    guard
        let down = CGEvent(keyboardEventSource: nil, virtualKey: 53, keyDown: true),
        let up = CGEvent(keyboardEventSource: nil, virtualKey: 53, keyDown: false)
    else {
        return
    }
    var postedDown = false
    defer {
        if postedDown {
            up.post(tap: .cghidEventTap)
        }
    }
    down.post(tap: .cghidEventTap)
    postedDown = true
}

func dismissOpenMenus() {
    pressEscape()
    usleep(45_000)
    pressEscape()
    usleep(45_000)
}

func waitUntil<T>(
    timeout: TimeInterval,
    interval: useconds_t = 80_000,
    operation: () -> T?
) -> T? {
    let deadline = Date().addingTimeInterval(timeout)
    repeat {
        if let value = operation() {
            return value
        }
        usleep(interval)
    } while Date() < deadline
    return nil
}

func normalized(_ value: String) -> String {
    value
        .lowercased()
        .replacingOccurrences(of: "-", with: "")
        .replacingOccurrences(of: " ", with: "")
}

func elementText(_ info: ElementInfo) -> String {
    [
        info.title,
        info.description,
        stringAttribute(info.element, kAXValueAttribute as CFString),
        stringAttribute(info.element, kAXHelpAttribute as CFString),
    ]
    .filter { !$0.isEmpty }
    .joined(separator: " ")
}

func isApprovalChoice(_ value: String) -> Bool {
    let text = normalized(value)
    return text.contains("allow")
        || text.contains("approve")
        || text.contains("accept")
        || text.contains("authorize")
        || text.contains("grant")
}

func isRejectionChoice(_ value: String) -> Bool {
    let text = normalized(value)
    return text.contains("deny")
        || text.contains("reject")
        || text.contains("decline")
        || text == "cancel"
        || text.contains("notnow")
}

func containsApprovalPrompt(_ value: String) -> Bool {
    let text = normalized(value)
    return text.contains("permission")
        || text.contains("approval")
        || text.contains("requestaccess")
        || text.contains("wantsaccess")
        || text.contains("authorize")
}

// Codex's native approval sheet does not consistently expose its Allow/Deny
// controls through Accessibility.  The active task row does, however, expose
// this exact state label while the sheet is pending.  Treat it as the primary
// read-only signal, and keep the button/prompt heuristic below as a fallback
// for other sheet variants.
func isAwaitingApprovalState(_ value: String) -> Bool {
    let text = normalized(value)
    return text.contains("awaitingapproval")
        || text.contains("awaitingpermission")
}

func hasPendingApproval(in focusedWindow: AXUIElement) -> Bool {
    let elements = allElements(focusedWindow, maximumDepth: 24).filter { info in
        guard
            let elementFrame = frame(info.element),
            !elementFrame.isEmpty,
            boolAttribute(info.element, kAXHiddenAttribute as CFString) == false
        else {
            return false
        }
        return frame(focusedWindow)?.intersects(elementFrame) ?? true
    }

    if elements.contains(where: { isAwaitingApprovalState(elementText($0)) }) {
        return true
    }

    let buttons = elements.filter {
        $0.role == (kAXButtonRole as String)
            && boolAttribute($0.element, kAXEnabledAttribute as CFString)
    }
    let approvalButtons = buttons.filter { isApprovalChoice(elementText($0)) }
    let rejectionButtons = buttons.filter { isRejectionChoice(elementText($0)) }
    guard !approvalButtons.isEmpty, !rejectionButtons.isEmpty else {
        return false
    }

    let prompts = elements.filter {
        containsApprovalPrompt(elementText($0))
    }
    return prompts.contains { prompt in
        guard let promptFrame = frame(prompt.element) else { return false }
        let nearby = promptFrame.insetBy(dx: -480, dy: -320)
        return approvalButtons.contains { approval in
            guard
                let approvalFrame = frame(approval.element),
                nearby.intersects(approvalFrame)
            else {
                return false
            }
            return rejectionButtons.contains { rejection in
                guard
                    let rejectionFrame = frame(rejection.element),
                    nearby.intersects(rejectionFrame)
                else {
                    return false
                }
                return abs(approvalFrame.midY - rejectionFrame.midY) <= 180
                    && abs(approvalFrame.midX - rejectionFrame.midX) <= 720
            }
        }
    }
}

func pendingApprovalTitle(in focusedWindow: AXUIElement) -> String? {
    let elements = allElements(focusedWindow, maximumDepth: 24)
    let stateFrames = elements.compactMap { info -> CGRect? in
        guard
            isAwaitingApprovalState(elementText(info)),
            boolAttribute(info.element, kAXHiddenAttribute as CFString) == false
        else { return nil }
        return frame(info.element)
    }
    guard !stateFrames.isEmpty else {
        return nil
    }

    // The selected chat's title shares the sidebar row with `Awaiting
    // approval`: it is horizontally to its left and aligned on the same row.
    // Restricting the match to that row prevents a background task or sheet
    // headline from being attributed to the pending session.
    let candidates = elements.compactMap { info -> (String, CGRect)? in
        let text = elementText(info).trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            !text.isEmpty,
            !isAwaitingApprovalState(text),
            let candidateFrame = frame(info.element),
            info.role == (kAXStaticTextRole as String)
        else {
            return nil
        }
        guard stateFrames.contains(where: { stateFrame in
            candidateFrame.minX < stateFrame.minX
                && abs(candidateFrame.midY - stateFrame.midY) <= 18
                && candidateFrame.width >= 80
        }) else { return nil }
        return (text, candidateFrame)
    }
    return candidates
        .sorted { left, right in
            if left.0.count != right.0.count { return left.0.count > right.0.count }
            return left.1.minX < right.1.minX
        }
        .first?
        .0
}

func runningCodex() throws -> NSRunningApplication {
    guard
        let app = NSRunningApplication.runningApplications(
            withBundleIdentifier: "com.openai.codex"
        ).first
    else {
        throw ControlError.failed("Codex is not running.")
    }
    return app
}

func focusCodex(_ app: NSRunningApplication, threadId: String?) throws {
    if let threadId {
        guard
            let url = URL(string: "codex://threads/\(threadId)"),
            NSWorkspace.shared.open(url)
        else {
            throw ControlError.failed("Could not open the target Codex task.")
        }
        usleep(550_000)
    }
    guard app.activate() else {
        throw ControlError.failed("Could not bring Codex to the foreground.")
    }
    usleep(180_000)
}

func pickerCandidate(in appElement: AXUIElement) -> ElementInfo? {
    allElements(appElement).first { info in
        guard info.role == (kAXPopUpButtonRole as String) else { return false }
        let text = normalized("\(info.title) \(info.description)")
        return text.contains("luna") || text.contains("terra") || text.contains("sol")
    }
}

func requirePicker(in appElement: AXUIElement) throws -> ElementInfo {
    guard let picker = pickerCandidate(in: appElement) else {
        throw ControlError.failed(
            "The live Codex model picker is unavailable. Open a Codex chat."
        )
    }
    guard boolAttribute(picker.element, kAXEnabledAttribute as CFString) else {
        throw ControlError.failed(
            "Codex is busy. Wait for the current response to finish."
        )
    }
    return picker
}

func menuItem(
    in appElement: AXUIElement,
    descriptionPrefix: String
) -> ElementInfo? {
    allElements(appElement).first { info in
        info.role == (kAXMenuItemRole as String)
            && info.description.lowercased().hasPrefix(descriptionPrefix.lowercased())
    }
}

func selectableMenuItem(
    in appElement: AXUIElement,
    label: String,
    excludingDescriptionPrefix: String
) -> ElementInfo? {
    let target = normalized(label)
    return allElements(appElement).first { info in
        guard info.role == (kAXMenuItemRole as String) else { return false }
        let description = info.description
        guard
            !description.lowercased().hasPrefix(
                excludingDescriptionPrefix.lowercased()
            )
        else {
            return false
        }
        let text = normalized("\(info.title) \(description)")
        return text == target
            || text.hasSuffix(target)
            || text.contains("model\(target)")
            || text.contains("effort\(target)")
    }
}

func readPickerState(_ appElement: AXUIElement) throws -> (String?, String?) {
    dismissOpenMenus()
    let picker = try requirePicker(in: appElement)
    try click(picker.element)
    defer { pressEscape() }

    guard
        let modelItem = waitUntil(timeout: 1.5, operation: {
            menuItem(in: appElement, descriptionPrefix: "Model ")
        }),
        let effortItem = menuItem(in: appElement, descriptionPrefix: "Effort ")
    else {
        throw ControlError.failed("Codex opened no readable Model/Effort menu.")
    }

    let model = String(modelItem.description.dropFirst("Model ".count))
    let effort = String(effortItem.description.dropFirst("Effort ".count))
    return (model, effort)
}

func composerCandidate(in appElement: AXUIElement) -> ElementInfo? {
    allElements(appElement).first { info in
        guard
            info.role == (kAXTextAreaRole as String),
            boolAttribute(info.element, kAXEnabledAttribute as CFString),
            let elementFrame = frame(info.element)
        else {
            return false
        }
        return elementFrame.width >= 240
            && elementFrame.height >= 36
            && !elementFrame.isEmpty
    }
}

func composerModeControl(
    _ mode: String,
    appElement: AXUIElement,
    composer: ElementInfo
) -> ElementInfo? {
    guard let composerFrame = frame(composer.element) else { return nil }
    let region = CGRect(
        x: composerFrame.minX - 12,
        y: composerFrame.minY - 12,
        width: composerFrame.width + 24,
        height: composerFrame.height + 84
    )
    return allElements(appElement).first { info in
        guard
            info.role == (kAXButtonRole as String)
                || info.role == (kAXRadioButtonRole as String),
            let elementFrame = frame(info.element),
            !elementFrame.isEmpty,
            region.intersects(elementFrame)
        else {
            return false
        }
        let text = normalized("\(info.title) \(info.description)")
        return text == mode || text == "\(mode)mode"
    }
}

func readMode(
    _ mode: String,
    appElement: AXUIElement,
    composer: ElementInfo? = nil
) throws -> Bool {
    guard mode == "plan" || mode == "fast" else {
        throw ControlError.failed("Unsupported Codex mode.")
    }
    guard let composer = composer ?? composerCandidate(in: appElement) else {
        throw ControlError.failed(
            "The live Codex composer is unavailable. Open an idle Codex chat."
        )
    }
    let control = composerModeControl(
        mode,
        appElement: appElement,
        composer: composer
    )
    if mode == "fast" {
        guard let control else {
            throw ControlError.failed(
                "Fast mode is unsupported because the visible composer exposes no verifiable Fast control."
            )
        }
        let value = normalized(
            stringAttribute(control.element, kAXValueAttribute as CFString)
        )
        return boolAttribute(control.element, kAXSelectedAttribute as CFString)
            || value == "1"
            || value == "on"
            || normalized("\(control.title) \(control.description)").contains("faston")
    }
    let text = normalized(
        "\(composer.description) "
            + stringAttribute(composer.element, kAXValueAttribute as CFString)
    )
    return control != nil && text.contains("generateaplan")
}

func composerDraft(_ composer: ElementInfo) -> String {
    let value = stringAttribute(
        composer.element,
        kAXValueAttribute as CFString
    ).trimmingCharacters(in: .whitespacesAndNewlines)
    let placeholder = composer.description.trimmingCharacters(
        in: .whitespacesAndNewlines
    )
    return value == placeholder ? "" : value
}

func typeCommandAndReturn(_ command: String) throws {
    let text = Array(command.utf16)
    guard
        let down = CGEvent(
            keyboardEventSource: nil,
            virtualKey: 0,
            keyDown: true
        ),
        let up = CGEvent(
            keyboardEventSource: nil,
            virtualKey: 0,
            keyDown: false
        ),
        let returnDown = CGEvent(
            keyboardEventSource: nil,
            virtualKey: 36,
            keyDown: true
        ),
        let returnUp = CGEvent(
            keyboardEventSource: nil,
            virtualKey: 36,
            keyDown: false
        )
    else {
        throw ControlError.failed("Could not create the paired mode command.")
    }
    down.keyboardSetUnicodeString(
        stringLength: text.count,
        unicodeString: text
    )
    up.keyboardSetUnicodeString(
        stringLength: text.count,
        unicodeString: text
    )

    var postedDown = false
    var postedReturnDown = false
    defer {
        if postedReturnDown {
            returnUp.post(tap: .cghidEventTap)
        }
        if postedDown {
            up.post(tap: .cghidEventTap)
        }
    }
    down.post(tap: .cghidEventTap)
    postedDown = true
    usleep(80_000)
    up.post(tap: .cghidEventTap)
    postedDown = false
    usleep(100_000)
    returnDown.post(tap: .cghidEventTap)
    postedReturnDown = true
}

func toggleMode(
    _ mode: String,
    appElement: AXUIElement
) throws -> Bool {
    dismissOpenMenus()
    guard let composer = composerCandidate(in: appElement) else {
        throw ControlError.failed(
            "The live Codex composer is unavailable. Open an idle Codex chat."
        )
    }
    guard composerDraft(composer).isEmpty else {
        throw ControlError.failed(
            "\(mode.capitalized) was not changed because the visible composer contains a draft."
        )
    }
    let current = try readMode(
        mode,
        appElement: appElement,
        composer: composer
    )
    let requestedState = !current

    if mode == "plan" {
        try click(composer.element)
        usleep(80_000)
        try typeCommandAndReturn("/plan")
    } else {
        guard
            let control = composerModeControl(
                mode,
                appElement: appElement,
                composer: composer
            )
        else {
            throw ControlError.failed(
                "Fast mode is unsupported because the visible composer exposes no verifiable Fast control."
            )
        }
        try click(control.element)
    }

    guard
        waitUntil(timeout: 1.8, operation: {
            (try? readMode(mode, appElement: appElement)) == requestedState
                ? requestedState
                : nil
        }) != nil
    else {
        throw ControlError.failed(
            "The visible Codex composer did not confirm \(mode.capitalized) \(requestedState ? "active" : "off")."
        )
    }
    return requestedState
}

func applySelection(
    appElement: AXUIElement,
    categoryPrefix: String,
    targetLabel: String
) throws {
    dismissOpenMenus()
    let picker = try requirePicker(in: appElement)
    try click(picker.element)

    guard
        let categoryItem = waitUntil(timeout: 1.5, operation: {
            menuItem(in: appElement, descriptionPrefix: categoryPrefix)
        })
    else {
        pressEscape()
        throw ControlError.failed("Codex did not expose the \(categoryPrefix) control.")
    }
    try click(categoryItem.element)

    guard
        let target = waitUntil(timeout: 1.5, operation: {
            selectableMenuItem(
                in: appElement,
                label: targetLabel,
                excludingDescriptionPrefix: categoryPrefix
            )
        })
    else {
        let available = allElements(appElement)
            .filter { $0.role == (kAXMenuItemRole as String) }
            .map { $0.description.isEmpty ? $0.title : $0.description }
            .filter { !$0.isEmpty }
            .joined(separator: " | ")
        pressEscape()
        throw ControlError.failed(
            "Codex does not offer \(targetLabel) in the live \(categoryPrefix) menu. Available: \(available)"
        )
    }
    try click(target.element)
    usleep(250_000)
}

func emit(_ result: ControlResult, exitCode: Int32) -> Never {
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(result) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0A]))
    }
    exit(exitCode)
}

let arguments = Array(CommandLine.arguments.dropFirst())
let action = arguments.first ?? "read"
let requested = arguments.count > 1 ? arguments[1] : nil
let threadId = arguments.count > 2 ? arguments[2] : nil

do {
    guard AXIsProcessTrusted() else {
        throw ControlError.failed(
            "Accessibility permission is required for the Stream Deck app."
        )
    }
    let app = try runningCodex()
    let appElement = AXUIElementCreateApplication(app.processIdentifier)

    if action == "input-read" || action == "input-dump" {
        guard
            let focusedWindowValue = attribute(
                appElement,
                kAXFocusedWindowAttribute as CFString
            )
        else {
            throw ControlError.failed(
                "The focused Codex window is unavailable."
            )
        }
        let focusedWindow = focusedWindowValue as! AXUIElement
        if action == "input-dump" {
            let dumpElements = allElements(
                focusedWindow,
                maximumDepth: 24
            )
            let approvalLabels = dumpElements.filter {
                normalized(elementText($0)) == "awaitingapproval"
            }
            let approvalFrames = approvalLabels.compactMap {
                frame($0.element)
            }
            let summary = dumpElements
            .compactMap { info -> String? in
                let text = elementText(info)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { return nil }
                let elementFrame = frame(info.element)
                let isNearApproval = elementFrame.map { candidate in
                    approvalFrames.contains {
                        candidate.insetBy(dx: -24, dy: -24).intersects($0)
                    }
                } ?? false
                guard
                    normalized(text) == "awaitingapproval"
                        || isNearApproval
                else {
                    return nil
                }
                let frameText = elementFrame.map {
                    "\(Int($0.minX)),\(Int($0.minY)),\(Int($0.width)),\(Int($0.height))"
                } ?? "no-frame"
                let selected = boolAttribute(
                    info.element,
                    kAXSelectedAttribute as CFString
                )
                let focused = boolAttribute(
                    info.element,
                    kAXFocusedAttribute as CFString
                )
                return "\(info.role)|\(frameText)|selected=\(selected)|focused=\(focused)|\(text)"
            }
            .joined(separator: "\n")
            emit(
                ControlResult(
                    ok: true,
                    action: action,
                    requested: nil,
                    model: nil,
                    effort: nil,
                    message: summary
                ),
                exitCode: 0
            )
        }
        let pending = hasPendingApproval(in: focusedWindow)
        let pendingTitle = pending ? pendingApprovalTitle(in: focusedWindow) : nil
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: nil,
                model: nil,
                effort: nil,
                pendingInput: pending,
                inputKind: pending ? "approval" : nil,
                inputTitle: pendingTitle,
                message: pending
                    ? "The focused Codex window has a pending approval."
                    : "The focused Codex window has no pending approval."
            ),
            exitCode: 0
        )
    }

    try focusCodex(app, threadId: threadId)

    switch action {
    case "mode-read":
        dismissOpenMenus()
        guard let requested else {
            throw ControlError.failed("A Plan or Fast mode is required.")
        }
        let active = try readMode(requested, appElement: appElement)
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: requested,
                model: nil,
                effort: nil,
                mode: requested,
                active: active,
                message: "The visible Codex composer confirmed \(requested.capitalized) \(active ? "active" : "off")."
            ),
            exitCode: 0
        )
    case "mode-toggle":
        guard let requested else {
            throw ControlError.failed("A Plan or Fast mode is required.")
        }
        let active = try toggleMode(requested, appElement: appElement)
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: requested,
                model: nil,
                effort: nil,
                mode: requested,
                active: active,
                message: "The visible Codex composer confirmed \(requested.capitalized) \(active ? "active" : "off")."
            ),
            exitCode: 0
        )
    case "read":
        let state = try readPickerState(appElement)
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: nil,
                model: state.0,
                effort: state.1,
                message: "Read the live Codex Model/Effort picker."
            ),
            exitCode: 0
        )
    case "model":
        guard let requested, let label = modelLabels[requested] else {
            throw ControlError.failed("Unsupported model selection.")
        }
        try applySelection(
            appElement: appElement,
            categoryPrefix: "Model ",
            targetLabel: label
        )
        let state = try readPickerState(appElement)
        guard normalized(state.0 ?? "").contains(normalized(label)) else {
            throw ControlError.failed(
                "Codex still shows \(state.0 ?? "no model") after selecting \(label)."
            )
        }
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: requested,
                model: state.0,
                effort: state.1,
                message: "The live Codex picker now shows \(state.0 ?? label)."
            ),
            exitCode: 0
        )
    case "reasoning":
        guard let requested, let label = effortLabels[requested] else {
            throw ControlError.failed("Unsupported reasoning selection.")
        }
        try applySelection(
            appElement: appElement,
            categoryPrefix: "Effort ",
            targetLabel: label
        )
        let state = try readPickerState(appElement)
        guard normalized(state.1 ?? "") == normalized(label) else {
            throw ControlError.failed(
                "Codex still shows \(state.1 ?? "no effort") after selecting \(label)."
            )
        }
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: requested,
                model: state.0,
                effort: state.1,
                message: "The live Codex picker now shows \(state.1 ?? label) effort."
            ),
            exitCode: 0
        )
    default:
        throw ControlError.failed(
            "Usage: codex-ui-control input-read | read | model SLUG | reasoning LEVEL | mode-read MODE | mode-toggle MODE"
        )
    }
} catch {
    emit(
        ControlResult(
            ok: false,
            action: action,
            requested: requested,
            model: nil,
            effort: nil,
            message: error.localizedDescription
        ),
        exitCode: 1
    )
}
