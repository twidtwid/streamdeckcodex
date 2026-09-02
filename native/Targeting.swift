import AppKit
import ApplicationServices
import Darwin
import Foundation

func runningCodex() throws -> NSRunningApplication {
    let candidates = NSRunningApplication.runningApplications(
        withBundleIdentifier: "com.openai.codex"
    ).filter { !$0.isTerminated }
    guard let app = candidates.first(where: { $0.isActive })
        ?? candidates.first(where: { $0.activationPolicy == .regular })
        ?? candidates.first
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

func globallyCurrentWitness(
    in paths: [String],
    scoped: Bool = false
) -> DesktopWitness? {
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
    guard let witness = globalNewestWitness(events) else { return nil }
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

func currentWitness(in paths: [String], threadId: String, scoped: Bool = false) -> DesktopWitness? {
    guard let witness = globallyCurrentWitness(in: paths, scoped: scoped),
          witness.conversationId == threadId
    else { return nil }
    return witness
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
    let paths = desktopLogFiles()
    guard paths.contains(expected.path),
          !expected.baselines.isEmpty,
          let appended = freshWitnessEvents(
              paths: paths,
              after: DesktopLogCursor(snapshots: expected.baselines),
              scoped: true
          ),
          let currentSource = appended.snapshots[expected.path],
          logSnapshotMatches(expected, currentSource)
    else { return false }
    // The captured witness was globally newest at capture time. Reading only
    // bytes appended to its complete per-file baseline proves continuity
    // without rescanning up to 128 MiB on every background refresh. An
    // expected → other → expected sequence still fails because every appended
    // focus event must retain the same task/window identity.
    return witnessHistoryMatches(expected, appended.events)
}

func captureWitnessedCodex(
    _ app: NSRunningApplication,
    appElement: AXUIElement,
    token: String,
    threadId: String?
) throws -> TargetContext {
    let witness = try decodeWitnessToken(token)
    guard let threadId, witness.conversationId == threadId else {
        throw ControlError.failed(
            "The cached Codex target belongs to another task.",
            "TARGET_MISMATCH"
        )
    }
    let window = try verifyTarget(
        app,
        appElement: appElement,
        witness: witness
    )
    return TargetContext(window: window, witness: witness)
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
    if !isCodexFrontmost(app) {
        guard app.activate() else {
            throw ControlError.failed("Could not bring Codex to the foreground.")
        }
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
        capture: {
            captureAXSnapshot(
                target.window,
                maximumDepth: maximumCodexWindowTraversalDepth
            )
        },
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
        capture: {
            captureAXSnapshot(
                transaction.window,
                maximumDepth: maximumCodexWindowTraversalDepth
            )
        },
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
