import AppKit
import ApplicationServices
import Darwin
import Foundation

// Chromium shells use AXEnhancedUserInterface; Electron also exposes its own
// AXManualAccessibility switch. Both debounce activation for two seconds.
// https://github.com/chromium/chromium/blob/main/chrome/browser/chrome_browser_application_mac.mm
func initializePickerAccessibility(
    read: (String) -> Bool,
    enable: (String) -> AXError,
    settle: () -> Void
) -> String {
    let manual = "AXManualAccessibility"
    let enhanced = "AXEnhancedUserInterface"
    if read(manual) || read(enhanced) { return "already enabled" }
    let manualResult = enable(manual)
    if manualResult == .success {
        settle()
        return "manual enabled"
    }
    guard manualResult == .attributeUnsupported || manualResult == .notImplemented else {
        return "manual set=\(manualResult.rawValue)"
    }
    let enhancedResult = enable(enhanced)
    // Chromium applies the switch before delegating to AppKit, which can
    // report notImplemented even though activation has been scheduled.
    if enhancedResult == .success || enhancedResult == .notImplemented { settle() }
    return "manual set=\(manualResult.rawValue), enhanced set=\(enhancedResult.rawValue)"
}

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

func capturedFrame(
    positionValue: CFTypeRef?,
    sizeValue: CFTypeRef?
) -> CGRect? {
    guard
        let positionValue,
        let sizeValue,
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

func captureAXSnapshot(
    _ root: AXUIElement,
    maximumDepth: Int = 40
) -> AXSnapshot {
    var result: [ElementInfo] = []
    var queue: [(AXUIElement, Int, Int?)] = [(root, 0, nil)]
    var index = 0
    var seen: [CFHashCode: [AXUIElement]] = [:]

    while index < queue.count {
        let (element, depth, parentIndex) = queue[index]
        index += 1
        let identity = CFHash(element)
        let bucket = seen[identity] ?? []
        guard !bucket.contains(where: { sameElement($0, element) }) else {
            continue
        }
        seen[identity] = bucket + [element]
        let role = stringAttribute(element, kAXRoleAttribute as CFString)
        let title = stringAttribute(element, kAXTitleAttribute as CFString)
        let description = stringAttribute(
            element,
            kAXDescriptionAttribute as CFString
        )
        let value = stringAttribute(element, kAXValueAttribute as CFString)
        let help = stringAttribute(element, kAXHelpAttribute as CFString)
        let elementFrame = capturedFrame(
            positionValue: attribute(
                element,
                kAXPositionAttribute as CFString
            ),
            sizeValue: attribute(element, kAXSizeAttribute as CFString)
        )
        result.append(
            ElementInfo(
                element: element,
                role: role,
                title: title,
                description: description,
                value: value,
                help: help,
                elementFrame: elementFrame,
                enabled: boolAttribute(
                    element,
                    kAXEnabledAttribute as CFString
                ),
                hidden: boolAttribute(
                    element,
                    kAXHiddenAttribute as CFString
                ),
                selected: boolAttribute(
                    element,
                    kAXSelectedAttribute as CFString
                ),
                parentIndex: parentIndex,
                depth: depth
            )
        )
        if shouldTraverseAXChildren(atDepth: depth, maximumDepth: maximumDepth) {
            let currentIndex = result.count - 1
            queue.append(contentsOf: childElements(element).map { ($0, depth + 1, currentIndex) })
        }
    }
    return AXSnapshot(
        elements: result,
        query: NeutralAXQuery(nodes: neutralNodes(from: result))
    )
}

func allElements(_ root: AXUIElement, maximumDepth: Int = 40) -> [ElementInfo] {
    captureAXSnapshot(root, maximumDepth: maximumDepth).elements
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

func pressAccessibilityControl(_ element: AXUIElement) throws {
    let result = AXUIElementPerformAction(
        element,
        kAXPressAction as CFString
    )
    guard result == .success else {
        throw ControlError.failed(
            "Codex rejected the accessibility control press."
        )
    }
}

func clickMenuItem(_ element: AXUIElement) throws {
    guard let elementFrame = frame(element), !elementFrame.isEmpty else {
        throw ControlError.failed("The Codex menu item has no clickable frame.")
    }
    let target = CGPoint(x: elementFrame.midX, y: elementFrame.midY)
    let original = CGEvent(source: nil)?.location
    guard
        let hover = CGEvent(
            mouseEventSource: nil,
            mouseType: .mouseMoved,
            mouseCursorPosition: target,
            mouseButton: .left
        ),
        let down = CGEvent(
            mouseEventSource: nil,
            mouseType: .leftMouseDown,
            mouseCursorPosition: target,
            mouseButton: .left
        ),
        let up = CGEvent(
            mouseEventSource: nil,
            mouseType: .leftMouseUp,
            mouseCursorPosition: target,
            mouseButton: .left
        )
    else {
        throw ControlError.failed("Could not create a paired menu-item click.")
    }

    let restore = original.flatMap { point in
        CGEvent(
            mouseEventSource: nil,
            mouseType: .mouseMoved,
            mouseCursorPosition: point,
            mouseButton: .left
        )
    }
    var postedDown = false
    defer {
        if postedDown {
            up.post(tap: .cghidEventTap)
        }
        restore?.post(tap: .cghidEventTap)
    }
    hover.post(tap: .cghidEventTap)
    usleep(500_000)
    down.post(tap: .cghidEventTap)
    postedDown = true
    usleep(35_000)
    up.post(tap: .cghidEventTap)
    postedDown = false
    usleep(80_000)
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
        info.value,
        info.help,
    ]
    .filter { !$0.isEmpty }
    .joined(separator: " ")
}

func neutralNodes(from elements: [ElementInfo]) -> [NeutralAXNode] {
    elements.enumerated().map { index, info in
        NeutralAXNode(
            id: String(index),
            parentId: info.parentIndex.map(String.init),
            role: info.role,
            title: info.title,
            description: info.description,
            value: info.value,
            help: info.help,
            elementFrame: info.elementFrame,
            enabled: info.enabled,
            hidden: info.hidden,
            selected: info.selected,
            depth: info.depth
        )
    }
}

func neutralNodeText(_ node: NeutralAXNode) -> String {
    [node.title, node.description, node.value, node.help]
        .filter { !$0.isEmpty }
        .joined(separator: " ")
}

// One immutable parent-aware query context per AX capture. It normalizes
// parent IDs and aggregates subtree text/sizes once, so candidate selectors
// never recurse through AX or re-walk text subtrees.
struct NeutralAXQuery {
    let nodes: [NeutralAXNode]
    let parents: [Int?]
    let descendantText: [String]
    let visibleDescendantText: [String]
    let subtreeSizes: [Int]
    let visible: [Bool]
    let descendantHasVisibleOpenPanel: [Bool]
    let descendantConfirmCounts: [Int]
    let descendantConfirmIndex: [Int?]
    let descendantCancelCounts: [Int]

    init(nodes: [NeutralAXNode]) {
        self.nodes = nodes
        var ids: [String: Int] = [:]
        for (index, node) in nodes.enumerated() where ids[node.id] == nil {
            ids[node.id] = index
        }
        let parents = nodes.map { $0.parentId.flatMap { ids[$0] } }
        var text = nodes.map(neutralNodeText)
        var windows = Array<Int?>(repeating: nil, count: nodes.count)
        var hiddenByAncestor = Array(repeating: false, count: nodes.count)
        var visible = Array(repeating: false, count: nodes.count)
        for index in nodes.indices.sorted(by: { left, right in
            nodes[left].depth == nodes[right].depth ? left < right : nodes[left].depth < nodes[right].depth
        }) {
            let parent = parents[index]
            let inheritedWindow = parent.flatMap { windows[$0] }
            windows[index] = nodes[index].role == (kAXWindowRole as String)
                ? index : inheritedWindow
            hiddenByAncestor[index] = nodes[index].hidden
                || (parent.map { hiddenByAncestor[$0] } ?? false)
            guard !hiddenByAncestor[index],
                  let frame = nodes[index].elementFrame,
                  !frame.isEmpty
            else { continue }
            let withinFramedParent = parent.map { parentIndex in
                guard let parentFrame = nodes[parentIndex].elementFrame,
                      !parentFrame.isEmpty
                else { return true }
                return visible[parentIndex] && parentFrame.intersects(frame)
            } ?? true
            guard let window = windows[index],
                  let windowFrame = nodes[window].elementFrame,
                  !windowFrame.isEmpty,
                  windowFrame.intersects(frame),
                  withinFramedParent
            else { continue }
            visible[index] = true
        }
        var visibleText = nodes.indices.map { visible[$0] ? neutralNodeText(nodes[$0]) : "" }
        var sizes = Array(repeating: 1, count: nodes.count)
        var openPanels = nodes.indices.map {
            visible[$0]
                && (nodes[$0].role == "AXOpenPanel" || nodes[$0].role == "AXFileChooser")
        }
        for index in nodes.indices.sorted(by: { left, right in
            nodes[left].depth == nodes[right].depth ? left > right : nodes[left].depth > nodes[right].depth
        }) {
            guard let parent = parents[index] else { continue }
            if !text[index].isEmpty {
                text[parent] = [text[parent], text[index]]
                    .filter { !$0.isEmpty }
                    .joined(separator: " ")
            }
            if !visibleText[index].isEmpty {
                visibleText[parent] = [visibleText[parent], visibleText[index]]
                    .filter { !$0.isEmpty }
                    .joined(separator: " ")
            }
            sizes[parent] += sizes[index]
            openPanels[parent] = openPanels[parent] || openPanels[index]
        }
        var confirmCounts = Array(repeating: 0, count: nodes.count)
        var confirmIndices = Array<Int?>(repeating: nil, count: nodes.count)
        var cancelCounts = Array(repeating: 0, count: nodes.count)
        // Attribute each visible confirmation button to only the framed
        // ancestors it actually intersects. This is a one-time button-to-
        // ancestor walk, avoiding selector-time descendant scans.
        for buttonIndex in nodes.indices {
            let button = nodes[buttonIndex]
            guard visible[buttonIndex],
                  button.role == (kAXButtonRole as String),
                  button.enabled,
                  let buttonFrame = button.elementFrame,
                  !buttonFrame.isEmpty
            else { continue }
            // Chromium nests a static text that repeats the label inside the
            // button, so descendant text reads "Confirm Confirm". Judge the
            // button by its own text first and fall back to descendants only
            // for an unlabeled button.
            let ownText = neutralNodeText(button)
            let buttonText = ownText.isEmpty ? visibleText[buttonIndex] : ownText
            let isConfirm = isFullAccessConfirmationButton(buttonText)
            let isCancel = normalized(buttonText) == "cancel"
            guard isConfirm || isCancel else { continue }
            var owner: Int? = buttonIndex
            while let ownerIndex = owner {
                if let ownerFrame = nodes[ownerIndex].elementFrame,
                   !ownerFrame.isEmpty,
                   ownerFrame.intersects(buttonFrame) {
                    if isConfirm {
                        confirmCounts[ownerIndex] += 1
                        confirmIndices[ownerIndex] = confirmCounts[ownerIndex] == 1
                            ? buttonIndex : nil
                    }
                    if isCancel {
                        cancelCounts[ownerIndex] += 1
                    }
                }
                owner = parents[ownerIndex]
            }
        }
        self.parents = parents
        descendantText = text
        visibleDescendantText = visibleText
        subtreeSizes = sizes
        self.visible = visible
        descendantHasVisibleOpenPanel = openPanels
        descendantConfirmCounts = confirmCounts
        descendantConfirmIndex = confirmIndices
        descendantCancelCounts = cancelCounts
    }

    func isDescendant(_ candidate: Int, of owner: Int) -> Bool {
        var parent = parents[candidate]
        while let current = parent {
            if current == owner { return true }
            parent = parents[current]
        }
        return false
    }

    func ownerIsVisible(_ index: Int) -> Bool {
        visible[index]
    }
}

final class SinglePassCapture<Input> {
    private var didCapture = false

    func capture(_ source: () -> Input) -> Input? {
        guard !didCapture else { return nil }
        didCapture = true
        return source()
    }
}

func singlePassQuery<Input, Output>(
    poll: SinglePassCapture<Input>,
    capture: () -> Input,
    query: (Input) -> Output
) -> Output? {
    poll.capture(capture).map(query)
}

func uniqueComposerIndex(in query: NeutralAXQuery) -> Int? {
    let candidates = query.nodes.indices.filter { index in
        let node = query.nodes[index]
        guard
            node.role == (kAXTextAreaRole as String),
            node.enabled,
            query.ownerIsVisible(index),
            let elementFrame = node.elementFrame
        else { return false }
        return elementFrame.width >= 240
            && elementFrame.height >= 16
            && !elementFrame.isEmpty
    }
    // An unfocused composer can collapse to one 19px line. Identify it by
    // the adjacent model/effort selector instead of requiring editing focus.
    // This also distinguishes inline answer fields elsewhere in the task.
    let paired = candidates.filter { index in
        let region = composerControlRegion(query.nodes[index].elementFrame!)
        return query.nodes.indices.filter { control in
            let node = query.nodes[control]
            return node.role == (kAXPopUpButtonRole as String)
                && node.enabled && query.ownerIsVisible(control)
                && node.elementFrame.map { region.intersects($0) } == true
                && parsePickerTitle(node.title) != nil
        }.count == 1
    }
    if !paired.isEmpty { return paired.count == 1 ? paired[0] : nil }
    let expanded = candidates.filter { (query.nodes[$0].elementFrame?.height ?? 0) >= 36 }
    return expanded.count == 1 ? expanded[0] : nil
}

func composerControlRegion(_ composerFrame: CGRect) -> CGRect {
    CGRect(x: composerFrame.minX - 24, y: composerFrame.minY - 24,
           width: composerFrame.width + 48, height: composerFrame.height + 112)
}

func controlIndex(
    inComposerRegion composerIndex: Int,
    query: NeutralAXQuery,
    roles: Set<String>,
    predicate: (String) -> Bool
) -> Int? {
    guard query.ownerIsVisible(composerIndex),
          let composerFrame = query.nodes[composerIndex].elementFrame else {
        return nil
    }
    let region = composerControlRegion(composerFrame)
    let matches = query.nodes.indices.filter { index in
        let node = query.nodes[index]
        guard
            roles.contains(node.role),
            node.enabled,
            query.ownerIsVisible(index),
            let elementFrame = node.elementFrame,
            !elementFrame.isEmpty,
            region.intersects(elementFrame)
        else { return false }
        return predicate(query.descendantText[index])
    }
    return matches.count == 1 ? matches[0] : nil
}

func permissionControlIndex(
    composerIndex: Int,
    query: NeutralAXQuery
) -> Int? {
    controlIndex(
        inComposerRegion: composerIndex,
        query: query,
        roles: Set([
            kAXButtonRole as String,
            kAXPopUpButtonRole as String,
        ])
    ) { approvalMode(from: $0) != nil }
}

func fullAccessConfirmationButtonIndex(
    in query: NeutralAXQuery
) -> Int? {
    let containerRoles = Set([
        "AXDialog",
        "AXGroup",
        kAXSheetRole as String,
        kAXWindowRole as String,
    ])
    let candidates = query.nodes.indices.compactMap {
        ownerIndex -> (ownerIndex: Int, buttonIndex: Int, size: Int)? in
        guard containerRoles.contains(query.nodes[ownerIndex].role),
              query.ownerIsVisible(ownerIndex) else {
            return nil
        }
        let ownerText = normalized(query.visibleDescendantText[ownerIndex])
        guard ownerText.contains("turnonfullaccess")
            || ownerText.contains("fullaccess")
        else { return nil }
        guard query.descendantConfirmCounts[ownerIndex] == 1,
              query.descendantCancelCounts[ownerIndex] == 1,
              let confirm = query.descendantConfirmIndex[ownerIndex]
        else { return nil }
        return (ownerIndex, confirm, query.subtreeSizes[ownerIndex])
    }
    guard let smallest = candidates.map(\.size).min() else { return nil }
    let mostSpecific = candidates.filter { $0.size == smallest }
    guard mostSpecific.count == 1,
          candidates.allSatisfy({ candidate in
              candidate.ownerIndex == mostSpecific[0].ownerIndex
                  || query.isDescendant(
                      mostSpecific[0].ownerIndex,
                      of: candidate.ownerIndex
                  )
          })
    else { return nil }
    return mostSpecific[0].buttonIndex
}

func ultraContinueButtonIndex(in query: NeutralAXQuery) -> Int? {
    let ownerRoles = Set([
        "AXDialog",
        "AXGroup",
        kAXSheetRole as String,
        kAXWindowRole as String,
    ])
    let candidates = query.nodes.indices.compactMap {
        ownerIndex -> (size: Int, buttonIndex: Int)? in
        guard
            ownerRoles.contains(query.nodes[ownerIndex].role),
            query.ownerIsVisible(ownerIndex),
            let ownerFrame = query.nodes[ownerIndex].elementFrame,
            normalized(query.visibleDescendantText[ownerIndex])
                .contains("useultrawithfullaccess")
        else { return nil }
        let buttons = query.nodes.indices.filter { index in
            query.nodes[index].role == (kAXButtonRole as String)
                && query.nodes[index].enabled
                && query.ownerIsVisible(index)
                && (query.isDescendant(index, of: ownerIndex)
                    || query.nodes[index].elementFrame.map {
                        ownerFrame.contains(
                            CGPoint(x: $0.midX, y: $0.midY)
                        )
                    } == true)
        }
        func ownLabel(_ index: Int) -> String {
            let own = neutralNodeText(query.nodes[index])
            return normalized(own.isEmpty ? query.visibleDescendantText[index] : own)
        }
        let continueButtons = buttons.filter { ownLabel($0) == "continue" }
        let fullAccessButtons = buttons.filter { ownLabel($0) == "usefullaccess" }
        guard continueButtons.count == 1, fullAccessButtons.count == 1
        else { return nil }
        return (query.subtreeSizes[ownerIndex], continueButtons[0])
    }
    if let minimum = candidates.map(\.size).min() {
        let smallest = candidates.filter { $0.size == minimum }
        if smallest.count == 1 { return smallest[0].buttonIndex }
    }

    // Chromium currently exposes this native-looking confirmation's buttons
    // as spatial siblings instead of AX descendants of the dialog text. Bind
    // only the unique, adjacent button pair; any ambiguity remains fail-closed.
    let visibleButtons = query.nodes.indices.filter { index in
        query.nodes[index].role == (kAXButtonRole as String)
            && query.nodes[index].enabled
            && !query.nodes[index].hidden
            && query.nodes[index].elementFrame != nil
    }
    let continueButtons = visibleButtons.filter {
        normalized(neutralNodeText(query.nodes[$0])) == "continue"
    }
    let fullAccessButtons = visibleButtons.filter {
        normalized(neutralNodeText(query.nodes[$0])) == "usefullaccess"
    }
    guard continueButtons.count == 1, fullAccessButtons.count == 1,
          let continueFrame = query.nodes[continueButtons[0]].elementFrame,
          let fullAccessFrame = query.nodes[fullAccessButtons[0]].elementFrame,
          continueFrame.midX > fullAccessFrame.midX,
          abs(continueFrame.midY - fullAccessFrame.midY) <= 80,
          continueFrame.minX - fullAccessFrame.maxX <= 160
    else { return nil }
    return continueButtons[0]
}

func ultraContinueButton(in snapshot: AXSnapshot) -> ElementInfo? {
    ultraContinueButtonIndex(in: snapshot.query).map {
        snapshot.elements[$0]
    }
}

func addProjectOwnerIndices(in query: NeutralAXQuery) -> [Int] {
    let candidates = query.nodes.indices.compactMap {
        index -> (index: Int, size: Int)? in
        let node = query.nodes[index]
        guard node.role == (kAXSheetRole as String)
            || node.role == "AXDialog"
            || node.role == (kAXWindowRole as String),
              query.ownerIsVisible(index)
        else { return nil }
        let hasOpenPanel = query.descendantHasVisibleOpenPanel[index]
        if node.role == (kAXWindowRole as String) {
            let ownText = normalized(neutralNodeText(node))
            guard ownText.contains("addnewproject")
                || ownText.contains("newproject")
                || ownText.contains("openfolder")
            else { return nil }
        }
        guard isAddProjectPickerPresentation(
            node.role,
            query.visibleDescendantText[index],
            hasOpenPanel: hasOpenPanel
        ) else { return nil }
        return (index, query.subtreeSizes[index])
    }
    guard let smallest = candidates.map(\.size).min() else { return [] }
    let mostSpecific = candidates.filter { $0.size == smallest }
    guard mostSpecific.count == 1,
          candidates.allSatisfy({ candidate in
              candidate.index == mostSpecific[0].index
                  || query.isDescendant(mostSpecific[0].index, of: candidate.index)
          })
    else { return [] }
    return [mostSpecific[0].index]
}

func modeTransitionObserved(
    mode: String,
    draftEmpty: Bool,
    before: Bool,
    requested: Bool,
    observed: Bool
) -> Bool {
    guard draftEmpty, requested == !before else { return false }
    if mode == "plan" {
        return observed == requested
    }
    return mode == "fast" && observed != before
}

func pickerSelectionConfirmed(
    categoryPrefix: String,
    targetLabel: String,
    model: String?,
    effort: String?
) -> Bool {
    if categoryPrefix == "Model " {
        return normalized(model ?? "").contains(normalized(targetLabel))
    }
    if categoryPrefix == "Effort " {
        return normalized(effort ?? "") == normalized(targetLabel)
    }
    return false
}

func waitForPickerSelection(
    categoryPrefix: String,
    targetLabel: String,
    timeout: TimeInterval = 4.0,
    interval: useconds_t = 120_000,
    readState: () -> (String?, String?)?
) -> (String?, String?)? {
    let deadline = Date().addingTimeInterval(timeout)
    repeat {
        if let state = readState(),
           pickerSelectionConfirmed(
               categoryPrefix: categoryPrefix,
               targetLabel: targetLabel,
               model: state.0,
               effort: state.1
           ) {
            return state
        }
        usleep(interval)
    } while Date() < deadline
    return nil
}

func waitForFastState(
    timeout: TimeInterval = 1.5,
    interval: useconds_t = 80_000,
    readState: () -> Bool?
) -> Bool? {
    let deadline = Date().addingTimeInterval(timeout)
    repeat {
        if let state = readState() { return state }
        usleep(interval)
    } while Date() < deadline
    return nil
}

struct WorkspaceShortcutSpec {
    let label: String
    let key: CGKeyCode
    let flags: CGEventFlags
}

func workspaceShortcut(_ payload: String) -> WorkspaceShortcutSpec? {
    switch payload {
    case "review-panel":
        return WorkspaceShortcutSpec(
            label: "Review",
            key: 5,
            flags: [.maskControl, .maskShift]
        )
    case "browser":
        return WorkspaceShortcutSpec(
            label: "Browser",
            key: 17,
            flags: .maskCommand
        )
    case "files":
        return WorkspaceShortcutSpec(
            label: "Files",
            key: 35,
            flags: .maskCommand
        )
    case "side-chat":
        return WorkspaceShortcutSpec(
            label: "Side chat",
            key: 1,
            flags: [.maskCommand, .maskAlternate]
        )
    default:
        return nil
    }
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

func isVisiblePendingApprovalLabel(
    _ value: String,
    hasFrame: Bool,
    hidden: Bool,
    intersectsWindow: Bool
) -> Bool {
    isAwaitingApprovalState(value)
        && hasFrame
        && !hidden
        && intersectsWindow
}
