import AppKit
import ApplicationServices
import Darwin
import Foundation

struct ControlResult: Codable {
    let ok: Bool
    let action: String
    let requested: String?
    let model: String?
    let effort: String?
    var mode: String? = nil
    var active: Bool? = nil
    var approvalMode: String? = nil
    var pendingInput: Bool? = nil
    var inputKind: String? = nil
    var inputTitle: String? = nil
    var conversationId: String? = nil
    var rendererWindowId: String? = nil
    var witnessToken: String? = nil
    var reasonCode: String? = nil
    let message: String
}

struct ElementInfo {
    let element: AXUIElement
    let role: String
    let title: String
    let description: String
    let value: String
    let help: String
    let elementFrame: CGRect?
    let enabled: Bool
    let hidden: Bool
    let selected: Bool
    let parentIndex: Int?
    let depth: Int
}

struct AXSnapshot {
    let elements: [ElementInfo]
    let query: NeutralAXQuery
}

struct NeutralAXNode {
    let id: String
    let parentId: String?
    let role: String
    let title: String
    let description: String
    let value: String
    let help: String
    let elementFrame: CGRect?
    let enabled: Bool
    let hidden: Bool
    let selected: Bool
    let depth: Int
}

enum TransactionPhase: String, CaseIterable {
    case preflight
    case operation
    case postflight
}

struct TargetTransactionState {
    private(set) var phases: [TransactionPhase] = []

    mutating func record(_ phase: TransactionPhase) -> Bool {
        guard phases.count < 3, phases.count == TransactionPhase.allCases.firstIndex(of: phase) else {
            return false
        }
        phases.append(phase)
        return true
    }

    var complete: Bool {
        phases == [.preflight, .operation, .postflight]
    }
}

struct DesktopWitness: Equatable, Codable {
    let conversationId: String
    let rendererWindowId: String
    let path: String
    let cursor: UInt64
    let fileIdentity: String
    let observedAt: TimeInterval
    let fileModifiedAt: TimeInterval
    let baselines: [String: DesktopLogSnapshot]

    init(
        conversationId: String,
        rendererWindowId: String,
        path: String,
        cursor: UInt64,
        fileIdentity: String,
        observedAt: TimeInterval = 0,
        fileModifiedAt: TimeInterval = 0,
        baselines: [String: DesktopLogSnapshot] = [:]
    ) {
        self.conversationId = conversationId
        self.rendererWindowId = rendererWindowId
        self.path = path
        self.cursor = cursor
        self.fileIdentity = fileIdentity
        self.observedAt = observedAt
        self.fileModifiedAt = fileModifiedAt
        self.baselines = baselines
    }
}

struct DesktopLogSnapshot: Equatable, Codable {
    let size: UInt64
    let identity: String
    let modifiedAt: TimeInterval
}

struct DatabaseProvenance: Equatable {
    let identity: String
    let creationDate: Date?
}

struct DesktopLogCursor {
    let snapshots: [String: DesktopLogSnapshot]
}

struct TargetContext {
    let window: AXUIElement
    let witness: DesktopWitness
}

struct TargetTransaction {
    let context: TargetContext
    let window: AXUIElement
    let snapshot: AXSnapshot
    var state: TargetTransactionState
}

struct WorkflowRequest: Codable {
    let prompt: String
    let cwd: String
    let databasePath: String
    let sourceThreadId: String
}

struct RouteRequest: Codable {
    let route: String
    let path: String?
    let databasePath: String?
}

struct WorkflowProofState: Codable {
    let uniqueFreshWitness: Bool
    let taskIdWasNew: Bool
    let databaseIdentityStable: Bool
    let canonicalCwdMatches: Bool
    let focusedWindowStable: Bool
    let uniqueComposer: Bool
    let draftMatches: Bool
}

struct DispatchFixtureState: Codable {
    let markerBefore: Int?
    let markerAfter: Int?
    let sameComposer: Bool?
    let draftIsEmpty: Bool?
    let messagesBefore: Int?
    let messagesAfter: Int?
    let pendingRemains: Bool?
    let sidebarBefore: Bool?
    let sidebarAfter: Bool?
}

struct LogFixtureRequest: Codable {
    let path: String
    let threadId: String
    let existingThreadIds: [String]
}

struct MultiLogFixtureRequest: Codable {
    let paths: [String]
    let threadId: String
    let baselineOffsets: [String: UInt64]?
    let baselineIdentityOverrides: [String: String]?
    let expectedRendererWindowId: String?
}

func validatedWorkflowProof(_ state: WorkflowProofState) -> Bool {
    state.uniqueFreshWitness
        && state.taskIdWasNew
        && state.databaseIdentityStable
        && state.canonicalCwdMatches
        && state.focusedWindowStable
        && state.uniqueComposer
        && state.draftMatches
}

struct NeutralTargetState {
    let freshWitness: DesktopWitness?
    let currentWitness: DesktopWitness?
    let boundedLogRead: Bool
    let fileIdentityMatches: Bool
    let historyContinuous: Bool
    let tokenRoundTrips: Bool
    let frontmost: Bool
    let allWindowIds: [String]
    let focusedWindowIds: [String]
    let capturedWindowId: String
    let composerCount: Int
}

enum ControlError: LocalizedError {
    case failed(String, String = "UNKNOWN")

    var errorDescription: String? {
        switch self {
        case .failed(let message, _): return message
        }
    }

    var reasonCode: String {
        switch self {
        case .failed(_, let code): return code
        }
    }
}

func decodeNativePayload<T: Decodable>(_ value: String, as type: T.Type) -> T? {
    guard let data = Data(base64Encoded: value, options: []) else { return nil }
    return try? JSONDecoder().decode(type, from: data)
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
        if depth < maximumDepth {
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
            let buttonText = visibleText[buttonIndex]
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
            && elementFrame.height >= 36
            && !elementFrame.isEmpty
    }
    return candidates.count == 1 ? candidates[0] : nil
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
    let region = CGRect(
        x: composerFrame.minX - 24,
        y: composerFrame.minY - 24,
        width: composerFrame.width + 48,
        height: composerFrame.height + 112
    )
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

func desktopLogFiles() -> [String] {
    let root = URL(fileURLWithPath: NSHomeDirectory())
        .appendingPathComponent("Library/Logs/com.openai.codex")
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy/MM/dd"
    let manager = FileManager.default
    return [Date(), Date(timeIntervalSinceNow: -86_400)].flatMap { date in
        let directory = root.appendingPathComponent(formatter.string(from: date))
        return (try? manager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey]
        )) ?? []
    }
    .filter { $0.pathExtension == "log" }
    .sorted {
        let left = try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
        let right = try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
        return (left ?? .distantPast) > (right ?? .distantPast)
    }
    .prefix(8).map {
        $0.standardized.resolvingSymlinksInPath().path
    }
}

func desktopLogCursor() -> DesktopLogCursor {
    var snapshots: [String: DesktopLogSnapshot] = [:]
    for path in desktopLogFiles() {
        if let snapshot = logSnapshot(path) { snapshots[path] = snapshot }
    }
    return DesktopLogCursor(snapshots: snapshots)
}

func codexLogRoot() -> String {
    URL(fileURLWithPath: NSHomeDirectory())
        .appendingPathComponent("Library/Logs/com.openai.codex")
        .standardized
        .resolvingSymlinksInPath()
        .path
}

func logSnapshot(_ path: String) -> DesktopLogSnapshot? {
    guard path.hasPrefix(codexLogRoot() + "/") else { return nil }
    return unscopedLogSnapshot(path)
}

func unscopedLogSnapshot(_ path: String) -> DesktopLogSnapshot? {
    guard
          let attributes = try? FileManager.default.attributesOfItem(atPath: path),
          let size = (attributes[.size] as? NSNumber)?.uint64Value,
          let modified = attributes[.modificationDate] as? Date,
          let identifier = fileIdentity(path)
    else { return nil }
    return DesktopLogSnapshot(size: size, identity: identifier, modifiedAt: modified.timeIntervalSince1970)
}

func fileIdentity(_ path: String) -> String? {
    guard let resource = try? URL(fileURLWithPath: path).resourceValues(
        forKeys: [.fileResourceIdentifierKey]
    ), let identifier = resource.fileResourceIdentifier else {
        return nil
    }
    return String(describing: identifier)
}

func databaseProvenance(_ path: String) -> DatabaseProvenance? {
    guard let identity = fileIdentity(path),
          let values = try? URL(fileURLWithPath: path).resourceValues(
              forKeys: [.creationDateKey]
          )
    else { return nil }
    return DatabaseProvenance(identity: identity, creationDate: values.creationDate)
}

func witness(in text: String) -> DesktopWitness? {
    for line in text.split(separator: "\n").reversed() {
        let value = String(line)
        guard value.contains("thread_stream_view_activity_changed"),
              value.contains("active=true"),
              value.contains("rendererWindowAppearance=primary"),
              value.contains("rendererWindowFocused=true")
        else { continue }
        let fields = Dictionary(uniqueKeysWithValues: value.split(separator: " ").compactMap { field -> (String, String)? in
            let pair = field.split(separator: "=", maxSplits: 1).map(String.init)
            return pair.count == 2 ? (pair[0], pair[1]) : nil
        })
        if let conversationId = fields["conversationId"], let rendererWindowId = fields["rendererWindowId"], !rendererWindowId.isEmpty {
            return DesktopWitness(
                conversationId: conversationId,
                rendererWindowId: rendererWindowId,
                path: "",
                cursor: 0,
                fileIdentity: ""
            )
        }
    }
    return nil
}

func witnesses(in text: String) -> [DesktopWitness] {
    text.split(separator: "\n").compactMap { line in
        witness(in: String(line))
    }
}

func latestWitness(in data: Data) -> DesktopWitness? {
    guard let text = String(data: data, encoding: .utf8) else { return nil }
    return witnesses(in: text).last
}

// Eight logs at this cap remain within the 128 MiB observer read budget.
let maximumWitnessReadBytes: UInt64 = 16 * 1024 * 1024

func witnessTimestamp(_ line: String, fallback: TimeInterval) -> TimeInterval {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let first = line.split(separator: " ").first.map(String.init)
    let field = line.split(separator: " ").first(where: { $0.hasPrefix("timestamp=") })
        .map { String($0.dropFirst("timestamp=".count)) }
    return [first, field].compactMap { value in
        value.flatMap { formatter.date(from: $0)?.timeIntervalSince1970 }
    }.first ?? fallback
}

func witnessEvents(path: String, snapshot: DesktopLogSnapshot, from offset: UInt64) -> [DesktopWitness]? {
    let initialSnapshot = snapshot
    guard initialSnapshot.size >= offset, initialSnapshot.size - offset <= maximumWitnessReadBytes,
          let handle = FileHandle(forReadingAtPath: path)
    else { return nil }
    defer { try? handle.close() }
    guard let byteLength = Int(exactly: initialSnapshot.size - offset),
          byteLength > 0
    else { return [] }
    do {
        try handle.seek(toOffset: offset)
        guard let data = try handle.read(upToCount: byteLength),
              data.count == byteLength,
              let completedSnapshot = unscopedLogSnapshot(path),
              completedSnapshot.identity == initialSnapshot.identity,
              completedSnapshot.size >= initialSnapshot.size,
              let text = String(data: data, encoding: .utf8)
        else { return nil }
        var byteCursor = offset
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false)
        return lines.enumerated().compactMap { index, line in
            let lineText = String(line)
            let separatorBytes = index < lines.count - 1 || data.last == 10 ? 1 : 0
            let end = byteCursor + UInt64(lineText.lengthOfBytes(using: .utf8) + separatorBytes)
            defer { byteCursor = end }
            guard var event = witness(in: lineText) else { return nil }
            event = DesktopWitness(
                conversationId: event.conversationId,
                rendererWindowId: event.rendererWindowId,
                path: path,
                cursor: end,
                fileIdentity: initialSnapshot.identity,
                observedAt: witnessTimestamp(lineText, fallback: initialSnapshot.modifiedAt),
                fileModifiedAt: initialSnapshot.modifiedAt
            )
            return event
        }
    } catch { return nil }
}

func globalNewestWitness(_ events: [DesktopWitness]) -> DesktopWitness? {
    guard let newest = events.max(by: { left, right in
        left.observedAt == right.observedAt
            ? left.fileModifiedAt < right.fileModifiedAt
            : left.observedAt < right.observedAt
    }) else { return nil }
    let tied = events.filter {
        $0.observedAt == newest.observedAt && $0.fileModifiedAt == newest.fileModifiedAt
    }
    guard Set(tied.map(\.fileIdentity)).count == 1 else {
        // Enumeration order is not authority.  A cross-file tie is unsafe.
        return nil
    }
    return tied.max(by: { $0.cursor < $1.cursor })
}

func currentLogSnapshots(_ paths: [String], scoped: Bool) -> [String: DesktopLogSnapshot]? {
    var snapshots: [String: DesktopLogSnapshot] = [:]
    for path in paths {
        guard let snapshot = scoped ? logSnapshot(path) : unscopedLogSnapshot(path) else { return nil }
        snapshots[path] = snapshot
    }
    return snapshots
}

func currentWitness(in paths: [String], threadId: String, scoped: Bool = false) -> DesktopWitness? {
    guard let snapshots = currentLogSnapshots(paths, scoped: scoped) else { return nil }
    var events: [DesktopWitness] = []
    for path in paths {
        guard let snapshot = snapshots[path] else { return nil }
        // Reading only the bounded tail deliberately fails closed when a
        // current event cannot be observed within the global 128 MiB budget.
        let start = snapshot.size > maximumWitnessReadBytes
            ? snapshot.size - maximumWitnessReadBytes : 0
        guard let fileEvents = witnessEvents(path: path, snapshot: snapshot, from: start) else { return nil }
        events.append(contentsOf: fileEvents)
    }
    guard let witness = globalNewestWitness(events), witness.conversationId == threadId else { return nil }
    return DesktopWitness(
        conversationId: witness.conversationId,
        rendererWindowId: witness.rendererWindowId,
        path: witness.path,
        cursor: witness.cursor,
        fileIdentity: witness.fileIdentity,
        observedAt: witness.observedAt,
        fileModifiedAt: witness.fileModifiedAt,
        baselines: snapshots
    )
}

func freshWitnessEvents(paths: [String], after cursor: DesktopLogCursor, scoped: Bool) -> (events: [DesktopWitness], snapshots: [String: DesktopLogSnapshot])? {
    guard let snapshots = currentLogSnapshots(paths, scoped: scoped),
          Set(cursor.snapshots.keys).isSubset(of: Set(paths))
    else { return nil }
    var events: [DesktopWitness] = []
    for path in paths {
        guard let current = snapshots[path] else { return nil }
        let previous = cursor.snapshots[path]
        if let previous {
            guard previous.identity == current.identity, current.size >= previous.size else { return nil }
        }
        let offset = previous?.size ?? 0
        guard let fileEvents = witnessEvents(path: path, snapshot: current, from: offset) else { return nil }
        events.append(contentsOf: fileEvents)
    }
    return (events, snapshots)
}

func freshWitness(threadId: String, after cursor: DesktopLogCursor) -> DesktopWitness? {
    let paths = desktopLogFiles()
    guard let collected = freshWitnessEvents(paths: paths, after: cursor, scoped: true),
          let witness = globalNewestWitness(collected.events),
          witness.conversationId == threadId
    else { return nil }
    return DesktopWitness(
        conversationId: witness.conversationId,
        rendererWindowId: witness.rendererWindowId,
        path: witness.path,
        cursor: witness.cursor,
        fileIdentity: witness.fileIdentity,
        observedAt: witness.observedAt,
        fileModifiedAt: witness.fileModifiedAt,
        baselines: collected.snapshots
    )
}

func currentWitness(threadId: String) -> DesktopWitness? {
    currentWitness(in: desktopLogFiles(), threadId: threadId, scoped: true)
}

func freshNewWitness(
    after cursor: DesktopLogCursor,
    excluding existingThreadIds: Set<String>
) -> DesktopWitness? {
    let paths = desktopLogFiles()
    guard let collected = freshWitnessEvents(paths: paths, after: cursor, scoped: true),
          collected.events.count == 1,
          let witness = collected.events.first,
          !existingThreadIds.contains(witness.conversationId)
    else { return nil }
    return DesktopWitness(
        conversationId: witness.conversationId,
        rendererWindowId: witness.rendererWindowId,
        path: witness.path,
        cursor: witness.cursor,
        fileIdentity: witness.fileIdentity,
        observedAt: witness.observedAt,
        fileModifiedAt: witness.fileModifiedAt,
        baselines: collected.snapshots
    )
}

func terminateAndReap(_ process: Process, grace: TimeInterval = 0.2) -> Bool {
    guard process.isRunning else { return true }
    process.terminate()
    let gracefulDeadline = Date().addingTimeInterval(grace)
    while process.isRunning && Date() < gracefulDeadline {
        RunLoop.current.run(until: Date().addingTimeInterval(0.01))
    }
    if process.isRunning {
        Darwin.kill(process.processIdentifier, SIGKILL)
        let killDeadline = Date().addingTimeInterval(grace)
        while process.isRunning && Date() < killDeadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.01))
        }
    }
    return !process.isRunning
}

func isRegularCanonicalSQLiteDatabase(_ databasePath: String) -> Bool {
    let canonicalDatabasePath = canonicalPath(databasePath)
    return canonicalDatabasePath == databasePath
        && databasePath.hasSuffix(".sqlite")
        && ((try? FileManager.default.attributesOfItem(atPath: databasePath)[.type]) as? FileAttributeType) == .typeRegular
}

enum SQLiteQueryResult {
    case success([String])
    case failure
}

enum SQLiteRowResult {
    case success(String?)
    case failure
}

func sqliteLines(_ databasePath: String, _ sql: String) -> SQLiteQueryResult {
    guard isRegularCanonicalSQLiteDatabase(databasePath)
    else { return .failure }
    let process = Process()
    let output = Pipe()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/sqlite3")
    process.arguments = ["-readonly", "-noheader", databasePath, sql]
    process.standardOutput = output
    process.standardError = FileHandle.nullDevice
    do { try process.run() } catch { return .failure }
    let deadline = Date().addingTimeInterval(1.0)
    while process.isRunning && Date() < deadline {
        RunLoop.current.run(until: Date().addingTimeInterval(0.02))
    }
    if process.isRunning {
        _ = terminateAndReap(process)
        return .failure
    }
    guard process.terminationStatus == 0,
          let text = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)
    else { return .failure }
    return .success(text.split(separator: "\n").map(String.init))
}

func sqliteThreadIds(_ databasePath: String) -> Set<String>? {
    guard case .success(let lines) = sqliteLines(databasePath, "SELECT id FROM threads;") else {
        return nil
    }
    return Set(lines)
}

func sqliteThreadCwd(_ databasePath: String, _ threadId: String) -> SQLiteRowResult {
    guard threadId.range(of: "^[0-9A-Fa-f-]{16,64}$", options: .regularExpression) != nil else {
        return .failure
    }
    guard case .success(let lines) = sqliteLines(
        databasePath,
        "SELECT cwd FROM threads WHERE id = '\(threadId)';"
    ) else { return .failure }
    return .success(lines.first)
}

func sqliteThreadCwdValue(_ databasePath: String, _ threadId: String) -> String? {
    guard case .success(let cwd) = sqliteThreadCwd(databasePath, threadId) else {
        return nil
    }
    return cwd
}

func canonicalPath(_ path: String) -> String {
    var buffer = [CChar](repeating: 0, count: Int(PATH_MAX))
    guard Darwin.realpath(path, &buffer) != nil else {
        return URL(fileURLWithPath: path).standardized.resolvingSymlinksInPath().path
    }
    return String(cString: buffer)
}

func hasCurrentWitness(_ expected: DesktopWitness) -> Bool {
    guard desktopLogFiles().contains(expected.path) else { return false }
    let paths = desktopLogFiles()
    guard !expected.baselines.isEmpty,
          let current = currentWitness(in: paths, threadId: expected.conversationId, scoped: true),
          current.rendererWindowId == expected.rendererWindowId,
          let appended = freshWitnessEvents(
              paths: paths,
              after: DesktopLogCursor(snapshots: expected.baselines),
              scoped: true
          )
    else { return false }
    // An expected → other → expected sequence is still a lost target.  Every
    // observed focus event since capture must remain the exact task/window.
    return witnessHistoryMatches(expected, appended.events)
}

func logSnapshotMatches(_ expected: DesktopWitness, _ current: DesktopLogSnapshot) -> Bool {
    expected.fileIdentity == current.identity && current.size >= expected.cursor
}

func witnessHistoryMatches(_ expected: DesktopWitness, _ events: [DesktopWitness]) -> Bool {
    events.allSatisfy {
        $0.conversationId == expected.conversationId
            && $0.rendererWindowId == expected.rendererWindowId
    }
}

func encodeWitnessToken(_ witness: DesktopWitness) throws -> String {
    try JSONEncoder().encode(witness).base64EncodedString()
}

func decodeWitnessToken(_ token: String) throws -> DesktopWitness {
    guard let data = Data(base64Encoded: token) else {
        throw ControlError.failed("Malformed exact-target witness token.")
    }
    let witness = try JSONDecoder().decode(DesktopWitness.self, from: data)
    let canonicalPath = URL(fileURLWithPath: witness.path)
        .standardized
        .resolvingSymlinksInPath()
        .path
    guard canonicalPath.hasPrefix(codexLogRoot() + "/"),
          canonicalPath == witness.path,
          !witness.fileIdentity.isEmpty else {
        throw ControlError.failed("Witness token has an invalid log provenance.")
    }
    return witness
}

func isCodexFrontmost(_ app: NSRunningApplication) -> Bool {
    NSWorkspace.shared.frontmostApplication?.bundleIdentifier == app.bundleIdentifier
}

func uniqueFocusedCodexWindow(_ appElement: AXUIElement) throws -> AXUIElement {
    guard
        let focusedWindowValue = attribute(
            appElement,
            kAXFocusedWindowAttribute as CFString
        ),
        CFGetTypeID(focusedWindowValue) == AXUIElementGetTypeID()
    else {
        throw ControlError.failed("Codex has no unique focused accessibility window.")
    }
    let focusedWindow = focusedWindowValue as! AXUIElement
    let windows =
        attribute(
            appElement,
            kAXWindowsAttribute as CFString
        ) as? [AXUIElement] ?? []
    guard windows.contains(where: { sameElement($0, focusedWindow) }) else {
        throw ControlError.failed(
            "Codex's focused accessibility window is not one of its current windows."
        )
    }
    return focusedWindow
}

func focusedCodexWindow(
    _ app: NSRunningApplication,
    appElement: AXUIElement,
    activate: Bool
) throws -> AXUIElement {
    if activate && !isCodexFrontmost(app) {
        guard app.activate() else {
            throw ControlError.failed(
                "Could not bring Codex to the foreground.",
                "NO_FOCUS"
            )
        }
        guard waitUntil(timeout: 2.0, operation: {
            isCodexFrontmost(app) ? true : nil
        }) != nil else {
            throw ControlError.failed(
                "Codex did not become the frontmost app.",
                "NO_FOCUS"
            )
        }
    }
    guard isCodexFrontmost(app) else {
        throw ControlError.failed(
            "Codex is not frontmost.",
            "NO_FOCUS"
        )
    }
    return try uniqueFocusedCodexWindow(appElement)
}

func sameElement(_ left: AXUIElement, _ right: AXUIElement) -> Bool {
    CFEqual(left, right)
}

// Kept pure so deterministic native fixtures exercise the same fail-closed
// decision that guards the live AX operation.
func validatedTargetWindow(
    _ state: NeutralTargetState,
    requestedThreadId: String,
    requestedRendererWindowId: String
) -> String? {
    guard state.boundedLogRead,
          state.fileIdentityMatches,
          state.historyContinuous,
          state.tokenRoundTrips,
          state.frontmost,
          state.composerCount == 1,
          let fresh = state.freshWitness,
          fresh.conversationId == requestedThreadId,
          fresh.rendererWindowId == requestedRendererWindowId,
          let current = state.currentWitness,
          current.conversationId == requestedThreadId,
          current.rendererWindowId == requestedRendererWindowId,
          state.allWindowIds.contains(state.capturedWindowId),
          state.focusedWindowIds.count == 1,
          state.focusedWindowIds[0] == state.capturedWindowId
    else { return nil }
    return state.capturedWindowId
}

func verifyTarget(
    _ app: NSRunningApplication,
    appElement: AXUIElement,
    witness expected: DesktopWitness,
    window expectedWindow: AXUIElement? = nil,
    composerElements: [ElementInfo]? = nil
) throws -> AXUIElement {
    let frontmost = isCodexFrontmost(app)
    guard frontmost else {
        throw ControlError.failed("Codex is not frontmost; refusing to mutate a background task.", "NO_FOCUS")
    }
    let witnessMatches = hasCurrentWitness(expected)
    guard witnessMatches else {
        throw ControlError.failed("The focused Codex task/window witness changed before mutation.", "TARGET_MISMATCH")
    }
    let window = try uniqueFocusedCodexWindow(appElement)
    let sameFocusedWindow = expectedWindow.map { sameElement(window, $0) } ?? true
    if !sameFocusedWindow {
        throw ControlError.failed("The focused Codex accessibility window changed before mutation.", "TARGET_MISMATCH")
    }
    let windowId = sameFocusedWindow ? "captured" : "changed"
    let neutral = NeutralTargetState(
        freshWitness: expected,
        currentWitness: witnessMatches ? expected : nil,
        boundedLogRead: true,
        fileIdentityMatches: true,
        historyContinuous: witnessMatches,
        tokenRoundTrips: true,
        frontmost: frontmost,
        allWindowIds: ["captured"],
        focusedWindowIds: [windowId],
        capturedWindowId: "captured",
        composerCount: composerElements.map { composerCandidates(in: $0).count }
            ?? composerCandidates(in: window).count
    )
    guard validatedTargetWindow(
        neutral,
        requestedThreadId: expected.conversationId,
        requestedRendererWindowId: expected.rendererWindowId
    ) != nil else {
        throw ControlError.failed("The exact focused target could not be proved.", "TARGET_MISMATCH")
    }
    return window
}

func verifyCurrentTarget(
    _ app: NSRunningApplication,
    appElement: AXUIElement,
    token: String
) throws {
    let witness = try decodeWitnessToken(token)
    guard isCodexFrontmost(app), hasCurrentWitness(witness)
    else {
        throw ControlError.failed("The exact focused Codex task/window witness is no longer valid.")
    }
    _ = try uniqueFocusedCodexWindow(appElement)
}

func focusCodex(_ app: NSRunningApplication, appElement: AXUIElement, threadId: String?) throws -> TargetContext {
    guard let threadId else {
        throw ControlError.failed("A focused Codex task ID is required for mutation.")
    }
    let cursor = desktopLogCursor()
    guard let url = URL(string: "codex://threads/\(threadId)"), NSWorkspace.shared.open(url) else {
        throw ControlError.failed("Could not open the target Codex task.")
    }
    guard app.activate() else {
        throw ControlError.failed("Could not bring Codex to the foreground.")
    }
    guard let focusedWitness = waitUntil(timeout: 3.0, operation: {
        freshWitness(threadId: threadId, after: cursor)
    }) else {
        throw ControlError.failed("Codex emitted no fresh focused task/window witness after navigation.")
    }
    let window = try verifyTarget(app, appElement: appElement, witness: focusedWitness)
    return TargetContext(window: window, witness: focusedWitness)
}

func captureCurrentCodex(
    _ app: NSRunningApplication,
    appElement: AXUIElement,
    threadId: String?
) throws -> TargetContext {
    guard let threadId,
          isCodexFrontmost(app),
          let witness = currentWitness(threadId: threadId)
    else {
        throw ControlError.failed(
            "The requested Codex task is not the current frontmost task.",
            "NO_FOCUS"
        )
    }
    let retainedWindow = try uniqueFocusedCodexWindow(appElement)
    return TargetContext(window: retainedWindow, witness: witness)
}

func preflightTargetTransaction(
    _ target: TargetContext,
    app: NSRunningApplication,
    appElement: AXUIElement
) throws -> TargetTransaction {
    let poll = SinglePassCapture<AXSnapshot>()
    guard let snapshot = singlePassQuery(
        poll: poll,
        capture: { captureAXSnapshot(target.window, maximumDepth: 24) },
        query: { $0 }
    ) else {
        throw ControlError.failed("The exact-target snapshot was captured more than once.", "TARGET_MISMATCH")
    }
    let window = try verifyTarget(
        app,
        appElement: appElement,
        witness: target.witness,
        window: target.window,
        composerElements: snapshot.elements
    )
    var state = TargetTransactionState()
    guard state.record(.preflight) else {
        throw ControlError.failed("The exact-target transaction did not begin.", "TARGET_MISMATCH")
    }
    return TargetTransaction(
        context: target,
        window: window,
        snapshot: snapshot,
        state: state
    )
}

func recordTransactionOperation(_ transaction: inout TargetTransaction) throws {
    guard transaction.state.record(.operation) else {
        throw ControlError.failed(
            "The exact-target operation was not observed in order.",
            "TARGET_MISMATCH"
        )
    }
}

func postflightTargetTransaction(
    _ transaction: inout TargetTransaction,
    app: NSRunningApplication,
    appElement: AXUIElement
) throws {
    let poll = SinglePassCapture<AXSnapshot>()
    guard let snapshot = singlePassQuery(
        poll: poll,
        capture: { captureAXSnapshot(transaction.window, maximumDepth: 24) },
        query: { $0 }
    ) else {
        throw ControlError.failed("The exact-target postflight captured more than once.", "TARGET_MISMATCH")
    }
    _ = try verifyTarget(
        app,
        appElement: appElement,
        witness: transaction.context.witness,
        window: transaction.window,
        composerElements: snapshot.elements
    )
    guard transaction.state.record(.postflight), transaction.state.complete else {
        throw ControlError.failed(
            "The exact-target transaction did not complete in order.",
            "TARGET_MISMATCH"
        )
    }
}

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

func selectableMenuItem(
    in elements: [ElementInfo],
    label: String,
    excludingDescriptionPrefix: String
) -> ElementInfo? {
    let target = normalized(label)
    let matches = elements.filter { info in
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
    return matches.count == 1 ? matches[0] : nil
}

func readPickerState(_ appElement: AXUIElement) throws -> (String?, String?) {
    dismissOpenMenus()
    let initial = captureAXSnapshot(appElement)
    let picker = try requirePicker(in: initial.elements)
    try click(picker.element)
    defer { pressEscape() }

    guard
        let modelItem = waitUntil(timeout: 1.5, operation: {
            () -> (ElementInfo, ElementInfo)? in
            let snapshot = captureAXSnapshot(appElement)
            guard
                let model = menuItem(
                    in: snapshot.elements,
                    descriptionPrefix: "Model "
                ),
                let effort = menuItem(
                    in: snapshot.elements,
                    descriptionPrefix: "Effort "
                )
            else { return nil }
            return (model, effort)
        })
    else {
        throw ControlError.failed("Codex opened no readable Model/Effort menu.")
    }

    let model = String(modelItem.0.description.dropFirst("Model ".count))
    let effort = String(modelItem.1.description.dropFirst("Effort ".count))
    return (model, effort)
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
    let opened = captureAXSnapshot(appElement)
    if pickerFastState(in: opened.elements) != nil { return }

    if let advanced = opened.elements.first(where: { info in
        info.role == (kAXMenuItemRole as String)
            && normalized(elementText(info)).contains("advanced")
    }) {
        try click(advanced.element)
        guard
            waitUntil(timeout: 1.2, operation: {
                let snapshot = captureAXSnapshot(appElement)
                return pickerFastState(in: snapshot.elements)
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
        guard let confirm = waitUntil(timeout: 1.8, operation: {
            singlePassQuery(
                poll: SinglePassCapture<AXSnapshot>(),
                capture: { captureAXSnapshot(appElement) },
                query: { fullAccessConfirmationButton(in: $0) }
            ) ?? nil
        }) else {
            throw ControlError.failed(
                "Codex showed no unique Full Access confirmation button.",
                "UNAVAILABLE"
            )
        }
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

func composerDraft(_ composer: ElementInfo) -> String {
    let value = composer.value.trimmingCharacters(
        in: .whitespacesAndNewlines
    )
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
    let picker = try requirePicker(in: initial.elements)
    try click(picker.element)

    guard
        let categoryItem = waitUntil(timeout: 1.5, operation: {
            let snapshot = captureAXSnapshot(appElement)
            return menuItem(
                in: snapshot.elements,
                descriptionPrefix: categoryPrefix
            )
        })
    else {
        pressEscape()
        throw ControlError.failed("Codex did not expose the \(categoryPrefix) control.")
    }
    try click(categoryItem.element)

    guard
        let target = waitUntil(timeout: 1.5, operation: {
            let snapshot = captureAXSnapshot(appElement)
            return selectableMenuItem(
                in: snapshot.elements,
                label: targetLabel,
                excludingDescriptionPrefix: categoryPrefix
            )
        })
    else {
        let snapshot = captureAXSnapshot(appElement)
        let available = snapshot.elements
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
            let snapshot = captureAXSnapshot(appElement, maximumDepth: 24)
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
            let snapshot = captureAXSnapshot(appElement, maximumDepth: 24)
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

func fixtureNode(
    _ role: String,
    _ text: String,
    _ frame: CGRect? = nil,
    enabled: Bool = true,
    hidden: Bool = false,
    parentIndex: Int? = nil
) -> NeutralAXNode {
    NeutralAXNode(
        id: "",
        parentId: parentIndex.map(String.init),
        role: role,
        title: text,
        description: "",
        value: "",
        help: "",
        elementFrame: frame,
        enabled: enabled,
        hidden: hidden,
        selected: false,
        depth: parentIndex == nil ? 0 : 1
    )
}

func selectorFixtureNode(
    _ id: String,
    parentId: String?,
    role: String,
    text: String,
    frame: CGRect? = nil,
    enabled: Bool = true,
    hidden: Bool = false,
    selected: Bool = false,
    depth: Int = 0
) -> NeutralAXNode {
    NeutralAXNode(
        id: id,
        parentId: parentId,
        role: role,
        title: text,
        description: "",
        value: "",
        help: "",
        elementFrame: frame,
        enabled: enabled,
        hidden: hidden,
        selected: selected,
        depth: depth
    )
}

func selectorFixtureNodes(_ scenario: String) -> [NeutralAXNode] {
    let composer = selectorFixtureNode(
        "composer",
        parentId: "root",
        role: kAXTextAreaRole as String,
        text: "",
        frame: CGRect(x: 260, y: 500, width: 480, height: 48),
        depth: 1
    )
    let root = selectorFixtureNode(
        "root",
        parentId: nil,
        role: kAXWindowRole as String,
        text: "",
        frame: CGRect(x: 0, y: 0, width: 900, height: 700)
    )
    switch scenario {
    case "one-composer", "composer-visible":
        return [root, composer]
    case "zero-composers":
        return [root]
    case "two-composers":
        return [
            root,
            composer,
            selectorFixtureNode(
                "composer-2",
                parentId: "root",
                role: kAXTextAreaRole as String,
                text: "",
                frame: CGRect(x: 260, y: 420, width: 480, height: 48),
                depth: 1
            ),
        ]
    case "two-visible-composers":
        return [
            root,
            composer,
            selectorFixtureNode(
                "composer-2",
                parentId: "root",
                role: kAXTextAreaRole as String,
                text: "",
                frame: CGRect(x: 260, y: 420, width: 480, height: 48),
                depth: 1
            ),
        ]
    case "composer-hidden-ancestor":
        return [
            root,
            selectorFixtureNode(
                "hidden-owner",
                parentId: "root",
                role: "AXGroup",
                text: "",
                frame: CGRect(x: 240, y: 480, width: 540, height: 100),
                hidden: true,
                depth: 1
            ),
            selectorFixtureNode(
                "composer",
                parentId: "hidden-owner",
                role: kAXTextAreaRole as String,
                text: "",
                frame: CGRect(x: 260, y: 500, width: 480, height: 48),
                depth: 2
            ),
        ]
    case "composer-offwindow":
        return [
            root,
            selectorFixtureNode(
                "composer",
                parentId: "root",
                role: kAXTextAreaRole as String,
                text: "",
                frame: CGRect(x: 1_200, y: 500, width: 480, height: 48),
                depth: 1
            ),
        ]
    case "permission-inside":
        return [
            root,
            composer,
            selectorFixtureNode(
                "permission",
                parentId: "root",
                role: kAXButtonRole as String,
                text: "Change permissions",
                frame: CGRect(x: 280, y: 470, width: 180, height: 30),
                depth: 1
            ),
            selectorFixtureNode(
                "permission-label",
                parentId: "permission",
                role: kAXStaticTextRole as String,
                text: "Ask for approval",
                depth: 2
            ),
        ]
    case "permission-outside":
        return [
            root,
            composer,
            selectorFixtureNode(
                "permission",
                parentId: "root",
                role: kAXButtonRole as String,
                text: "Ask for approval",
                frame: CGRect(x: 20, y: 20, width: 180, height: 30),
                depth: 1
            ),
        ]
    case "permission-hidden-ancestor":
        return [
            root,
            composer,
            selectorFixtureNode(
                "hidden-owner",
                parentId: "root",
                role: "AXGroup",
                text: "",
                frame: CGRect(x: 260, y: 445, width: 240, height: 80),
                hidden: true,
                depth: 1
            ),
            selectorFixtureNode(
                "permission",
                parentId: "hidden-owner",
                role: kAXButtonRole as String,
                text: "Ask for approval",
                frame: CGRect(x: 280, y: 470, width: 180, height: 30),
                depth: 2
            ),
        ]
    case "permission-offwindow":
        return [
            root,
            composer,
            selectorFixtureNode(
                "permission",
                parentId: "root",
                role: kAXButtonRole as String,
                text: "Ask for approval",
                frame: CGRect(x: 1_200, y: 470, width: 180, height: 30),
                depth: 1
            ),
        ]
    case "mode-inside":
        return [
            root,
            composer,
            selectorFixtureNode(
                "mode",
                parentId: "root",
                role: kAXButtonRole as String,
                text: "Plan mode",
                frame: CGRect(x: 480, y: 470, width: 120, height: 30),
                depth: 1
            ),
        ]
    case "mode-outside":
        return [
            root,
            composer,
            selectorFixtureNode(
                "mode",
                parentId: "root",
                role: kAXButtonRole as String,
                text: "Plan mode",
                frame: CGRect(x: 20, y: 20, width: 120, height: 30),
                depth: 1
            ),
        ]
    case "mode-hidden-ancestor":
        return [
            root,
            composer,
            selectorFixtureNode(
                "hidden-owner",
                parentId: "root",
                role: "AXGroup",
                text: "",
                frame: CGRect(x: 460, y: 445, width: 180, height: 80),
                hidden: true,
                depth: 1
            ),
            selectorFixtureNode(
                "mode",
                parentId: "hidden-owner",
                role: kAXButtonRole as String,
                text: "Plan mode",
                frame: CGRect(x: 480, y: 470, width: 120, height: 30),
                depth: 2
            ),
        ]
    case "mode-offwindow":
        return [
            root,
            composer,
            selectorFixtureNode(
                "mode",
                parentId: "root",
                role: kAXButtonRole as String,
                text: "Plan mode",
                frame: CGRect(x: 1_200, y: 470, width: 120, height: 30),
                depth: 1
            ),
        ]
    case "confirmation-valid":
        return confirmationFixtureNodes(
            ownerId: "dialog",
            ownerParentId: "root",
            root: root,
            depth: 1
        )
    case "confirmation-nested":
        let outer = selectorFixtureNode(
            "outer",
            parentId: "root",
            role: "AXGroup",
            text: "",
            frame: CGRect(x: 180, y: 160, width: 480, height: 260),
            depth: 1
        )
        let inner = selectorFixtureNode(
            "inner",
            parentId: "outer",
            role: "AXDialog",
            text: "",
            frame: CGRect(x: 220, y: 200, width: 360, height: 180),
            depth: 2
        )
        return [root, outer, inner] + confirmationFixtureChildren(
            ownerId: "inner",
            depth: 3
        )
    case "confirmation-ambiguous":
        let first = confirmationFixtureNodes(
            ownerId: "dialog-a",
            ownerParentId: "root",
            root: root,
            depth: 1
        )
        return first + [
            selectorFixtureNode(
                "dialog-b",
                parentId: "root",
                role: "AXDialog",
                text: "",
                frame: CGRect(x: 500, y: 220, width: 260, height: 160),
                depth: 1
            ),
        ] + confirmationFixtureChildren(ownerId: "dialog-b", depth: 2)
    case "confirmation-sibling-unequal":
        let first = confirmationFixtureNodes(
            ownerId: "dialog-a",
            ownerParentId: "root",
            root: root,
            depth: 1
        )
        return first + [
            selectorFixtureNode(
                "dialog-b",
                parentId: "root",
                role: "AXDialog",
                text: "",
                frame: CGRect(x: 520, y: 220, width: 260, height: 160),
                depth: 1
            ),
            selectorFixtureNode(
                "dialog-b-extra",
                parentId: "dialog-b",
                role: kAXStaticTextRole as String,
                text: "Extra sibling content",
                depth: 2
            ),
        ] + confirmationFixtureChildren(ownerId: "dialog-b", depth: 2)
    case "confirmation-missing-cancel":
        return [
            root,
            selectorFixtureNode(
                "dialog",
                parentId: "root",
                role: "AXDialog",
                text: "",
                frame: CGRect(x: 220, y: 200, width: 360, height: 180),
                depth: 1
            ),
            selectorFixtureNode(
                "label",
                parentId: "dialog",
                role: kAXStaticTextRole as String,
                text: "Turn on Full Access",
                frame: CGRect(x: 250, y: 230, width: 220, height: 24),
                depth: 2
            ),
            selectorFixtureNode(
                "confirm",
                parentId: "dialog",
                role: kAXButtonRole as String,
                text: "Confirm",
                frame: CGRect(x: 350, y: 320, width: 90, height: 32),
                depth: 2
            ),
        ]
    case "confirmation-hidden", "confirmation-offwindow":
        return [
            root,
            selectorFixtureNode(
                "dialog",
                parentId: "root",
                role: "AXDialog",
                text: "",
                frame: scenario == "confirmation-offwindow"
                    ? CGRect(x: 1_200, y: 200, width: 360, height: 180)
                    : CGRect(x: 220, y: 200, width: 360, height: 180),
                hidden: scenario == "confirmation-hidden",
                depth: 1
            ),
        ] + confirmationFixtureChildren(ownerId: "dialog", depth: 2)
    case "confirmation-off-owner-button":
        return [
            root,
            selectorFixtureNode(
                "dialog",
                parentId: "root",
                role: "AXDialog",
                text: "",
                frame: CGRect(x: 220, y: 200, width: 360, height: 180),
                depth: 1
            ),
            selectorFixtureNode(
                "label",
                parentId: "dialog",
                role: kAXStaticTextRole as String,
                text: "Turn on Full Access",
                frame: CGRect(x: 250, y: 230, width: 220, height: 24),
                depth: 2
            ),
            selectorFixtureNode(
                "confirm",
                parentId: "dialog",
                role: kAXButtonRole as String,
                text: "Confirm",
                frame: CGRect(x: 720, y: 500, width: 90, height: 32),
                depth: 2
            ),
            selectorFixtureNode(
                "cancel",
                parentId: "dialog",
                role: kAXButtonRole as String,
                text: "Cancel",
                frame: CGRect(x: 450, y: 320, width: 90, height: 32),
                depth: 2
            ),
        ]
    case "confirmation-descendant-labels", "confirmation-descendant-hidden-label", "confirmation-descendant-off-owner-child", "confirmation-descendant-off-owner-button", "confirmation-descendant-duplicate-confirm":
        return [
            root,
            selectorFixtureNode(
                "dialog",
                parentId: "root",
                role: "AXDialog",
                text: "",
                frame: CGRect(x: 220, y: 200, width: 360, height: 180),
                depth: 1
            ),
        ] + confirmationDescendantLabelFixtureChildren(
            ownerId: "dialog",
            depth: 2,
            hiddenConfirmLabel: scenario == "confirmation-descendant-hidden-label",
            offConfirmLabel: scenario == "confirmation-descendant-off-owner-child",
            offConfirmButton: scenario == "confirmation-descendant-off-owner-button",
            duplicateConfirm: scenario == "confirmation-descendant-duplicate-confirm"
        )
    case "add-project":
        return [
            root,
            selectorFixtureNode(
                "sheet",
                parentId: "root",
                role: kAXSheetRole as String,
                text: "Add New Project",
                frame: CGRect(x: 220, y: 200, width: 360, height: 180),
                depth: 1
            ),
            selectorFixtureNode(
                "picker",
                parentId: "sheet",
                role: "AXOpenPanel",
                text: "Open Folder",
                frame: CGRect(x: 260, y: 240, width: 280, height: 120),
                depth: 2
            ),
        ]
    case "add-project-owned", "add-project-hidden", "add-project-offwindow":
        let app = selectorFixtureNode(
            "app",
            parentId: nil,
            role: "AXApplication",
            text: ""
        )
        let targetWindow = selectorFixtureNode(
            "window-a",
            parentId: "app",
            role: kAXWindowRole as String,
            text: "Target chat",
            frame: CGRect(x: 0, y: 0, width: 450, height: 700),
            depth: 1
        )
        return [
            app,
            targetWindow,
            selectorFixtureNode(
                "sheet",
                parentId: "window-a",
                role: kAXSheetRole as String,
                text: "Add New Project",
                frame: scenario == "add-project-offwindow"
                    ? CGRect(x: 1_200, y: 200, width: 360, height: 180)
                    : CGRect(x: 40, y: 200, width: 360, height: 180),
                hidden: scenario == "add-project-hidden",
                depth: 2
            ),
            selectorFixtureNode(
                "picker",
                parentId: "sheet",
                role: "AXOpenPanel",
                text: "Open Folder",
                frame: CGRect(x: 60, y: 240, width: 300, height: 120),
                depth: 3
            ),
        ]
    case "add-project-sidebar":
        return [
            root,
            selectorFixtureNode(
                "sidebar",
                parentId: "root",
                role: kAXButtonRole as String,
                text: "New Project",
                depth: 1
            ),
        ]
    case "add-project-unrelated":
        return [
            root,
            selectorFixtureNode(
                "dialog",
                parentId: "root",
                role: "AXDialog",
                text: "Choose a color",
                depth: 1
            ),
        ]
    case "add-project-sibling-unequal":
        return [
            root,
            selectorFixtureNode(
                "sheet-a",
                parentId: "root",
                role: kAXSheetRole as String,
                text: "Add New Project",
                frame: CGRect(x: 180, y: 180, width: 280, height: 180),
                depth: 1
            ),
            selectorFixtureNode(
                "picker-a",
                parentId: "sheet-a",
                role: "AXOpenPanel",
                text: "Open Folder",
                frame: CGRect(x: 200, y: 220, width: 220, height: 100),
                depth: 2
            ),
            selectorFixtureNode(
                "sheet-b",
                parentId: "root",
                role: kAXSheetRole as String,
                text: "Add New Project",
                frame: CGRect(x: 520, y: 180, width: 280, height: 180),
                depth: 1
            ),
            selectorFixtureNode(
                "picker-b",
                parentId: "sheet-b",
                role: "AXOpenPanel",
                text: "Open Folder",
                frame: CGRect(x: 540, y: 220, width: 220, height: 100),
                depth: 2
            ),
            selectorFixtureNode(
                "extra-b",
                parentId: "sheet-b",
                role: kAXStaticTextRole as String,
                text: "Extra sibling content",
                depth: 2
            ),
        ]
    case "add-project-sibling-window":
        let app = selectorFixtureNode(
            "app",
            parentId: nil,
            role: "AXApplication",
            text: ""
        )
        return [
            app,
            selectorFixtureNode(
                "window-a",
                parentId: "app",
                role: kAXWindowRole as String,
                text: "Target chat",
                frame: CGRect(x: 0, y: 0, width: 450, height: 700),
                depth: 1
            ),
            selectorFixtureNode(
                "window-b",
                parentId: "app",
                role: kAXWindowRole as String,
                text: "Other chat",
                frame: CGRect(x: 460, y: 0, width: 440, height: 700),
                depth: 1
            ),
            selectorFixtureNode(
                "sheet-b",
                parentId: "window-b",
                role: kAXSheetRole as String,
                text: "Add New Project",
                frame: CGRect(x: 520, y: 200, width: 300, height: 180),
                depth: 2
            ),
            selectorFixtureNode(
                "picker-b",
                parentId: "sheet-b",
                role: "AXOpenPanel",
                text: "Open Folder",
                frame: CGRect(x: 540, y: 240, width: 260, height: 120),
                depth: 3
            ),
        ]
    default:
        return [root]
    }
}

func confirmationFixtureChildren(
    ownerId: String,
    depth: Int
) -> [NeutralAXNode] {
    let originX: CGFloat = ownerId.hasSuffix("-b") ? 540 : 250
    return [
        selectorFixtureNode(
            "\(ownerId)-label",
            parentId: ownerId,
            role: kAXStaticTextRole as String,
            text: "Turn on Full Access",
            frame: CGRect(x: originX, y: 230, width: 200, height: 24),
            depth: depth
        ),
        selectorFixtureNode(
            "\(ownerId)-confirm",
            parentId: ownerId,
            role: kAXButtonRole as String,
            text: "Confirm",
            frame: CGRect(x: originX + 80, y: 320, width: 80, height: 32),
            depth: depth
        ),
        selectorFixtureNode(
            "\(ownerId)-cancel",
            parentId: ownerId,
            role: kAXButtonRole as String,
            text: "Cancel",
            frame: CGRect(x: originX + 140, y: 320, width: 70, height: 32),
            depth: depth
        ),
    ]
}

func confirmationFixtureNodes(
    ownerId: String,
    ownerParentId: String,
    root: NeutralAXNode,
    depth: Int
) -> [NeutralAXNode] {
    [
        root,
        selectorFixtureNode(
            ownerId,
            parentId: ownerParentId,
            role: "AXDialog",
            text: "",
            frame: CGRect(x: 220, y: 200, width: 360, height: 180),
            depth: depth
        ),
    ] + confirmationFixtureChildren(ownerId: ownerId, depth: depth + 1)
}

func confirmationDescendantLabelFixtureChildren(
    ownerId: String,
    depth: Int,
    hiddenConfirmLabel: Bool = false,
    offConfirmLabel: Bool = false,
    offConfirmButton: Bool = false,
    duplicateConfirm: Bool = false
) -> [NeutralAXNode] {
    let confirmFrame = offConfirmButton
        ? CGRect(x: 720, y: 500, width: 80, height: 32)
        : CGRect(x: 330, y: 320, width: 80, height: 32)
    let confirmLabelFrame = offConfirmLabel
        ? CGRect(x: 720, y: 500, width: 80, height: 32)
        : confirmFrame
    var nodes = [
        selectorFixtureNode(
            "\(ownerId)-label",
            parentId: ownerId,
            role: kAXStaticTextRole as String,
            text: "Turn on Full Access",
            frame: CGRect(x: 250, y: 230, width: 200, height: 24),
            depth: depth
        ),
        selectorFixtureNode(
            "\(ownerId)-confirm",
            parentId: ownerId,
            role: kAXButtonRole as String,
            text: "",
            frame: confirmFrame,
            depth: depth
        ),
        selectorFixtureNode(
            "\(ownerId)-confirm-label",
            parentId: "\(ownerId)-confirm",
            role: kAXStaticTextRole as String,
            text: "Confirm",
            frame: confirmLabelFrame,
            hidden: hiddenConfirmLabel,
            depth: depth + 1
        ),
        selectorFixtureNode(
            "\(ownerId)-cancel",
            parentId: ownerId,
            role: kAXButtonRole as String,
            text: "",
            frame: CGRect(x: 420, y: 320, width: 70, height: 32),
            depth: depth
        ),
        selectorFixtureNode(
            "\(ownerId)-cancel-label",
            parentId: "\(ownerId)-cancel",
            role: kAXStaticTextRole as String,
            text: "Cancel",
            frame: CGRect(x: 420, y: 320, width: 70, height: 32),
            depth: depth + 1
        ),
    ]
    if duplicateConfirm {
        nodes += [
            selectorFixtureNode(
                "\(ownerId)-confirm-duplicate",
                parentId: ownerId,
                role: kAXButtonRole as String,
                text: "",
                frame: CGRect(x: 250, y: 320, width: 70, height: 32),
                depth: depth
            ),
            selectorFixtureNode(
                "\(ownerId)-confirm-duplicate-label",
                parentId: "\(ownerId)-confirm-duplicate",
                role: kAXStaticTextRole as String,
                text: "Confirm",
                frame: CGRect(x: 250, y: 320, width: 70, height: 32),
                depth: depth + 1
            ),
        ]
    }
    return nodes
}

func fixtureComposerSnapshot(_ scenario: String) -> NeutralComposerSnapshot {
    let window = CGRect(x: 0, y: 0, width: 900, height: 700)
    let composer = fixtureNode(kAXTextAreaRole as String, "", CGRect(x: 280, y: 520, width: 480, height: 48))
    let control = fixtureNode(kAXButtonRole as String, "Change permissions", CGRect(x: 300, y: 475, width: 180, height: 32))
    var nodes = [composer, control]
    switch scenario {
    case "ask": nodes.append(fixtureNode(kAXStaticTextRole as String, "Ask for approval", nil, parentIndex: 1))
    case "approve": nodes.append(fixtureNode(kAXStaticTextRole as String, "Approve for me", nil, parentIndex: 1))
    case "yolo", "descendant-yolo": nodes.append(fixtureNode(kAXStaticTextRole as String, "Full access", nil, parentIndex: 1))
    case "custom": nodes.append(fixtureNode(kAXStaticTextRole as String, "Custom", nil, parentIndex: 1))
    case "pending-without-approval-control":
        nodes = [composer, fixtureNode(kAXStaticTextRole as String, "Awaiting approval", CGRect(x: 120, y: 100, width: 130, height: 18))]
    case "owner-title-sibling":
        nodes += [
            fixtureNode(kAXStaticTextRole as String, "Awaiting approval", CGRect(x: 220, y: 100, width: 130, height: 18)),
            fixtureNode(kAXStaticTextRole as String, "Sibling owner title", CGRect(x: 20, y: 100, width: 180, height: 18)),
        ]
    case "owner-title-row":
        nodes += [
            fixtureNode(kAXStaticTextRole as String, "Awaiting approval", CGRect(x: 220, y: 140, width: 130, height: 18)),
            fixtureNode(kAXButtonRole as String, "Enclosing row owner", CGRect(x: 20, y: 120, width: 360, height: 48)),
        ]
    case "hidden":
        nodes += [fixtureNode(kAXStaticTextRole as String, "Awaiting approval", CGRect(x: 220, y: 100, width: 130, height: 18), hidden: true)]
    case "frameless":
        nodes += [fixtureNode(kAXStaticTextRole as String, "Awaiting approval")]
    case "offwindow":
        nodes += [fixtureNode(kAXStaticTextRole as String, "Awaiting approval", CGRect(x: 1_200, y: 100, width: 130, height: 18))]
    case "spatially-unrelated-buttons":
        nodes = [
            composer,
            fixtureNode(kAXStaticTextRole as String, "Request approval", CGRect(x: 300, y: 100, width: 180, height: 24)),
            fixtureNode(kAXButtonRole as String, "Allow", CGRect(x: 290, y: 120, width: 80, height: 30)),
            fixtureNode(kAXButtonRole as String, "Deny", CGRect(x: 700, y: 500, width: 80, height: 30)),
        ]
    default: break
    }
    let indexed = nodes.enumerated().map { index, node in
        NeutralAXNode(
            id: String(index),
            parentId: node.parentId,
            role: node.role,
            title: node.title,
            description: node.description,
            value: node.value,
            help: node.help,
            elementFrame: node.elementFrame,
            enabled: node.enabled,
            hidden: node.hidden,
            selected: node.selected,
            depth: node.depth
        )
    }
    return NeutralComposerSnapshot(nodes: indexed, windowFrame: window)
}

if action == "--selector-fixture" {
    let scenario = arguments.dropFirst().first ?? ""
    let poll = SinglePassCapture<NeutralAXQuery>()
    guard let query = singlePassQuery(
        poll: poll,
        capture: {
            return NeutralAXQuery(nodes: selectorFixtureNodes(scenario))
        },
        query: { $0 }
    ) else {
        emit(ControlResult(ok: false, action: action, requested: scenario, model: nil, effort: nil, message: "selector fixture did not capture"), exitCode: 1)
    }
    let composerIndex = uniqueComposerIndex(in: query)
    let valid: Bool
    switch scenario {
    case "one-composer", "composer-visible":
        valid = composerIndex != nil
    case "zero-composers", "two-composers", "two-visible-composers", "composer-hidden-ancestor", "composer-offwindow":
        valid = composerIndex == nil
    case "permission-inside":
        valid = composerIndex.flatMap {
            permissionControlIndex(composerIndex: $0, query: query)
        } != nil
    case "permission-outside", "permission-hidden-ancestor", "permission-offwindow":
        valid = composerIndex.flatMap {
            permissionControlIndex(composerIndex: $0, query: query)
        } == nil
    case "mode-inside", "mode-outside", "mode-hidden-ancestor", "mode-offwindow":
        guard let composerIndex = uniqueComposerIndex(in: query) else {
            emit(
                ControlResult(
                    ok: false,
                    action: action,
                    requested: scenario,
                    model: nil,
                    effort: nil,
                    message: "selector fixture has no composer"
                ),
                exitCode: 1
            )
        }
        let mode = controlIndex(
            inComposerRegion: composerIndex,
            query: query,
            roles: Set([
                kAXButtonRole as String,
                kAXRadioButtonRole as String,
            ])
        ) {
            let text = normalized($0)
            return text == "plan" || text == "planmode"
        }
        valid = (mode != nil) == (scenario == "mode-inside")
    case "confirmation-valid", "confirmation-nested", "confirmation-descendant-labels":
        valid = fullAccessConfirmationButtonIndex(in: query) != nil
    case "confirmation-ambiguous", "confirmation-sibling-unequal", "confirmation-missing-cancel", "confirmation-hidden", "confirmation-offwindow", "confirmation-off-owner-button", "confirmation-descendant-hidden-label", "confirmation-descendant-off-owner-child", "confirmation-descendant-off-owner-button", "confirmation-descendant-duplicate-confirm":
        valid = fullAccessConfirmationButtonIndex(in: query) == nil
    case "add-project":
        valid = addProjectOwnerIndices(in: query).count == 1
    case "add-project-owned":
        guard let owner = addProjectOwnerIndices(in: query).first,
              let retained = query.nodes.firstIndex(where: { $0.id == "window-a" })
        else {
            valid = false
            break
        }
        valid = addProjectOwnerBelongsToRetainedNode(
            ownerIndex: owner,
            retainedIndex: retained,
            query: query
        )
    case "add-project-sidebar", "add-project-unrelated", "add-project-sibling-unequal", "add-project-hidden", "add-project-offwindow":
        valid = addProjectOwnerIndices(in: query).isEmpty
    case "add-project-sibling-window":
        guard let owner = addProjectOwnerIndices(in: query).first,
              let retained = query.nodes.firstIndex(where: { $0.id == "window-a" })
        else {
            valid = false
            break
        }
        valid = !addProjectOwnerBelongsToRetainedNode(
            ownerIndex: owner,
            retainedIndex: retained,
            query: query
        )
    case "single-snapshot", "double-snapshot":
        valid = poll.capture { NeutralAXQuery(nodes: selectorFixtureNodes(scenario)) } == nil
    default:
        valid = false
    }
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: scenario,
            model: nil,
            effort: nil,
            message: valid
                ? "selector fixture rejected a second capture"
                : "selector fixture accepted a second capture"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--transaction-fixture" {
    let scenario = arguments.dropFirst().first ?? ""
    let phases: [TransactionPhase]
    switch scenario {
    case "valid", "workspace-frontmost": phases = [.preflight, .operation, .postflight]
    case "preflight-changed": phases = [.operation, .postflight]
    case "postflight-changed": phases = [.preflight, .operation]
    case "wrong-order": phases = [.preflight, .postflight, .operation]
    case "duplicate-operation": phases = [.preflight, .operation, .operation]
    default: phases = []
    }
    var state = TargetTransactionState()
    let accepted = phases.allSatisfy { state.record($0) } && state.complete
    let expected = scenario == "valid" || scenario == "workspace-frontmost"
    let valid = accepted == expected
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: scenario,
            model: nil,
            effort: nil,
            message: valid
                ? "transaction fixture accepted"
                : "transaction fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--mode-transition-fixture" {
    let scenario = arguments.dropFirst().first ?? ""
    let observed: Bool
    switch scenario {
    case "plan-on":
        observed = modeTransitionObserved(
            mode: "plan",
            draftEmpty: true,
            before: false,
            requested: true,
            observed: true
        )
    case "plan-off":
        observed = modeTransitionObserved(
            mode: "plan",
            draftEmpty: true,
            before: true,
            requested: false,
            observed: false
        )
    case "fast-changed":
        observed = modeTransitionObserved(
            mode: "fast",
            draftEmpty: true,
            before: false,
            requested: true,
            observed: true
        )
    case "draft-present":
        observed = modeTransitionObserved(
            mode: "plan",
            draftEmpty: false,
            before: false,
            requested: true,
            observed: true
        )
    case "unchanged":
        observed = modeTransitionObserved(
            mode: "plan",
            draftEmpty: true,
            before: false,
            requested: true,
            observed: false
        )
    default:
        observed = false
    }
    let expected = ["plan-on", "plan-off", "fast-changed"].contains(
        scenario
    )
    let valid = observed == expected
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: scenario,
            model: nil,
            effort: nil,
            message: valid
                ? "mode transition fixture accepted"
                : "mode transition fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--picker-selection-fixture" {
    let scenario = arguments.dropFirst().first ?? ""
    let observed: Bool
    switch scenario {
    case "model-confirmed":
        observed = pickerSelectionConfirmed(
            categoryPrefix: "Model ",
            targetLabel: "Sol",
            model: "Sol",
            effort: "High"
        )
    case "reasoning-confirmed":
        observed = pickerSelectionConfirmed(
            categoryPrefix: "Effort ",
            targetLabel: "Light",
            model: "Sol",
            effort: "Light"
        )
    case "model-unchanged":
        observed = pickerSelectionConfirmed(
            categoryPrefix: "Model ",
            targetLabel: "Sol",
            model: "Luna",
            effort: "High"
        )
    default:
        observed = false
    }
    let expected = scenario != "model-unchanged"
        && !scenario.isEmpty
    let valid = observed == expected
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: scenario,
            model: nil,
            effort: nil,
            message: valid
                ? "picker selection fixture accepted"
                : "picker selection fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--workspace-shortcut-fixture" {
    let scenario = arguments.dropFirst().first ?? ""
    let expected: (String, CGKeyCode, CGEventFlags)?
    switch scenario {
    case "review-panel":
        expected = ("Review", 5, [.maskControl, .maskShift])
    case "browser":
        expected = ("Browser", 17, .maskCommand)
    case "files":
        expected = ("Files", 35, .maskCommand)
    case "side-chat":
        expected = ("Side chat", 1, [.maskCommand, .maskAlternate])
    default:
        expected = nil
    }
    let observed = workspaceShortcut(scenario)
    let before = NeutralAXQuery(nodes: [
        selectorFixtureNode(
            "surface",
            parentId: nil,
            role: "AXTab",
            text: expected?.0 ?? "",
            selected: false
        ),
    ])
    let after = NeutralAXQuery(nodes: [
        selectorFixtureNode(
            "surface",
            parentId: nil,
            role: "AXTab",
            text: expected?.0 ?? "",
            selected: true
        ),
    ])
    let valid = observed?.label == expected?.0
        && observed?.key == expected?.1
        && observed?.flags == expected?.2
        && expected.map {
            workspaceSurfaceTransitionObserved(
                before: workspaceSurfaceVisible(in: before, label: $0.0),
                after: workspaceSurfaceVisible(in: after, label: $0.0)
            )
        } == true
        && expected != nil
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: scenario,
            model: nil,
            effort: nil,
            message: valid
                ? "workspace shortcut fixture accepted"
                : "workspace shortcut fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--composer-read-fixture" {
    let scenario = arguments.dropFirst().first ?? "ask"
    let requestedConversation = "task-a"
    var observedConversation = requestedConversation
    let rendererWindowId: String? = "renderer-a"
    switch scenario {
    case "task-mismatch": observedConversation = "task-b"
    default: break
    }
    guard observedConversation == requestedConversation,
          let rendererWindowId,
          !rendererWindowId.isEmpty,
          let observation = evaluateComposerSnapshot(fixtureComposerSnapshot(scenario))
    else {
        emit(
            ControlResult(
                ok: false,
                action: action,
                requested: requestedConversation,
                model: nil,
                effort: nil,
                reasonCode: "UNAVAILABLE",
                message: "The combined composer observation is unavailable."
            ),
            exitCode: 1
        )
    }
    emit(
        ControlResult(
            ok: true,
            action: action,
            requested: requestedConversation,
            model: nil,
            effort: nil,
            approvalMode: observation.approvalMode,
            pendingInput: observation.pending,
            inputKind: observation.pending ? "approval" : nil,
            inputTitle: observation.pendingTitle,
            conversationId: observedConversation,
            rendererWindowId: rendererWindowId,
            message: "Combined composer fixture observed."
        ),
        exitCode: 0
    )
}

if action == "--pending-approval-label-fixture" {
    let fixture = Array(arguments.dropFirst())
    guard fixture.count == 5 else {
        emit(
            ControlResult(
                ok: false,
                action: action,
                requested: requested,
                model: nil,
                effort: nil,
                message: "malformed pending approval label fixture"
            ),
            exitCode: 1
        )
    }
    let expected = fixture[0] == "true"
    let observed = isVisiblePendingApprovalLabel(
        fixture[1],
        hasFrame: fixture[2] == "true",
        hidden: fixture[3] == "true",
        intersectsWindow: fixture[4] == "true"
    )
    emit(
        ControlResult(
            ok: observed == expected,
            action: action,
            requested: requested,
            model: nil,
            effort: nil,
            pendingInput: observed,
            message: observed == expected
                ? "pending approval label fixture accepted"
                : "pending approval label fixture rejected"
        ),
        exitCode: observed == expected ? 0 : 1
    )
}

if action == "--approval-mode-fixture" {
    guard let expected = requested, let value = threadId else {
        emit(
            ControlResult(
                ok: false,
                action: action,
                requested: requested,
                model: nil,
                effort: nil,
                message: "malformed approval mode fixture"
            ),
            exitCode: 1
        )
    }
    let observed = approvalMode(from: value)
    let valid = expected == "unknown"
        ? observed == nil
        : observed == expected
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: requested,
            model: nil,
            effort: nil,
            approvalMode: observed,
            message: valid
                ? "approval mode fixture accepted"
                : "approval mode fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--approval-confirmation-fixture" {
    guard let expected = requested, let value = threadId else {
        emit(
            ControlResult(
                ok: false,
                action: action,
                requested: requested,
                model: nil,
                effort: nil,
                message: "malformed approval confirmation fixture"
            ),
            exitCode: 1
        )
    }
    let observed = isFullAccessConfirmationButton(value)
    let valid = observed == (expected == "true")
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: requested,
            model: nil,
            effort: nil,
            message: valid
                ? "approval confirmation fixture accepted"
                : "approval confirmation fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--target-fixture" {
    let fixture = Array(arguments.dropFirst())
    let logState = fixture.indices.contains(0) ? fixture[0] : "timeout"
    let frontmost = fixture.indices.contains(1) && fixture[1] == "frontmost"
    let allWindows = fixture.indices.contains(2)
        ? fixture[2].split(separator: ",").map(String.init).filter { !$0.isEmpty }
        : []
    let focusedWindows = fixture.indices.contains(3)
        ? fixture[3].split(separator: ",").map(String.init).filter { !$0.isEmpty }
        : []
    let captured = fixture.indices.contains(4) ? fixture[4] : "captured"
    let composers = Int(fixture.indices.contains(5) ? fixture[5] : "0") ?? 0
    let expected = DesktopWitness(
        conversationId: "task-a",
        rendererWindowId: "renderer-a",
        path: codexLogRoot() + "/fixture.log",
        cursor: 1,
        fileIdentity: "fixture-id"
    )
    let expectedLine = "thread_stream_view_activity_changed active=true conversationId=task-a rendererWindowId=renderer-a rendererWindowAppearance=primary rendererWindowFocused=true"
    let staleLine = "thread_stream_view_activity_changed active=true conversationId=task-b rendererWindowId=renderer-b rendererWindowAppearance=primary rendererWindowFocused=true"
    let historyText: String
    switch logState {
    case "fresh", "replaced", "rotated", "out-of-root-token": historyText = expectedLine
    case "mismatch": historyText = staleLine
    case "newer-mismatch": historyText = "\(expectedLine)\n\(staleLine)"
    case "history-diverted": historyText = "\(expectedLine)\n\(staleLine)\n\(expectedLine)"
    default: historyText = ""
    }
    let history = witnesses(in: historyText)
    let current = history.last
    let simulatedSnapshot = DesktopLogSnapshot(
        size: 2,
        identity: logState == "replaced" ? "replacement-id" : expected.fileIdentity,
        modifiedAt: 0
    )
    let tokenRoundTrips: Bool
    do {
        if logState == "out-of-root-token" {
            let bad = DesktopWitness(conversationId: "task-a", rendererWindowId: "renderer-a", path: "/tmp/escape.log", cursor: 1, fileIdentity: "bad")
            tokenRoundTrips = try decodeWitnessToken(encodeWitnessToken(bad)) == bad
        } else {
            tokenRoundTrips = try decodeWitnessToken(encodeWitnessToken(expected)) == expected
        }
    } catch {
        tokenRoundTrips = false
    }
    let state = NeutralTargetState(
        freshWitness: logState == "timeout" ? nil : expected,
        currentWitness: current,
        boundedLogRead: logState != "rotated" && logState != "seek-fail",
        fileIdentityMatches: logSnapshotMatches(expected, simulatedSnapshot),
        historyContinuous: witnessHistoryMatches(expected, history),
        tokenRoundTrips: tokenRoundTrips,
        frontmost: frontmost,
        allWindowIds: allWindows, focusedWindowIds: focusedWindows,
        capturedWindowId: captured,
        composerCount: composers
    )
    let valid = validatedTargetWindow(
        state,
        requestedThreadId: expected.conversationId,
        requestedRendererWindowId: expected.rendererWindowId
    )
    emit(
        ControlResult(
            ok: valid != nil,
            action: action,
            requested: nil,
            model: nil,
            effort: nil,
            witnessToken: try? encodeWitnessToken(expected),
            message: valid == nil ? "fixture rejected" : "fixture accepted"
        ),
        exitCode: valid == nil ? 1 : 0
    )
}

if action == "--workflow-fixture" {
    let payload = arguments.dropFirst().first ?? ""
    guard let state = decodeNativePayload(payload, as: WorkflowProofState.self) else {
        emit(ControlResult(ok: false, action: action, requested: nil, model: nil, effort: nil, message: "malformed workflow fixture"), exitCode: 1)
    }
    let valid = validatedWorkflowProof(state)
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: nil,
            model: nil,
            effort: nil,
            message: valid ? "workflow fixture accepted" : "workflow fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--payload-fixture" {
    let kind = arguments.dropFirst().first ?? ""
    let payload = arguments.dropFirst(2).first ?? ""
    let valid: Bool
    switch kind {
    case "workflow":
        valid = decodeNativePayload(payload, as: WorkflowRequest.self) != nil
    case "route":
        valid = decodeNativePayload(payload, as: RouteRequest.self) != nil
    default:
        valid = false
    }
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: nil,
            model: nil,
            effort: nil,
            message: valid ? "payload fixture accepted" : "payload fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--current-witness-fixture" {
    let scenario = arguments.dropFirst().first ?? "large-noise"
    let event = "thread_stream_view_activity_changed active=true conversationId=task-current rendererWindowId=window-current rendererWindowAppearance=primary rendererWindowFocused=true"
    let valid: Bool
    switch scenario {
    case "large-noise":
        let data = Data((String(repeating: "x", count: Int(maximumWitnessReadBytes) + 1024) + "\n" + event).utf8)
        valid = latestWitness(in: data)?.conversationId == "task-current"
    case "split-boundary":
        let split = event.index(event.startIndex, offsetBy: 57)
        var data = Data(String(event[..<split]).utf8)
        data.append(Data(String(event[split...]).utf8))
        valid = latestWitness(in: data)?.rendererWindowId == "window-current"
    case "no-event-within-cap":
        valid = false
    default:
        valid = false
    }
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: nil,
            model: nil,
            effort: nil,
            message: valid ? "current witness fixture accepted" : "current witness fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--multi-log-fixture" {
    let payload = arguments.dropFirst().first ?? ""
    guard let request = decodeNativePayload(payload, as: MultiLogFixtureRequest.self),
          !request.paths.isEmpty
    else {
        emit(ControlResult(ok: false, action: action, requested: nil, model: nil, effort: nil, message: "multi-log fixture rejected"), exitCode: 1)
    }
    var valid = false
    if let offsets = request.baselineOffsets {
        var snapshots: [String: DesktopLogSnapshot] = [:]
        for (path, offset) in offsets {
            guard let snapshot = unscopedLogSnapshot(path),
                  request.paths.contains(path), offset <= snapshot.size
            else { valid = false; break }
            snapshots[path] = DesktopLogSnapshot(
                size: offset,
                identity: request.baselineIdentityOverrides?[path] ?? snapshot.identity,
                modifiedAt: snapshot.modifiedAt
            )
        }
        if snapshots.count == offsets.count {
            valid = freshWitnessEvents(
                paths: request.paths,
                after: DesktopLogCursor(snapshots: snapshots),
                scoped: false
            ).map { collected in
                !collected.events.isEmpty && collected.events.allSatisfy { event in
                    event.conversationId == request.threadId
                        && (request.expectedRendererWindowId.map { expected in
                            expected == event.rendererWindowId
                        } ?? true)
                }
            } ?? false
        }
    } else if let current = currentWitness(in: request.paths, threadId: request.threadId) {
        valid = current.conversationId == request.threadId
    }
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: nil,
            model: nil,
            effort: nil,
            message: valid ? "multi-log fixture accepted" : "multi-log fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--log-fixture" {
    let payload = arguments.dropFirst().first ?? ""
    guard let request = decodeNativePayload(payload, as: LogFixtureRequest.self),
          let snapshot = unscopedLogSnapshot(request.path),
          snapshot.size <= maximumWitnessReadBytes,
          let data = FileHandle(forReadingAtPath: request.path)?.readDataToEndOfFile()
    else {
        emit(ControlResult(ok: false, action: action, requested: nil, model: nil, effort: nil, message: "log fixture read failed"), exitCode: 1)
    }
    let events = latestWitness(in: data).map { _ in witnesses(in: String(data: data, encoding: .utf8) ?? "") } ?? []
    let valid = events.count == 1
        && !request.existingThreadIds.contains(events[0].conversationId)
        && currentWitness(in: [request.path], threadId: request.threadId) != nil
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: nil,
            model: nil,
            effort: nil,
            message: valid ? "log fixture accepted" : "log fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--dispatch-fixture" {
    let payload = arguments.dropFirst().first ?? ""
    guard let state = decodeNativePayload(payload, as: DispatchFixtureState.self) else {
        emit(ControlResult(ok: false, action: action, requested: nil, model: nil, effort: nil, message: "malformed dispatch fixture"), exitCode: 1)
    }
    let valid: Bool = {
        if let before = state.markerBefore, let after = state.markerAfter {
            return observedNewMarker(before: before, after: after)
        }
        if let sameComposer = state.sameComposer,
           let draftIsEmpty = state.draftIsEmpty,
           let before = state.messagesBefore,
           let after = state.messagesAfter {
            return submittedComposerProof(sameComposer: sameComposer, draftIsEmpty: draftIsEmpty, beforeMessages: before, afterMessages: after)
        }
        if let pendingRemains = state.pendingRemains {
            return approvalResolutionObserved(pendingRemains: pendingRemains)
        }
        return sidebarTransitionObserved(before: state.sidebarBefore, after: state.sidebarAfter)
    }()
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: nil,
            model: nil,
            effort: nil,
            message: valid ? "dispatch fixture accepted" : "dispatch fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--route-fixture" {
    let scenario = arguments.dropFirst().first ?? "skills-heading"
    let valid: Bool
    switch scenario {
    case "skills-heading":
        valid = isSkillsRoutePresentation("AXHeading", "Skills", false)
    case "skills-selected-tab":
        valid = isSkillsRoutePresentation("AXTab", "Skills", true)
    case "skills-sidebar-button":
        valid = isSkillsRoutePresentation(kAXButtonRole as String, "Skills", false)
    default:
        valid = false
    }
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: scenario,
            model: nil,
            effort: nil,
            message: valid ? "route fixture accepted" : "route fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--new-project-fixture" {
    let scenario = arguments.dropFirst().first ?? "picker-appears"
    let observedCount: Int
    let expectedCount: Int
    switch scenario {
    case "picker-appears", "delayed-picker":
        observedCount = isAddProjectPickerPresentation(kAXSheetRole as String, "Add New Project") ? 1 : 0
        expectedCount = 1
    case "unrelated-system-dialog":
        observedCount = isAddProjectPickerPresentation("AXDialog", "Choose a color") ? 1 : 0
        expectedCount = 1
    case "persistent-sidebar-label":
        observedCount = isAddProjectPickerPresentation(kAXButtonRole as String, "New Project") ? 1 : 0
        expectedCount = 1
    case "normal-codex-window":
        observedCount = isAddProjectPickerPresentation(kAXWindowRole as String, "New Project Open Folder") ? 1 : 0
        expectedCount = 1
    case "no-picker", "timeout":
        observedCount = 0
        expectedCount = 1
    default:
        observedCount = 0
        expectedCount = 1
    }
    let valid = observedCount == expectedCount
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: scenario,
            model: nil,
            effort: nil,
            message: valid ? "new-project fixture accepted" : "new-project fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

if action == "--sqlite-timeout-fixture" {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/sh")
    process.arguments = ["-c", "trap '' TERM; sleep 10"]
    do {
        try process.run()
    } catch {
        emit(
            ControlResult(
                ok: false,
                action: action,
                requested: nil,
                model: nil,
                effort: nil,
                message: "Could not start the stubborn SQLite timeout fixture."
            ),
            exitCode: 1
        )
    }
    let reaped = terminateAndReap(process, grace: 0.1)
    emit(
        ControlResult(
            ok: reaped,
            action: action,
            requested: nil,
            model: nil,
            effort: nil,
            message: reaped
                ? "The stubborn timeout fixture was SIGKILLed and reaped."
                : "The stubborn timeout fixture remained running."
        ),
        exitCode: reaped ? 0 : 1
    )
}

if action == "--sqlite-fixture" {
    let databasePath = arguments.dropFirst().first ?? ""
    guard isRegularCanonicalSQLiteDatabase(databasePath) else {
        emit(ControlResult(ok: false, action: action, requested: nil, model: nil, effort: nil, message: "SQLite fixture prevalidation failed"), exitCode: 1)
    }
    guard let ids = sqliteThreadIds(databasePath) else {
        emit(ControlResult(ok: false, action: action, requested: nil, model: nil, effort: nil, message: "SQLite fixture query failed"), exitCode: 1)
    }
    let valid = ids.contains("aaaaaaaaaaaaaaaa")
        && ids.contains("bbbbbbbbbbbbbbbb")
        && sqliteThreadCwdValue(databasePath, "aaaaaaaaaaaaaaaa") == "/tmp/active"
        && sqliteThreadCwdValue(databasePath, "bbbbbbbbbbbbbbbb") == "/tmp/archived"
    emit(
        ControlResult(
            ok: valid,
            action: action,
            requested: nil,
            model: nil,
            effort: nil,
            message: valid ? "SQLite fixture accepted" : "SQLite fixture rejected"
        ),
        exitCode: valid ? 0 : 1
    )
}

do {
    guard AXIsProcessTrusted() else {
        throw ControlError.failed(
            "Accessibility permission is required for the Stream Deck app."
        )
    }
    let app = try runningCodex()
    let appElement = AXUIElementCreateApplication(app.processIdentifier)

    if action == "input-dump" {
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
    }

    let navigationActions = Set(["target-check"])
    let currentTaskActions = Set([
        "dispatch",
        "new-project",
        "mode-read",
        "mode-toggle",
        "model",
        "reasoning",
        "composer-read",
        "approval-cycle",
    ])
    let target: TargetContext?
    if navigationActions.contains(action) {
        target = try focusCodex(
            app,
            appElement: appElement,
            threadId: threadId
        )
    } else if currentTaskActions.contains(action) {
        target = try captureCurrentCodex(
            app,
            appElement: appElement,
            threadId: threadId
        )
    } else {
        target = nil
    }

    func preflight() throws -> TargetTransaction {
        guard let target else {
            throw ControlError.failed("A focused Codex task ID is required for mutation.", "NO_FOCUS")
        }
        return try preflightTargetTransaction(
            target,
            app: app,
            appElement: appElement
        )
    }

    switch action {
    case "composer-read":
        guard let target else {
            throw ControlError.failed(
                "No current Codex task is available for a composer refresh.",
                "NO_FOCUS"
            )
        }
        // Read-only composer observation uses the same exact-target preflight
        // and retained single snapshot as mutations, without a postflight.
        let transaction = try preflight()
        guard
            let observation = observeComposer(
                in: transaction.snapshot.elements,
                windowFrame: transaction.snapshot.elements.first?.elementFrame
            )
        else {
            throw ControlError.failed(
                "The verified focused Codex window has no unique composer.",
                "UNAVAILABLE"
            )
        }
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: nil,
                model: nil,
                effort: nil,
                approvalMode: observation.approvalMode,
                pendingInput: observation.pending,
                inputKind: observation.pending ? "approval" : nil,
                inputTitle: observation.pendingTitle,
                conversationId: target.witness.conversationId,
                rendererWindowId: target.witness.rendererWindowId,
                message: observation.pending
                    ? "The verified focused Codex composer has a pending approval."
                    : "The verified focused Codex composer was observed."
            ),
            exitCode: 0
        )
    case "target-verify":
        guard let requested else {
            throw ControlError.failed("An exact target witness token is required.")
        }
        try verifyCurrentTarget(
            app,
            appElement: appElement,
            token: requested
        )
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: requested,
                model: nil,
                effort: nil,
                witnessToken: requested,
                message: "The exact focused Codex task/window witness remains valid."
            ),
            exitCode: 0
        )
    case "target-check":
        guard let target else {
            throw ControlError.failed("No exact target context was captured.")
        }
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: nil,
                model: nil,
                effort: nil,
                rendererWindowId: target.witness.rendererWindowId,
                witnessToken: try encodeWitnessToken(target.witness),
                message: "The exact focused Codex task/window witness was verified."
            ),
            exitCode: 0
        )
    case "dispatch":
        guard let requested else {
            throw ControlError.failed("A targeted control payload is required.")
        }
        var transaction = try preflight()
        try dispatchControl(
            requested,
            appElement: transaction.window,
            initial: transaction.snapshot,
            applicationElement: appElement
        )
        try recordTransactionOperation(&transaction)
        let surfaceDispatches = Set([
            "shortcut:settings",
            "shortcut:review-panel",
            "shortcut:browser",
            "shortcut:files",
            "shortcut:side-chat",
        ])
        if !surfaceDispatches.contains(requested) {
            try postflightTargetTransaction(
                &transaction,
                app: app,
                appElement: appElement
            )
        } else {
            // Workspace shortcuts intentionally change the active Codex
            // surface, so the retained chat window cannot be re-identified.
            // Their local visible transition plus Codex-frontmost state is the
            // bounded postflight witness (covered by the compiled fixture).
            guard isCodexFrontmost(app),
                  transaction.state.record(.postflight),
                  transaction.state.complete else {
                throw ControlError.failed(
                    "The verified Codex surface did not remain frontmost.",
                    "TARGET_MISMATCH"
                )
            }
        }
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: requested,
                model: nil,
                effort: nil,
                rendererWindowId: target?.witness.rendererWindowId,
                message: "The exact focused Codex task received the requested control."
            ),
            exitCode: 0
        )
    case "new-project":
        var transaction = try preflight()
        let beforeSnapshot = captureAXSnapshot(appElement)
        let originalWindow = transaction.window
        try pressKey(31, flags: .maskCommand)
        guard waitUntil(timeout: 2.4, operation: {
            singlePassQuery(
                poll: SinglePassCapture<AXSnapshot>(),
                capture: { captureAXSnapshot(appElement) },
                query: { snapshot in
                    newOwnedAddProjectPicker(
                        before: beforeSnapshot,
                        after: snapshot,
                        retainedWindow: originalWindow
                    )
                }
            )
            ?? nil
        }) != nil else {
            throw ControlError.failed(
                "Codex did not show a verified Add Project picker."
            )
        }
        guard isCodexFrontmost(app)
        else {
            throw ControlError.failed(
                "The Add Project picker is not owned by the captured Codex window.",
                "TARGET_MISMATCH"
            )
        }
        try recordTransactionOperation(&transaction)
        try postflightTargetTransaction(
            &transaction,
            app: app,
            appElement: appElement
        )
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: nil,
                model: nil,
                effort: nil,
                rendererWindowId: target?.witness.rendererWindowId,
                message: "The Codex Add Project picker is visibly open."
            ),
            exitCode: 0
        )
    case "workflow":
        guard let requested,
              let workflow = decodeNativePayload(requested, as: WorkflowRequest.self)
        else {
            throw ControlError.failed("Malformed workflow observer request.")
        }
        let witness = try launchVerifiedWorkflow(workflow, app: app, appElement: appElement)
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: nil,
                model: nil,
                effort: nil,
                rendererWindowId: witness.rendererWindowId,
                witnessToken: try encodeWitnessToken(witness),
                message: "The new Codex workflow task has the verified project and draft."
            ),
            exitCode: 0
        )
    case "route":
        guard let requested,
              let route = decodeNativePayload(requested, as: RouteRequest.self)
        else {
            throw ControlError.failed("Malformed route observer request.")
        }
        try launchVerifiedRoute(route, app: app, appElement: appElement)
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: route.route,
                model: nil,
                effort: nil,
                message: "The requested Codex route is visibly focused."
            ),
            exitCode: 0
        )
    case "approval-cycle":
        guard let target else {
            throw ControlError.failed("No current Codex task is available for a permission change.", "NO_FOCUS")
        }
        // The captured Plan 007 target is already frontmost. This preserves
        // the established foreground assertion without allowing a stale task
        // to be activated: captureCurrentCodex above would have failed first.
        var transaction = try preflight()
        _ = try focusedCodexWindow(
            app,
            appElement: appElement,
            activate: true
        )
        dismissOpenMenus()
        let operationSnapshot = captureAXSnapshot(transaction.window)
        let current = try readApprovalMode(in: operationSnapshot)
        guard let index = approvalModes.firstIndex(of: current) else {
            throw ControlError.failed(
                "The visible Codex composer returned an unsupported approval mode."
            )
        }
        let requestedMode = approvalModes[
            (index + 1) % approvalModes.count
        ]
        let mode = try applyApprovalMode(
            requestedMode,
            appElement: transaction.window,
            initial: operationSnapshot
        )
        try recordTransactionOperation(&transaction)
        try postflightTargetTransaction(
            &transaction,
            app: app,
            appElement: appElement
        )
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: requestedMode,
                model: nil,
                effort: nil,
                approvalMode: mode,
                conversationId: target.witness.conversationId,
                rendererWindowId: target.witness.rendererWindowId,
                message: "The focused Codex composer cycled to \(mode) approval mode."
            ),
            exitCode: 0
        )
    case "mode-read":
        guard let requested else {
            throw ControlError.failed("A Plan or Fast mode is required.")
        }
        let transaction = try preflight()
        let active: Bool
        if requested == "plan" {
            active = try readMode(
                requested,
                elements: transaction.snapshot.elements,
                query: transaction.snapshot.query
            )
        } else {
            active = try readFastMode(transaction.window)
        }
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
        var transaction = try preflight()
        dismissOpenMenus()
        let operationSnapshot = captureAXSnapshot(transaction.window)
        let active = try toggleMode(
            requested,
            appElement: transaction.window,
            initial: operationSnapshot
        )
        try recordTransactionOperation(&transaction)
        try postflightTargetTransaction(
            &transaction,
            app: app,
            appElement: appElement
        )
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
        var transaction = try preflight()
        dismissOpenMenus()
        let operationSnapshot = captureAXSnapshot(transaction.window)
        try applySelection(
            appElement: transaction.window,
            categoryPrefix: "Model ",
            targetLabel: label,
            initial: operationSnapshot
        )
        let state = try readPickerState(transaction.window)
        guard pickerSelectionConfirmed(
            categoryPrefix: "Model ",
            targetLabel: label,
            model: state.0,
            effort: state.1
        ) else {
            throw ControlError.failed(
                "Codex still shows \(state.0 ?? "no model") after selecting \(label)."
            )
        }
        try recordTransactionOperation(&transaction)
        try postflightTargetTransaction(
            &transaction,
            app: app,
            appElement: appElement
        )
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
        var transaction = try preflight()
        dismissOpenMenus()
        let operationSnapshot = captureAXSnapshot(transaction.window)
        try applySelection(
            appElement: transaction.window,
            categoryPrefix: "Effort ",
            targetLabel: label,
            initial: operationSnapshot
        )
        let state = try readPickerState(transaction.window)
        guard pickerSelectionConfirmed(
            categoryPrefix: "Effort ",
            targetLabel: label,
            model: state.0,
            effort: state.1
        ) else {
            throw ControlError.failed(
                "Codex still shows \(state.1 ?? "no effort") after selecting \(label)."
            )
        }
        try recordTransactionOperation(&transaction)
        try postflightTargetTransaction(
            &transaction,
            app: app,
            appElement: appElement
        )
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
            "Usage: codex-ui-control composer-read | read | model SLUG | reasoning LEVEL | mode-read MODE | mode-toggle MODE | approval-cycle | new-project"
        )
    }
} catch {
    let reasonCode = (error as? ControlError)?.reasonCode ?? "UNKNOWN"
    emit(
        ControlResult(
            ok: false,
            action: action,
            requested: nil,
            model: nil,
            effort: nil,
            reasonCode: reasonCode,
            message: error.localizedDescription
        ),
        exitCode: 1
    )
}
