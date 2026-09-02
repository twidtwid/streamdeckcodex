import AppKit
import ApplicationServices
import Darwin
import Foundation

func pickerCandidate(in elements: [ElementInfo]) -> ElementInfo? {
    let matches = elements.filter { info in
        guard info.role == (kAXPopUpButtonRole as String) else { return false }
        let text = normalized("\(info.title) \(info.description)")
        return text.contains("luna") || text.contains("terra") || text.contains("sol")
    }
    return matches.count == 1 ? matches[0] : nil
}

func requirePicker(in elements: [ElementInfo]) throws -> ElementInfo {
    guard let picker = pickerCandidate(in: elements) else {
        throw ControlError.failed(
            "The live Codex model picker is unavailable. Open a Codex chat."
        )
    }
    guard picker.enabled else {
        throw ControlError.failed(
            "Codex is busy. Wait for the current response to finish."
        )
    }
    return picker
}

func pickerMenuTextMatches(_ rawText: String, label: String) -> Bool {
    let text = normalized(rawText)
    let target = normalized(label)
    return !target.isEmpty
        && (text == target
            || text.hasPrefix(target)
            || text.hasSuffix(target)
            || text.contains("model\(target)")
            || text.contains("effort\(target)"))
}

func effortMenuTextMatches(_ rawText: String, label: String) -> Bool {
    let text = normalized(rawText)
    let target = normalized(label)
    // Effort names overlap ("High" is a suffix of "Extra High"). Effort
    // options may append explanatory copy, but never carry a version prefix.
    return !target.isEmpty && (text == target || text.hasPrefix(target))
}

func menuItem(
    in elements: [ElementInfo],
    descriptionPrefix: String
) -> ElementInfo? {
    let matches = elements.filter { info in
        info.role == (kAXMenuItemRole as String)
            && info.description.lowercased().hasPrefix(descriptionPrefix.lowercased())
    }
    return matches.count == 1 ? matches[0] : nil
}

/// Effort ranks order the five-segment Power control. The ladder depends on
/// the chat and the model: a Default-model chat puts a lighter model at
/// segment 1, an explicit Sol chat ends at Ultra with no Max rung between.
/// Ranks only give the direction; each step is one segment, re-read.
let powerRanks = ["low": 0, "medium": 1, "high": 2, "xhigh": 3, "max": 4, "ultra": 5]
let powerReadoutLevels: [(name: String, level: String)] = [
    ("extra high", "xhigh"), ("extended", "high"), ("standard", "medium"),
    ("light", "low"), ("maximum", "max"), ("max", "max"), ("ultra", "ultra"),
]
let pickerTitleEfforts: [(suffix: String, level: String)] = [
    ("extra high", "xhigh"), ("extended", "high"), ("standard", "medium"),
    ("light", "low"), ("minimal", "minimal"), ("medium", "medium"),
    ("high", "high"), ("low", "low"), ("ultra", "ultra"), ("max", "max"),
    ("none", "none"),
]

struct PowerReadout: Equatable {
    let model: String
    let level: String
    let position: Int
}

/// Parse "5.6 Sol Standard, 3 of 5." into model, canonical level, and segment.
func parsePowerReadout(_ readout: String) -> PowerReadout? {
    let trimmed = readout.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let comma = trimmed.lastIndex(of: ",") else { return nil }
    let head = String(trimmed[..<comma]).trimmingCharacters(in: .whitespaces)
    let tail = String(trimmed[trimmed.index(after: comma)...])
    guard let digit = tail.first(where: \.isNumber), let position = Int(String(digit)),
          (1...5).contains(position)
    else { return nil }
    let lower = head.lowercased()
    for (name, level) in powerReadoutLevels where lower.hasSuffix(" " + name) {
        let model = String(head.dropLast(name.count)).trimmingCharacters(in: .whitespaces)
        guard !model.isEmpty else { return nil }
        return PowerReadout(model: model, level: level, position: position)
    }
    return nil
}

/// The segment to click next: one step toward the target's rank, or nil when
/// the readout already matches, the rank is unknown, or the ladder ends.
func nextPowerSegment(from current: PowerReadout, to targetLevel: String) -> Int? {
    guard let here = powerRanks[current.level], let there = powerRanks[targetLevel.lowercased()],
          here != there
    else { return nil }
    let next = current.position + (there > here ? 1 : -1)
    return (1...5).contains(next) ? next : nil
}

/// Parse the picker button title ("5.6 Sol Medium", "5.6 Luna Extra High")
/// into the model name and the canonical picker effort label.
func parsePickerTitle(_ title: String) -> (model: String, effort: String)? {
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    let lower = trimmed.lowercased()
    for (suffix, level) in pickerTitleEfforts where lower.hasSuffix(" " + suffix) {
        let model = String(trimmed.dropLast(suffix.count)).trimmingCharacters(in: .whitespaces)
        guard !model.isEmpty, let label = effortLabels[level] else { return nil }
        return (model, label)
    }
    return nil
}

func powerReadout(in snapshot: AXSnapshot) -> String? {
    snapshot.elements.first {
        $0.role == (kAXStaticTextRole as String) && $0.value.contains(" of 5")
    }?.value
}

func powerControlFrame(in snapshot: AXSnapshot) -> CGRect? {
    guard let index = snapshot.elements.firstIndex(where: {
        $0.role == (kAXMenuItemRole as String) && normalized($0.description) == "power"
    }) else { return nil }
    let inner = snapshot.elements.enumerated()
        .filter {
            snapshot.query.isDescendant($0.offset, of: index)
                && $0.element.role == (kAXGroupRole as String)
                && ($0.element.elementFrame?.width ?? 0) > 150
        }
        .compactMap { $0.element.elementFrame }
        .min { $0.width < $1.width }
    return inner ?? snapshot.elements[index].elementFrame
}

func pickerMenuOpen(in snapshot: AXSnapshot) -> Bool {
    snapshot.elements.contains {
        $0.role == (kAXMenuItemRole as String) && normalized($0.description) == "selectmodel"
    }
}

/// Current Codex builds put the live model and effort in the picker button
/// title, so reading state opens nothing.
func readPickerState(_ appElement: AXUIElement) throws -> (String?, String?) {
    let snapshot = captureAXSnapshot(appElement)
    let picker = try requirePicker(in: snapshot.elements)
    guard let parsed = parsePickerTitle(picker.title) else {
        throw ControlError.failed(
            "Codex shows an unreadable Model/Effort picker title.",
            "UNAVAILABLE"
        )
    }
    return (parsed.model, parsed.effort)
}

func openPickerMenu(appElement: AXUIElement, initial: AXSnapshot) throws {
    let picker = try requirePicker(in: initial.elements)
    try click(picker.element)
    guard waitUntil(timeout: 1.5, operation: {
        pickerMenuOpen(in: captureAXSnapshot(appElement)) ? true : nil
    }) != nil else {
        pressEscape()
        throw ControlError.failed("Codex opened no Model/Effort menu.", "UNAVAILABLE")
    }
}

func composerCandidates(in appElement: AXUIElement) -> [ElementInfo] {
    composerCandidates(in: captureAXSnapshot(appElement))
}

func composerCandidates(in snapshot: AXSnapshot) -> [ElementInfo] {
    guard let index = uniqueComposerIndex(in: snapshot.query) else { return [] }
    return [snapshot.elements[index]]
}

func composerCandidates(in elements: [ElementInfo]) -> [ElementInfo] {
    let query = NeutralAXQuery(nodes: neutralNodes(from: elements))
    guard let index = uniqueComposerIndex(in: query) else { return [] }
    return [elements[index]]
}

func composerCandidate(in appElement: AXUIElement) -> ElementInfo? {
    let candidates = composerCandidates(in: appElement)
    return candidates.count == 1 ? candidates[0] : nil
}

enum ComposerDictationPhase: String {
    case idle
    case recording
    case retry
}

func dictationTextMatches(
    _ rawText: String,
    phase: ComposerDictationPhase
) -> Bool {
    let text = normalized(rawText)
    switch phase {
    case .idle:
        return text == "dictate" || text.hasPrefix("dictateclicktodictate")
    case .recording:
        return text == "stopdictation" || text.hasPrefix("stopdictation")
    case .retry:
        return text == "retrydictation" || text.hasPrefix("retrydictation")
    }
}

func dictationControl(
    in snapshot: AXSnapshot,
    phase: ComposerDictationPhase
) -> ElementInfo? {
    guard
        let composerIndex = uniqueComposerIndex(in: snapshot.query),
        let control = controlIndex(
            inComposerRegion: composerIndex,
            query: snapshot.query,
            roles: Set([kAXButtonRole as String]),
            predicate: { dictationTextMatches($0, phase: phase) }
        )
    else { return nil }
    return snapshot.elements[control]
}

func composerModeControl(
    _ mode: String,
    elements: [ElementInfo],
    composer: ElementInfo,
    query: NeutralAXQuery? = nil
) -> ElementInfo? {
    let query = query ?? NeutralAXQuery(nodes: neutralNodes(from: elements))
    guard
        let composerIndex = elements.firstIndex(where: {
            sameElement($0.element, composer.element)
        }),
        let control = controlIndex(
            inComposerRegion: composerIndex,
            query: query,
            roles: Set([
                kAXButtonRole as String,
                kAXRadioButtonRole as String,
            ]),
            predicate: {
                let text = normalized($0)
                return text == mode || text == "\(mode)mode"
            }
        )
    else { return nil }
    return elements[control]
}

func readMode(
    _ mode: String,
    elements: [ElementInfo],
    composer: ElementInfo? = nil,
    query: NeutralAXQuery? = nil
) throws -> Bool {
    guard mode == "plan" || mode == "fast" else {
        throw ControlError.failed("Unsupported Codex mode.")
    }
    let query = query ?? NeutralAXQuery(nodes: neutralNodes(from: elements))
    guard let composer = composer ?? uniqueComposerIndex(in: query).map({ elements[$0] }) else {
        throw ControlError.failed(
            "The live Codex composer is unavailable. Open an idle Codex chat."
        )
    }
    if mode == "fast" {
        throw ControlError.failed(
            "Fast state requires the live picker snapshot."
        )
    }
    let control = composerModeControl(
        mode,
        elements: elements,
        composer: composer,
        query: query
    )
    let text = normalized(
        "\(composer.description) "
            + composer.value
    )
    return control != nil && text.contains("generateaplan")
}

func readMode(
    _ mode: String,
    appElement: AXUIElement,
    composer: ElementInfo? = nil
) throws -> Bool {
    if mode == "fast" {
        return try readFastMode(appElement)
    }
    let snapshot = captureAXSnapshot(appElement)
    return try readMode(
        mode,
        elements: snapshot.elements,
        composer: composer
    )
}

func pickerFastState(in elements: [ElementInfo]) -> Bool? {
    if let speed = menuItem(in: elements, descriptionPrefix: "Speed ") {
        let value = normalized(
            speed.description.dropFirst("Speed ".count).description
        )
        if value.contains("fast") { return true }
        if value.contains("standard") { return false }
    }

    for info in elements {
        let role = info.role
        guard
            role == (kAXMenuItemRole as String)
                || role == (kAXCheckBoxRole as String)
                || role == (kAXButtonRole as String)
        else {
            continue
        }
        let text = normalized(elementText(info))
        if text.contains("enablestandardmode") { return true }
        if text.contains("enablefastmode") { return false }
    }
    return nil
}

func exposeFastControl(in appElement: AXUIElement) throws {
    let initial = captureAXSnapshot(appElement)
    let picker = try requirePicker(in: initial.elements)
    try click(picker.element)
    if waitForFastState(readState: {
        pickerFastState(in: captureAXSnapshot(appElement).elements)
    }) != nil { return }

    let opened = captureAXSnapshot(appElement)

    if let advanced = opened.elements.first(where: { info in
        info.role == (kAXMenuItemRole as String)
            && normalized(elementText(info)).contains("advanced")
    }) {
        try click(advanced.element)
        guard waitForFastState(timeout: 1.2, readState: {
            pickerFastState(in: captureAXSnapshot(appElement).elements)
        }) != nil
        else {
            throw ControlError.failed(
                "Codex opened no verifiable Fast mode control."
            )
        }
        return
    }

    throw ControlError.failed(
        "Codex opened no verifiable Fast mode control."
    )
}

func readFastMode(_ appElement: AXUIElement) throws -> Bool {
    dismissOpenMenus()
    try exposeFastControl(in: appElement)
    defer { pressEscape() }
    let snapshot = captureAXSnapshot(appElement)
    guard let active = pickerFastState(in: snapshot.elements) else {
        throw ControlError.failed(
            "Codex opened no verifiable Fast mode state."
        )
    }
    return active
}

let approvalModes = ["ask", "approve", "yolo", "custom"]

func approvalMode(from value: String) -> String? {
    let text = normalized(value)
    if text.contains("approveforme") { return "approve" }
    if text.contains("askforapproval") { return "ask" }
    if text.contains("fullaccess") || text.contains("yolo") { return "yolo" }
    if text.contains("custom") { return "custom" }
    if text == "approve" || text.contains("changepermissionsapprove") {
        return "approve"
    }
    if text == "ask" || text.contains("changepermissionsask") {
        return "ask"
    }
    return nil
}

func isFullAccessConfirmationButton(_ value: String) -> Bool {
    let text = normalized(value)
    return text == "confirm" || text.contains("turnonfullaccess")
}

func fullAccessConfirmationVisible(in snapshot: AXSnapshot) -> Bool {
    snapshot.query.nodes.indices.contains { index in
        snapshot.query.ownerIsVisible(index)
            && normalized(snapshot.query.visibleDescendantText[index])
                .contains("turnonfullaccess")
    }
}

func fullAccessConfirmationButton(
    in snapshot: AXSnapshot
) -> ElementInfo? {
    guard let index = fullAccessConfirmationButtonIndex(in: snapshot.query) else {
        return nil
    }
    return snapshot.elements[index]
}

func approvalModeControl(
    elements: [ElementInfo],
    composer: ElementInfo,
    query: NeutralAXQuery? = nil
) -> (ElementInfo, String)? {
    let query = query ?? NeutralAXQuery(nodes: neutralNodes(from: elements))
    guard
        let composerIndex = elements.firstIndex(where: {
            sameElement($0.element, composer.element)
        }),
        let controlIndex = permissionControlIndex(
            composerIndex: composerIndex,
            query: query
        ),
        let mode = approvalMode(
            from: query.descendantText[controlIndex]
        )
    else { return nil }
    return (elements[controlIndex], mode)
}

struct ComposerObservation {
    let pending: Bool
    let pendingTitle: String?
    let approvalMode: String?
}

struct NeutralComposerSnapshot {
    let nodes: [NeutralAXNode]
    let windowFrame: CGRect?
}

// Pure evaluator shared by the live retained AX collection and deterministic
// native fixtures. Mutation selectors query the same neutral node snapshot.
func evaluateComposerSnapshot(_ snapshot: NeutralComposerSnapshot) -> ComposerObservation? {
    let query = NeutralAXQuery(nodes: snapshot.nodes)
    let composers = query.nodes.filter {
        $0.role == (kAXTextAreaRole as String)
            && $0.enabled
            && ($0.elementFrame.map { $0.width >= 240 && $0.height >= 36 && !$0.isEmpty } ?? false)
    }
    guard composers.count == 1, let composerFrame = composers[0].elementFrame else { return nil }
    let visibleStates = query.nodes.compactMap { node -> (NeutralAXNode, CGRect)? in
        let text = neutralNodeText(node)
        guard
            isAwaitingApprovalState(text),
            !node.hidden,
            let stateFrame = node.elementFrame,
            !stateFrame.isEmpty,
            snapshot.windowFrame?.intersects(stateFrame) ?? true
        else { return nil }
        return (node, stateFrame)
    }
    let enabledButtons = query.nodes.filter {
        $0.role == (kAXButtonRole as String) && $0.enabled
    }
    let fallbackPending = query.nodes.contains { prompt in
        guard
            containsApprovalPrompt(neutralNodeText(prompt)),
            let promptFrame = prompt.elementFrame
        else { return false }
        let nearby = promptFrame.insetBy(dx: -480, dy: -320)
        let approvals = enabledButtons.filter {
            isApprovalChoice(neutralNodeText($0))
                && ($0.elementFrame.map { nearby.intersects($0) } ?? false)
        }
        let rejections = enabledButtons.filter {
            isRejectionChoice(neutralNodeText($0))
                && ($0.elementFrame.map { nearby.intersects($0) } ?? false)
        }
        return approvals.contains { approval in
            rejections.contains { rejection in
                guard
                    let approvalFrame = approval.elementFrame,
                    let rejectionFrame = rejection.elementFrame
                else { return false }
                return abs(approvalFrame.midY - rejectionFrame.midY) <= 180
                    && abs(approvalFrame.midX - rejectionFrame.midX) <= 720
            }
        }
    }
    let title = visibleStates.compactMap { (_, stateFrame) -> (String, CGRect)? in
        query.nodes.compactMap { candidate -> (String, CGRect)? in
            let text = neutralNodeText(candidate)
            guard
                !text.isEmpty,
                !isAwaitingApprovalState(text),
                let candidateFrame = candidate.elementFrame,
                (candidate.role == (kAXStaticTextRole as String) || candidate.role == (kAXButtonRole as String)),
                abs(candidateFrame.midY - stateFrame.midY) <= 18,
                candidateFrame.width >= 80,
                candidateFrame.minX < stateFrame.minX
                    || candidateFrame.contains(CGPoint(x: stateFrame.midX, y: stateFrame.midY))
            else { return nil }
            return (text, candidateFrame)
        }
        .sorted { left, right in
            left.0.count == right.0.count ? left.1.minX < right.1.minX : left.0.count > right.0.count
        }
        .first
    }.first?.0
    let region = CGRect(
        x: composerFrame.minX - 24,
        y: composerFrame.minY - 24,
        width: composerFrame.width + 48,
        height: composerFrame.height + 112
    )
    let approval = query.nodes.indices.compactMap {
        index -> String? in
        let control = query.nodes[index]
        guard
            control.role == (kAXButtonRole as String) || control.role == (kAXPopUpButtonRole as String),
            let controlFrame = control.elementFrame,
            !controlFrame.isEmpty,
            region.intersects(controlFrame)
        else { return nil }
        return approvalMode(
            from: query.descendantText[index]
        )
    }.first
    return ComposerObservation(
        pending: !visibleStates.isEmpty || fallbackPending,
        pendingTitle: title,
        approvalMode: approval
    )
}

func neutralComposerSnapshot(
    from elements: [ElementInfo],
    windowFrame: CGRect?
) -> NeutralComposerSnapshot {
    NeutralComposerSnapshot(
        nodes: neutralNodes(from: elements),
        windowFrame: windowFrame
    )
}

func observeComposer(
    in elements: [ElementInfo],
    windowFrame: CGRect?
) -> ComposerObservation? {
    evaluateComposerSnapshot(
        neutralComposerSnapshot(from: elements, windowFrame: windowFrame)
    )
}

func readApprovalMode(in elements: [ElementInfo]) throws -> String {
    guard let composer = composerCandidates(in: elements).first else {
        throw ControlError.failed(
            "The live Codex composer is unavailable. Open an idle Codex chat."
        )
    }
    guard
        let (_, mode) = approvalModeControl(
            elements: elements,
            composer: composer
        )
    else {
        throw ControlError.failed(
            "Codex opened no verifiable approval mode control."
        )
    }
    return mode
}

func readApprovalMode(in snapshot: AXSnapshot) throws -> String {
    guard let composer = composerCandidates(in: snapshot).first,
          let (_, mode) = approvalModeControl(
              elements: snapshot.elements,
              composer: composer,
              query: snapshot.query
          )
    else {
        throw ControlError.failed("Codex opened no verifiable approval mode control.")
    }
    return mode
}

func readApprovalMode(_ appElement: AXUIElement) throws -> String {
    try readApprovalMode(in: captureAXSnapshot(appElement).elements)
}

/// Open the permission menu and report which canonical modes Codex offers.
/// Current builds offer Ask, Approve, and Full Access; "custom" appears only
/// when a chat has one configured, so the cycle must follow the live menu.
func offeredApprovalModes(
    appElement: AXUIElement,
    initial: AXSnapshot
) throws -> (current: String, offered: [String]) {
    guard let composer = composerCandidates(in: initial).first else {
        throw ControlError.failed(
            "The live Codex composer is unavailable. Open an idle Codex chat."
        )
    }
    guard
        let (control, current) = approvalModeControl(
            elements: initial.elements,
            composer: composer,
            query: initial.query
        )
    else {
        throw ControlError.failed(
            "Codex opened no verifiable approval mode control."
        )
    }
    try click(control.element)
    defer { dismissOpenMenus() }
    guard let offered = waitUntil(timeout: 1.5, operation: { () -> [String]? in
        let snapshot = captureAXSnapshot(appElement)
        let modes = approvalModes.filter { approvalMenuItem(in: snapshot, mode: $0) != nil }
        return modes.isEmpty ? nil : modes
    }) else {
        throw ControlError.failed(
            "Codex opened no approval mode menu.",
            "UNAVAILABLE"
        )
    }
    return (current, offered)
}

/// The next mode in canonical order that Codex actually offers, wrapping.
func nextOfferedApprovalMode(current: String, offered: [String]) -> String? {
    guard let index = approvalModes.firstIndex(of: current) else { return nil }
    for step in 1..<approvalModes.count {
        let candidate = approvalModes[(index + step) % approvalModes.count]
        if candidate != current, offered.contains(candidate) { return candidate }
    }
    return nil
}

enum FullAccessOutcome {
    case confirmation(ElementInfo)
    case applied
}

func approvalMenuItem(
    in snapshot: AXSnapshot,
    mode: String
) -> ElementInfo? {
    let matches = snapshot.elements.indices.filter { index in
        let info = snapshot.elements[index]
        guard
            info.role == (kAXMenuItemRole as String),
            info.enabled
        else {
            return false
        }
        return approvalMode(from: snapshot.query.descendantText[index]) == mode
    }
    return matches.count == 1 ? snapshot.elements[matches[0]] : nil
}

func applyApprovalMode(
    _ requested: String,
    appElement: AXUIElement,
    initial: AXSnapshot
) throws -> String {
    guard approvalModes.contains(requested) else {
        throw ControlError.failed("Unsupported Codex approval mode.")
    }
    guard let composer = composerCandidates(in: initial).first else {
        throw ControlError.failed(
            "The live Codex composer is unavailable. Open an idle Codex chat."
        )
    }
    guard
        let (control, current) = approvalModeControl(
            elements: initial.elements,
            composer: composer,
            query: initial.query
        )
    else {
        throw ControlError.failed(
            "Codex opened no verifiable approval mode control."
        )
    }
    if current == requested { return current }

    try click(control.element)
    guard
        let item = waitUntil(timeout: 1.5, operation: {
            singlePassQuery(
                poll: SinglePassCapture<AXSnapshot>(),
                capture: { captureAXSnapshot(appElement) },
                query: { approvalMenuItem(in: $0, mode: requested) }
            ) ?? nil
        })
    else {
        pressEscape()
        throw ControlError.failed(
            "Codex does not offer the requested approval mode."
        )
    }
    try click(item.element)

    if requested == "yolo" {
        // Codex asks for Full Access confirmation the first time only, and the
        // dialog can take over two seconds to appear. Accept either the dialog
        // or a composer that already shows the mode.
        guard let outcome = waitUntil(timeout: 4.5, operation: {
            singlePassQuery(
                poll: SinglePassCapture<AXSnapshot>(),
                capture: { captureAXSnapshot(appElement) },
                query: { snapshot -> FullAccessOutcome? in
                    if let confirm = fullAccessConfirmationButton(in: snapshot) {
                        return .confirmation(confirm)
                    }
                    return (try? readApprovalMode(in: snapshot)) == "yolo"
                        ? .applied : nil
                }
            ) ?? nil
        }) else {
            throw ControlError.failed(
                "Codex neither confirmed Full Access nor applied it.",
                "UNAVAILABLE"
            )
        }
        if case .confirmation(let confirm) = outcome {
            try click(confirm.element)
            guard waitUntil(timeout: 2.4, operation: {
                singlePassQuery(
                    poll: SinglePassCapture<AXSnapshot>(),
                    capture: { captureAXSnapshot(appElement) },
                    query: { fullAccessConfirmationVisible(in: $0) ? nil : true }
                ) ?? nil
            }) != nil else {
                throw ControlError.failed(
                    "The Full Access confirmation did not dismiss.",
                    "TIMEOUT"
                )
            }
        }
    }

    guard
        let confirmed = waitUntil(timeout: 1.8, operation: {
            singlePassQuery(
                poll: SinglePassCapture<AXSnapshot>(),
                capture: { captureAXSnapshot(appElement) },
                query: { (try? readApprovalMode(in: $0)) == requested ? requested : nil }
            ) ?? nil
        })
    else {
        throw ControlError.failed(
            "The visible Codex composer did not confirm the requested approval mode."
        )
    }
    return confirmed
}

func resolvedComposerDraft(value rawValue: String, description rawDescription: String) -> String {
    let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    let description = rawDescription.trimmingCharacters(
        in: .whitespacesAndNewlines
    )
    if value == description { return "" }

    // Current Chromium-backed Codex builds expose the empty composer hint as
    // AXValue while AXDescription and AXPlaceholderValue are both empty.
    // Treat only the exact product placeholder as empty; all other text stays
    // protected by the draft-preservation guard.
    let emptyComposerPlaceholders = [
        "Ask Codex...",
        "Ask anything",
        "Do anything",
        "Describe your task to generate a plan...",
    ]
    if description.isEmpty && emptyComposerPlaceholders.contains(where: {
        value.caseInsensitiveCompare($0) == .orderedSame
    }) {
        return ""
    }
    return value
}

func composerDraft(_ composer: ElementInfo) -> String {
    resolvedComposerDraft(
        value: composer.value,
        description: composer.description
    )
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
    appElement: AXUIElement,
    initial: AXSnapshot
) throws -> Bool {
    guard let composer = composerCandidates(in: initial).first else {
        throw ControlError.failed(
            "The live Codex composer is unavailable. Open an idle Codex chat."
        )
    }
    guard composerDraft(composer).isEmpty else {
        throw ControlError.failed(
            "\(mode.capitalized) was not changed because the visible composer contains a draft."
        )
    }

    if mode == "plan" {
        let current = try readMode(
            mode,
            elements: initial.elements,
            composer: composer,
            query: initial.query
        )
        let requestedState = !current
        try click(composer.element)
        usleep(80_000)
        try typeCommandAndReturn("/plan")
        guard
            waitUntil(timeout: 1.8, operation: { () -> Bool? in
                let snapshot = captureAXSnapshot(appElement)
                guard let observed = try? readMode(mode, elements: snapshot.elements) else {
                    return nil
                }
                return modeTransitionObserved(
                    mode: mode,
                    draftEmpty: true,
                    before: current,
                    requested: requestedState,
                    observed: observed
                ) ? observed : nil
            }) != nil
        else {
            throw ControlError.failed(
                "The visible Codex composer did not confirm \(mode.capitalized) \(requestedState ? "active" : "off")."
            )
        }
        return requestedState
    }

    // `/fast` is the supported Codex toggle. Driving the compact picker's
    // menu-item checkbox directly was brittle across desktop builds and could
    // click without changing the service tier. Read the picker only to verify
    // the slash command's postcondition.
    let previousState = try readFastMode(appElement)
    try click(composer.element)
    usleep(80_000)
    try typeCommandAndReturn("/fast")
    usleep(220_000)
    try exposeFastControl(in: appElement)

    guard
        let confirmedState = waitUntil(timeout: 2.4, operation: { () -> Bool? in
            let snapshot = captureAXSnapshot(appElement)
            guard let active = pickerFastState(in: snapshot.elements) else {
                return nil
            }
            return modeTransitionObserved(
                mode: mode,
                draftEmpty: true,
                before: previousState,
                requested: !previousState,
                observed: active
            ) ? active : nil
        })
    else {
        throw ControlError.failed(
            "The visible Codex composer did not confirm that /fast changed the service tier."
        )
    }
    return confirmedState
}

func applySelection(
    appElement: AXUIElement,
    categoryPrefix: String,
    targetLabel: String,
    initial: AXSnapshot
) throws {
    try openPickerMenu(appElement: appElement, initial: initial)
    if categoryPrefix == "Model " {
        try selectModel(targetLabel, appElement: appElement)
    } else {
        try selectPower(targetLabel, appElement: appElement, initial: initial)
    }
    dismissOpenMenus()
}

/// "Select model" opens a submenu of plain model titles ("5.6 Sol") with a
/// check mark on the current one.
func selectModel(_ targetLabel: String, appElement: AXUIElement) throws {
    guard let entry = captureAXSnapshot(appElement).elements.first(where: {
        $0.role == (kAXMenuItemRole as String) && normalized($0.description) == "selectmodel"
    }) else {
        pressEscape()
        throw ControlError.failed("Codex did not expose the Select model control.", "UNAVAILABLE")
    }
    try clickMenuItem(entry.element)
    guard let target = waitUntil(timeout: 1.5, operation: { () -> ElementInfo? in
        let snapshot = captureAXSnapshot(appElement)
        let matches = snapshot.elements.filter {
            $0.role == (kAXMenuItemRole as String)
                && pickerMenuTextMatches($0.title, label: targetLabel)
        }
        return matches.count == 1 ? matches[0] : nil
    }) else {
        let available = captureAXSnapshot(appElement).elements
            .filter { $0.role == (kAXMenuItemRole as String) && !$0.title.isEmpty }
            .map(\.title).joined(separator: " | ")
        pressEscape()
        throw ControlError.failed(
            "Codex does not offer \(targetLabel) in the model list. Available: \(available)",
            "UNAVAILABLE"
        )
    }
    // Reacquire after Chromium's submenu animation so the press hits a
    // settled element.
    usleep(220_000)
    guard let settled = captureAXSnapshot(appElement).elements.first(where: {
        $0.role == (kAXMenuItemRole as String) && pickerMenuTextMatches($0.title, label: targetLabel)
    }) else {
        pressEscape()
        throw ControlError.failed("Codex's \(targetLabel) item did not remain selectable.")
    }
    _ = settled
    guard AXUIElementPerformAction(target.element, kAXPressAction as CFString) == .success else {
        pressEscape()
        throw ControlError.failed("Codex rejected the \(targetLabel) menu-item press.")
    }
    usleep(400_000)
}

/// Effort is a five-segment Power control inside the open picker. Step from
/// the current readout toward the level, re-reading after every click, and
/// refuse a segment that changes the model.
func selectPower(
    _ targetLabel: String,
    appElement: AXUIElement,
    initial: AXSnapshot
) throws {
    guard let level = effortLabels.first(where: { $0.value == targetLabel })?.key,
          powerRanks[level] != nil
    else {
        pressEscape()
        throw ControlError.failed(
            "Codex's Power control does not offer \(targetLabel).",
            "UNAVAILABLE"
        )
    }
    guard let current = parsePickerTitle(try requirePicker(in: initial.elements).title) else {
        pressEscape()
        throw ControlError.failed("Codex shows an unreadable Model/Effort picker title.", "UNAVAILABLE")
    }
    func readout() throws -> PowerReadout {
        let snapshot = captureAXSnapshot(appElement)
        guard let text = powerReadout(in: snapshot), let parsed = parsePowerReadout(text) else {
            pressEscape()
            throw ControlError.failed("Codex exposed no readable Power control.", "UNAVAILABLE")
        }
        return parsed
    }
    var state = try readout()
    var previous = state.position
    // Five segments: at most four clicks, then one final check.
    for _ in 0..<5 {
        if state.level == level, normalized(state.model) == normalized(current.model) { return }
        guard normalized(state.model) == normalized(current.model) else {
            // A segment switched the model. Step back and fail closed.
            clickPowerSegment(previous, appElement: appElement)
            pressEscape()
            throw ControlError.failed(
                "Codex's Power control moved to \(state.model) instead of \(current.model) \(targetLabel).",
                "UNCHANGED"
            )
        }
        guard let segment = nextPowerSegment(from: state, to: level) else {
            pressEscape()
            throw ControlError.failed(
                "Codex's Power control does not reach \(targetLabel) for \(current.model).",
                "UNAVAILABLE"
            )
        }
        previous = state.position
        clickPowerSegment(segment, appElement: appElement)
        let before = state
        guard let next = waitUntil(timeout: 1.5, operation: { () -> PowerReadout? in
            guard let text = powerReadout(in: captureAXSnapshot(appElement)),
                  let parsed = parsePowerReadout(text), parsed != before
            else { return nil }
            return parsed
        }) else {
            pressEscape()
            throw ControlError.failed(
                "Codex's Power control did not move from \(before.model) \(before.level).",
                "UNCHANGED"
            )
        }
        state = next
    }
    pressEscape()
    throw ControlError.failed(
        "Codex's Power control did not settle on \(current.model) \(targetLabel).",
        "UNCHANGED"
    )
}

func clickPowerSegment(_ segment: Int, appElement: AXUIElement) {
    guard let frame = powerControlFrame(in: captureAXSnapshot(appElement)) else { return }
    let point = CGPoint(
        x: frame.minX + (CGFloat(segment) - 0.5) * frame.width / 5,
        y: frame.midY
    )
    guard
        let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
        let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
    else { return }
    down.post(tap: .cghidEventTap)
    usleep(40_000)
    up.post(tap: .cghidEventTap)
    usleep(150_000)
}

func pressKey(_ key: CGKeyCode, flags: CGEventFlags = []) throws {
    guard
        let down = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: true),
        let up = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: false)
    else {
        throw ControlError.failed("Could not create paired keyboard events.")
    }
    down.flags = flags
    up.flags = flags
    var postedDown = false
    defer {
        if postedDown { up.post(tap: .cghidEventTap) }
    }
    down.post(tap: .cghidEventTap)
    postedDown = true
    usleep(60_000)
}

func sidebarVisibleState(_ elements: [ElementInfo]) -> Bool? {
    let states = elements.compactMap { info -> Bool? in
        guard info.role == (kAXButtonRole as String) else { return nil }
        let text = normalized("\(info.title) \(info.description)")
        if text == "hidesidebar" { return true }
        if text == "showsidebar" { return false }
        return nil
    }
    return states.count == 1 ? states[0] : nil
}

func compactingMarkerCount(_ elements: [ElementInfo]) -> Int {
    elements.filter { info in
        let text = normalized(elementText(info))
        return text.contains("compacting") || text.contains("contextcompacted")
    }.count
}

func observedNewMarker(before: Int, after: Int) -> Bool {
    after > before
}

func visibleDraftMessageCount(_ elements: [ElementInfo], draft: String) -> Int {
    let expected = normalized(draft)
    return elements.filter { info in
        guard info.role == (kAXStaticTextRole as String) else { return false }
        return normalized(elementText(info)) == expected
    }.count
}

func submittedComposerProof(
    sameComposer: Bool,
    draftIsEmpty: Bool,
    beforeMessages: Int,
    afterMessages: Int
) -> Bool {
    sameComposer && draftIsEmpty && afterMessages > beforeMessages
}

func approvalResolutionObserved(pendingRemains: Bool) -> Bool {
    !pendingRemains
}

func sidebarTransitionObserved(before: Bool?, after: Bool?) -> Bool {
    guard let before, let after else { return false }
    return before != after
}

func settingsRouteVisible(_ elements: [ElementInfo]) -> Bool {
    let matches = elements.filter { info in
        let text = normalized(elementText(info))
        return text == "settings"
            && (info.role == (kAXWindowRole as String)
                || info.role == "AXHeading"
                || info.role == "AXTab")
    }
    return !matches.isEmpty
}

func workspaceSurfaceVisible(
    in query: NeutralAXQuery,
    label: String
) -> Bool {
    let expected = normalized(label)
    return query.nodes.contains { node in
        guard normalized(neutralNodeText(node)) == expected else { return false }
        if node.role == (kAXWindowRole as String) || node.role == "AXHeading" {
            return true
        }
        return (node.role == "AXTab" || node.role == (kAXButtonRole as String))
            && node.selected
    }
}

func workspaceSurfaceVisible(_ elements: [ElementInfo], label: String) -> Bool {
    workspaceSurfaceVisible(
        in: NeutralAXQuery(nodes: neutralNodes(from: elements)),
        label: label
    )
}

func workspaceSurfaceTransitionObserved(before: Bool, after: Bool) -> Bool {
    before != after
}

func dispatchControl(
    _ value: String,
    appElement: AXUIElement,
    initial: AXSnapshot,
    applicationElement: AXUIElement? = nil
) throws {
    let pair = value.split(separator: ":", maxSplits: 1).map(String.init)
    guard pair.count == 2 else {
        throw ControlError.failed("Malformed targeted control dispatch.")
    }
    let mode = pair[0]
    let payload = pair[1]
    if mode == "slash" {
        guard payload.hasPrefix("/") else {
            throw ControlError.failed("Invalid targeted slash command.")
        }
        guard payload == "/compact" else {
            throw ControlError.failed("Unsupported targeted slash command.")
        }
        guard
            let composer = composerCandidates(in: initial).first,
            composerDraft(composer).isEmpty
        else {
            throw ControlError.failed("Compact requires an empty visible composer.", "DRAFT_PRESENT")
        }
        let beforeMarkers = compactingMarkerCount(initial.elements)
        try typeCommandAndReturn(payload)
        guard waitUntil(timeout: 2.4, operation: {
            let snapshot = captureAXSnapshot(appElement)
            return observedNewMarker(
                before: beforeMarkers,
                after: compactingMarkerCount(snapshot.elements)
            ) ? true : nil
        }) != nil else {
            throw ControlError.failed("Codex did not visibly accept Compact.", "TIMEOUT")
        }
        return
    }
    guard mode == "shortcut" else {
        throw ControlError.failed("Unsupported targeted control mode.")
    }
    switch payload {
    case "accept", "approve":
        guard observeComposer(
            in: initial.elements,
            windowFrame: initial.elements.first?.elementFrame
        )?.pending == true else {
            throw ControlError.failed("No visible eligible approval is pending.")
        }
        try pressKey(36)
        guard waitUntil(timeout: 1.8, operation: { () -> Bool? in
            let snapshot = captureAXSnapshot(
                appElement,
                maximumDepth: maximumCodexWindowTraversalDepth
            )
            return approvalResolutionObserved(
                pendingRemains: observeComposer(
                    in: snapshot.elements,
                    windowFrame: snapshot.elements.first?.elementFrame
                )?.pending == true
            ) ? true : nil
        }) != nil else {
            throw ControlError.failed("The visible approval did not resolve.")
        }
    case "reject", "decline":
        guard observeComposer(
            in: initial.elements,
            windowFrame: initial.elements.first?.elementFrame
        )?.pending == true else {
            throw ControlError.failed("No visible eligible approval is pending.")
        }
        try pressKey(53)
        guard waitUntil(timeout: 1.8, operation: { () -> Bool? in
            let snapshot = captureAXSnapshot(
                appElement,
                maximumDepth: maximumCodexWindowTraversalDepth
            )
            return approvalResolutionObserved(
                pendingRemains: observeComposer(
                    in: snapshot.elements,
                    windowFrame: snapshot.elements.first?.elementFrame
                )?.pending == true
            ) ? true : nil
        }) != nil else {
            throw ControlError.failed("The visible approval did not resolve.")
        }
    case "send":
        guard
            let composer = composerCandidates(in: initial).first,
            !composerDraft(composer).isEmpty
        else {
            throw ControlError.failed("Send requires a nonempty visible composer draft.", "DRAFT_PRESENT")
        }
        let draft = composerDraft(composer)
        let beforeMessages = visibleDraftMessageCount(
            initial.elements,
            draft: draft
        )
        try pressKey(36)
        guard waitUntil(timeout: 1.8, operation: { () -> Bool? in
            let snapshot = captureAXSnapshot(appElement)
            guard
                let after = composerCandidates(in: snapshot.elements).first
            else { return nil }
            return submittedComposerProof(
                sameComposer: sameElement(composer.element, after.element),
                draftIsEmpty: composerDraft(after).isEmpty,
                beforeMessages: beforeMessages,
                afterMessages: visibleDraftMessageCount(
                    snapshot.elements,
                    draft: draft
                )
            ) ? true : nil
        }) != nil else {
            throw ControlError.failed("The visible composer did not submit its draft.", "TIMEOUT")
        }
    case "sidebar":
        guard let before = sidebarVisibleState(initial.elements) else {
            throw ControlError.failed("Codex exposes no unambiguous sidebar control.")
        }
        try pressKey(11, flags: .maskCommand)
        guard waitUntil(timeout: 1.8, operation: { () -> Bool? in
            let snapshot = captureAXSnapshot(appElement)
            guard
                let after = sidebarVisibleState(snapshot.elements)
            else { return nil }
            return sidebarTransitionObserved(before: before, after: after) ? true : nil
        }) != nil else {
            throw ControlError.failed("The visible sidebar state did not change.", "UNCHANGED")
        }
    case "settings":
        let root = applicationElement ?? appElement
        try pressKey(43, flags: .maskCommand)
        guard waitUntil(timeout: 2.4, operation: {
            let snapshot = captureAXSnapshot(root)
            return settingsRouteVisible(snapshot.elements) ? true : nil
        }) != nil else {
            throw ControlError.failed(
                "Codex did not show a verified Settings view.",
                "TIMEOUT"
            )
        }
    case "review-panel", "browser", "files", "side-chat":
        let root = applicationElement ?? appElement
        guard let shortcut = workspaceShortcut(payload) else {
            throw ControlError.failed(
                "Unsupported Codex workspace shortcut."
            )
        }
        let before = workspaceSurfaceVisible(
            captureAXSnapshot(root).elements,
            label: shortcut.label
        )
        try pressKey(shortcut.key, flags: shortcut.flags)
        guard waitUntil(timeout: 2.4, operation: {
            let snapshot = captureAXSnapshot(root)
            let after = workspaceSurfaceVisible(
                snapshot.elements,
                label: shortcut.label
            )
            return workspaceSurfaceTransitionObserved(before: before, after: after)
                ? true : nil
        }) != nil else {
            throw ControlError.failed(
                "Codex did not visibly toggle the \(shortcut.label) surface.",
                "UNCHANGED"
            )
        }
    default: throw ControlError.failed("Unsupported targeted shortcut.")
    }
}

func isAddProjectPickerPresentation(
    _ role: String,
    _ descendantText: String,
    hasOpenPanel: Bool = false
) -> Bool {
    guard role == (kAXSheetRole as String)
        || role == "AXDialog"
        || (role == (kAXWindowRole as String) && hasOpenPanel)
    else { return false }
    let text = normalized(descendantText)
    return text.contains("addnewproject")
        || text.contains("newproject")
        || text.contains("openfolder")
}

func addProjectPickerElements(_ snapshot: AXSnapshot) -> [AXUIElement] {
    addProjectOwnerIndices(in: snapshot.query).map { snapshot.elements[$0].element }
}

func addProjectOwnerBelongsToRetainedWindow(
    ownerIndex: Int,
    retainedWindow: AXUIElement,
    elements: [ElementInfo],
    query: NeutralAXQuery
) -> Bool {
    guard let retainedIndex = elements.indices.first(where: {
        sameElement(elements[$0].element, retainedWindow)
    }) else { return false }
    return addProjectOwnerBelongsToRetainedNode(
        ownerIndex: ownerIndex,
        retainedIndex: retainedIndex,
        query: query
    )
}

func addProjectOwnerBelongsToRetainedNode(
    ownerIndex: Int,
    retainedIndex: Int,
    query: NeutralAXQuery
) -> Bool {
    ownerIndex == retainedIndex || query.isDescendant(ownerIndex, of: retainedIndex)
}

func newOwnedAddProjectPicker(
    before: AXSnapshot,
    after: AXSnapshot,
    retainedWindow: AXUIElement
) -> Int? {
    let beforeOwners = addProjectPickerElements(before)
    let query = after.query
    let afterOwners = addProjectOwnerIndices(in: query)
    guard afterOwners.count == beforeOwners.count + 1 else { return nil }
    let newOwners = afterOwners.filter { ownerIndex in
        !beforeOwners.contains { sameElement($0, after.elements[ownerIndex].element) }
    }
    guard newOwners.count == 1,
          addProjectOwnerBelongsToRetainedWindow(
              ownerIndex: newOwners[0],
              retainedWindow: retainedWindow,
              elements: after.elements,
              query: query
          )
    else { return nil }
    return newOwners[0]
}

func isSkillsRoutePresentation(_ role: String, _ text: String, _ selected: Bool) -> Bool {
    guard normalized(text) == "skills" else { return false }
    return role == "AXHeading"
        || ((role == "AXTab" || role == (kAXButtonRole as String)) && selected)
}

func isSkillsRouteElement(_ info: ElementInfo) -> Bool {
    isSkillsRoutePresentation(
        info.role,
        elementText(info),
        boolAttribute(info.element, kAXSelectedAttribute as CFString)
    )
}

func skillsRouteVisible(in window: AXUIElement) -> Bool {
    let matches = allElements(window).filter(isSkillsRouteElement)
    return matches.count == 1
}

func launchVerifiedRoute(
    _ request: RouteRequest,
    app: NSRunningApplication,
    appElement: AXUIElement
) throws {
    switch request.route {
    case "new-chat":
        let cursor = desktopLogCursor()
        guard let databasePath = request.databasePath,
              isRegularCanonicalSQLiteDatabase(databasePath),
              let databaseIdentity = databaseProvenance(databasePath),
              let existingIds = sqliteThreadIds(databasePath)
        else {
            throw ControlError.failed("Codex state database cannot prove a new chat.")
        }
        let expectedCwd = request.path.map(canonicalPath)
        var components = URLComponents()
        components.scheme = "codex"
        components.host = "threads"
        components.path = "/new"
        if let path = request.path, !path.isEmpty {
            components.queryItems = [URLQueryItem(name: "path", value: path)]
        }
        guard let url = components.url, NSWorkspace.shared.open(url), app.activate() else {
            throw ControlError.failed("Codex could not open a new chat.")
        }
        guard let witness = waitUntil(timeout: 3.5, operation: {
            freshNewWitness(after: cursor, excluding: existingIds)
        }) else {
            throw ControlError.failed("Codex emitted no unique fresh new-chat witness.")
        }
        let window = try verifyTarget(app, appElement: appElement, witness: witness)
        guard let composer = composerCandidate(in: window), composerDraft(composer).isEmpty,
              sqliteThreadIds(databasePath)?.contains(witness.conversationId) == true,
              expectedCwd.map({ sqliteThreadCwdValue(databasePath, witness.conversationId).map(canonicalPath) == $0 }) ?? true,
              databaseProvenance(databasePath) == databaseIdentity,
              hasCurrentWitness(witness),
              sameElement(window, try uniqueFocusedCodexWindow(appElement)),
              composerCandidates(in: window).count == 1,
              composerDraft(composer) == "",
              databaseProvenance(databasePath) == databaseIdentity,
              expectedCwd.map({ sqliteThreadCwdValue(databasePath, witness.conversationId).map(canonicalPath) == $0 }) ?? true
        else {
            throw ControlError.failed("The new Codex chat did not expose an empty focused composer.")
        }
    case "skills":
        guard let url = URL(string: "codex://skills"),
              NSWorkspace.shared.open(url), app.activate()
        else {
            throw ControlError.failed("Codex could not open Skills.")
        }
        guard waitUntil(timeout: 2.5, operation: { () -> Bool? in
            guard isCodexFrontmost(app), let window = try? uniqueFocusedCodexWindow(appElement) else {
                return nil
            }
            return skillsRouteVisible(in: window) ? true : nil
        }) != nil else {
            throw ControlError.failed("Codex did not show the Skills route in its focused window.")
        }
    default:
        throw ControlError.failed("Unsupported verified Codex route.")
    }
}

func launchVerifiedWorkflow(
    _ request: WorkflowRequest,
    app: NSRunningApplication,
    appElement: AXUIElement
) throws -> DesktopWitness {
    let expectedCwd = canonicalPath(request.cwd)
    guard isRegularCanonicalSQLiteDatabase(request.databasePath),
          let databaseIdentity = databaseProvenance(request.databasePath),
          let existingIds = sqliteThreadIds(request.databasePath),
          sqliteThreadCwdValue(
              request.databasePath,
              request.sourceThreadId
          ).map(canonicalPath) == expectedCwd,
          let sourceWitness = currentWitness(
              threadId: request.sourceThreadId
          )
    else {
        throw ControlError.failed(
            "The current Codex task cannot prove the requested workflow project.",
            "TARGET_MISMATCH"
        )
    }
    _ = try verifyTarget(
        app,
        appElement: appElement,
        witness: sourceWitness
    )
    let cursor = desktopLogCursor()
    var components = URLComponents()
    components.scheme = "codex"
    components.host = "threads"
    components.path = "/new"
    components.queryItems = [
        URLQueryItem(name: "prompt", value: request.prompt),
        URLQueryItem(name: "path", value: request.cwd),
    ]
    guard let url = components.url, NSWorkspace.shared.open(url), app.activate() else {
        throw ControlError.failed("Codex could not open the requested workflow task.")
    }
    guard let witness = waitUntil(timeout: 3.5, operation: {
        freshNewWitness(after: cursor, excluding: existingIds)
    }) else {
        throw ControlError.failed("Codex emitted no unique fresh workflow task witness.")
    }
    guard let observedCwd = waitUntil(timeout: 2.0, operation: { () -> String? in
        guard let cwd = sqliteThreadCwdValue(request.databasePath, witness.conversationId),
              canonicalPath(cwd) == expectedCwd
        else { return nil }
        return cwd
    }) else {
        throw ControlError.failed("The witnessed workflow task has no matching canonical project path.")
    }
    let window = try verifyTarget(app, appElement: appElement, witness: witness)
    guard composerCandidates(in: window).count == 1,
          let composer = composerCandidate(in: window),
          composerDraft(composer) == request.prompt else {
        throw ControlError.failed("The witnessed workflow task has no matching unsubmitted draft.")
    }
    guard sqliteThreadCwdValue(request.databasePath, witness.conversationId) == observedCwd,
          canonicalPath(observedCwd) == expectedCwd,
          databaseProvenance(request.databasePath) == databaseIdentity,
          hasCurrentWitness(witness),
          sameElement(window, try uniqueFocusedCodexWindow(appElement)),
          composerCandidates(in: window).count == 1,
          let recheckedComposer = composerCandidate(in: window),
          sameElement(composer.element, recheckedComposer.element),
          composerDraft(recheckedComposer) == request.prompt,
          validatedWorkflowProof(WorkflowProofState(
              uniqueFreshWitness: hasCurrentWitness(witness),
              taskIdWasNew: !existingIds.contains(witness.conversationId),
              databaseIdentityStable: databaseProvenance(request.databasePath) == databaseIdentity,
              canonicalCwdMatches: sqliteThreadCwdValue(request.databasePath, witness.conversationId).map(canonicalPath) == expectedCwd,
              focusedWindowStable: sameElement(window, try uniqueFocusedCodexWindow(appElement)),
              uniqueComposer: composerCandidates(in: window).count == 1 && sameElement(composer.element, recheckedComposer.element),
              draftMatches: composerDraft(recheckedComposer) == request.prompt
          ))
    else {
        throw ControlError.failed("The workflow proof changed before confirmation.")
    }
    return witness
}
