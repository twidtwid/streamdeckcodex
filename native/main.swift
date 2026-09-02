import AppKit
import ApplicationServices
import Darwin
import Foundation

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

runFixtureAction(action, arguments: arguments)

do {
    guard AXIsProcessTrusted() else {
        throw ControlError.failed(
            "Accessibility permission is required for the Stream Deck app."
        )
    }
    let app = try runningCodex()
    let appElement = AXUIElementCreateApplication(app.processIdentifier)

    let navigationActions = Set(["target-check"])
    let currentTaskActions = Set([
        "target-capture",
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
    } else if shouldReuseComposerWitness(action: action, requested: requested),
              let requested
    {
        target = try captureWitnessedCodex(
            app,
            appElement: appElement,
            token: requested,
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
    case "dictation-start":
        guard let requested else {
            throw ControlError.failed(
                "An exact target witness token is required to start dictation.",
                "NO_FOCUS"
            )
        }
        try verifyCurrentTarget(
            app,
            appElement: appElement,
            token: requested
        )
        let window = try uniqueFocusedCodexWindow(appElement)
        let initial = captureAXSnapshot(
            window,
            maximumDepth: maximumCodexWindowTraversalDepth
        )
        guard let start = dictationControl(in: initial, phase: .idle) else {
            throw ControlError.failed(
                "The visible Codex composer has no unique Dictate control.",
                "UNAVAILABLE"
            )
        }
        try pressAccessibilityControl(start.element)
        guard waitUntil(timeout: 2.5, operation: {
            let snapshot = captureAXSnapshot(
                window,
                maximumDepth: maximumCodexWindowTraversalDepth
            )
            return dictationControl(in: snapshot, phase: .recording) == nil
                ? nil : true
        }) != nil else {
            // A failed postcondition must not leave microphone capture active.
            let cleanup = captureAXSnapshot(
                window,
                maximumDepth: maximumCodexWindowTraversalDepth
            )
            if let stop = dictationControl(in: cleanup, phase: .recording) {
                try? pressAccessibilityControl(stop.element)
            }
            throw ControlError.failed(
                "The visible Codex composer did not enter dictation.",
                "UNCHANGED"
            )
        }
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: nil,
                model: nil,
                effort: nil,
                active: true,
                message: "The visible Codex composer confirmed dictation is recording."
            ),
            exitCode: 0
        )
    case "dictation-stop":
        let windows = attribute(
            appElement,
            kAXWindowsAttribute as CFString
        ) as? [AXUIElement] ?? []
        let candidates = windows.compactMap { window -> (AXUIElement, ElementInfo)? in
            let snapshot = captureAXSnapshot(
                window,
                maximumDepth: maximumCodexWindowTraversalDepth
            )
            return dictationControl(in: snapshot, phase: .recording).map {
                (window, $0)
            }
        }
        guard candidates.count <= 1 else {
            throw ControlError.failed(
                "Codex exposed more than one recording composer; refusing an ambiguous stop.",
                "UNAVAILABLE"
            )
        }
        guard let (window, stop) = candidates.first else {
            emit(
                ControlResult(
                    ok: true,
                    action: action,
                    requested: nil,
                    model: nil,
                    effort: nil,
                    active: false,
                    message: "Codex dictation is already stopped."
                ),
                exitCode: 0
            )
        }
        try pressAccessibilityControl(stop.element)
        guard waitUntil(timeout: 2.5, operation: {
            let snapshot = captureAXSnapshot(
                window,
                maximumDepth: maximumCodexWindowTraversalDepth
            )
            return dictationControl(in: snapshot, phase: .recording) == nil
                ? true : nil
        }) != nil else {
            throw ControlError.failed(
                "The visible Codex composer did not stop dictation.",
                "UNCHANGED"
            )
        }
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: nil,
                model: nil,
                effort: nil,
                active: false,
                message: "The visible Codex composer confirmed dictation stopped."
            ),
            exitCode: 0
        )
    case "target-capture":
        guard let target else {
            throw ControlError.failed("No current Codex task is available.", "NO_FOCUS")
        }
        emit(
            ControlResult(
                ok: true,
                action: action,
                requested: nil,
                model: nil,
                effort: nil,
                conversationId: target.witness.conversationId,
                rendererWindowId: target.witness.rendererWindowId,
                witnessToken: try encodeWitnessToken(target.witness),
                message: "Captured the exact current focused Codex task/window witness."
            ),
            exitCode: 0
        )
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
                draftEmpty: composerCandidates(in: transaction.snapshot).first.map {
                    composerDraft($0).isEmpty
                },
                inputKind: observation.pending ? "approval" : nil,
                inputTitle: observation.pendingTitle,
                conversationId: target.witness.conversationId,
                rendererWindowId: target.witness.rendererWindowId,
                witnessToken: try encodeWitnessToken(target.witness),
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
        guard let requested, let selection = validatedModelSelection(requested) else {
            throw ControlError.failed("Unsupported model selection.")
        }
        let label = selection.label
        var transaction = try preflight()
        dismissOpenMenus()
        let operationSnapshot = captureAXSnapshot(transaction.window)
        try applySelection(
            appElement: transaction.window,
            categoryPrefix: "Model ",
            targetLabel: label,
            initial: operationSnapshot
        )
        guard let state = waitForPickerSelection(
            categoryPrefix: "Model ",
            targetLabel: label,
            readState: { try? readPickerState(transaction.window) }
        ) else {
            let state = try readPickerState(transaction.window)
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
                requested: selection.value,
                model: state.0,
                effort: state.1,
                message: "The live Codex picker now shows \(state.0 ?? label)."
            ),
            exitCode: 0
        )
    case "reasoning":
        guard let requested, let selection = validatedEffortSelection(requested) else {
            throw ControlError.failed("Unsupported reasoning selection.")
        }
        let label = selection.label
        var transaction = try preflight()
        dismissOpenMenus()
        let operationSnapshot = captureAXSnapshot(transaction.window)
        try applySelection(
            appElement: transaction.window,
            categoryPrefix: "Effort ",
            targetLabel: label,
            initial: operationSnapshot
        )
        guard let state = waitForPickerSelection(
            categoryPrefix: "Effort ",
            targetLabel: label,
            readState: { try? readPickerState(transaction.window) }
        ) else {
            let state = try readPickerState(transaction.window)
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
                requested: selection.value,
                model: state.0,
                effort: state.1,
                message: "The live Codex picker now shows \(state.1 ?? label) effort."
            ),
            exitCode: 0
        )
    default:
        throw ControlError.failed(
            "Usage: codex-ui-control target-capture | dictation-start WITNESS | dictation-stop | composer-read | read | model SLUG | reasoning LEVEL | mode-read MODE | mode-toggle MODE | approval-cycle | new-project"
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
