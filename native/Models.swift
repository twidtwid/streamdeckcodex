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
    var draftEmpty: Bool? = nil
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

// Current Codex builds place the visible composer at AX depth 27. Keep one
// bounded window traversal policy so preflight, postflight, approval reads,
// and diagnostics cannot silently diverge as the Electron tree gains wrappers.
let maximumCodexWindowTraversalDepth = 32

func shouldReuseComposerWitness(action: String, requested: String?) -> Bool {
    action == "composer-read" && !(requested ?? "").isEmpty
}

func shouldTraverseAXChildren(atDepth depth: Int, maximumDepth: Int) -> Bool {
    depth < maximumDepth
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

struct PickerSelectionRequest: Codable {
    let value: String
    let label: String
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

let effortLabels = [
    "none": "None",
    "minimal": "Minimal",
    "low": "Light",
    "medium": "Medium",
    "high": "High",
    "xhigh": "Extra High",
    "max": "Max",
    "ultra": "Ultra",
]

func validatedModelSelection(_ payload: String) -> PickerSelectionRequest? {
    guard
        let request = decodeNativePayload(payload, as: PickerSelectionRequest.self),
        request.value.count <= 64,
        request.label.count <= 16,
        request.value.lowercased().hasPrefix("gpt-"),
        request.value.unicodeScalars.allSatisfy({ scalar in
            CharacterSet.alphanumerics.contains(scalar)
                || scalar == "-" || scalar == "."
        })
    else { return nil }
    let lower = request.value.lowercased()
    let family = ["luna", "terra", "sol", "astra"].first(where: {
        lower.hasSuffix("-\($0)")
    })
    guard let family, normalized(request.label) == normalized(family) else {
        return nil
    }
    return request
}

func validatedEffortSelection(_ payload: String) -> PickerSelectionRequest? {
    guard
        let request = decodeNativePayload(payload, as: PickerSelectionRequest.self),
        let expectedLabel = effortLabels[request.value.lowercased()],
        request.value.count <= 16,
        request.label.count <= 24,
        normalized(request.label) == normalized(expectedLabel)
    else { return nil }
    return PickerSelectionRequest(
        value: request.value.lowercased(),
        label: expectedLabel
    )
}
