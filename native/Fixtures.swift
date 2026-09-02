import AppKit
import ApplicationServices
import Darwin
import Foundation

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

func runFixtureAction(_ action: String, arguments: [String]) {
    if action == "--composer-witness-argument-fixture" {
        let scenario = arguments.dropFirst().first ?? "missing"
        let requested: String?
        let expected: Bool
        switch scenario {
        case "missing":
            requested = nil
            expected = false
        case "empty-placeholder":
            requested = ""
            expected = false
        case "encoded-witness":
            requested = "encoded-witness"
            expected = true
        default:
            requested = scenario
            expected = false
        }
        let actual = shouldReuseComposerWitness(
            action: "composer-read",
            requested: requested
        )
        let valid = actual == expected
        emit(
            ControlResult(
                ok: valid,
                action: action,
                requested: requested,
                model: nil,
                effort: nil,
                message: valid
                    ? "composer witness argument fixture accepted"
                    : "composer witness argument fixture rejected"
            ),
            exitCode: valid ? 0 : 1
        )
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

    if action == "--picker-label-fixture" {
        let scenario = arguments.dropFirst().first ?? ""
        let valid: Bool
        switch scenario {
        case "versioned-model":
            valid = pickerMenuTextMatches("5.6 Terra", label: "Terra")
        case "annotated-ultra":
            valid = pickerMenuTextMatches(
                "Ultra Consumes usage limits faster",
                label: "Ultra"
            )
        case "overlapping-high":
            valid = effortMenuTextMatches("High", label: "High")
                && effortMenuTextMatches(
                    "High Consumes usage limits faster",
                    label: "High"
                )
                && !effortMenuTextMatches("Extra High", label: "High")
        case "unrelated":
            valid = !pickerMenuTextMatches("High", label: "Medium")
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
                    ? "picker label fixture accepted"
                    : "picker label fixture rejected"
            ),
            exitCode: valid ? 0 : 1
        )
    }

    if action == "--ultra-confirmation-fixture" {
        let scenario = arguments.dropFirst().first ?? ""
        let root = selectorFixtureNode(
            "root",
            parentId: nil,
            role: kAXWindowRole as String,
            text: "",
            frame: CGRect(x: 0, y: 0, width: 900, height: 700)
        )
        let dialog = selectorFixtureNode(
            "dialog",
            parentId: "root",
            role: "AXGroup",
            text: "Use Ultra with Full access?",
            frame: CGRect(x: 200, y: 180, width: 500, height: 240),
            depth: 1
        )
        var nodes = [
            root,
            dialog,
            selectorFixtureNode(
                "full",
                parentId: "dialog",
                role: kAXButtonRole as String,
                text: "Use Full access",
                frame: CGRect(x: 250, y: 340, width: 180, height: 44),
                depth: 2
            ),
            selectorFixtureNode(
                "continue",
                parentId: "dialog",
                role: kAXButtonRole as String,
                text: "Continue",
                frame: CGRect(x: 450, y: 340, width: 180, height: 44),
                depth: 2
            ),
        ]
        if scenario == "missing-full-access" {
            nodes.remove(at: 2)
        } else if scenario == "duplicate-continue" {
            nodes.append(selectorFixtureNode(
                "continue-2",
                parentId: "dialog",
                role: kAXButtonRole as String,
                text: "Continue",
                frame: CGRect(x: 450, y: 285, width: 180, height: 44),
                depth: 2
            ))
        } else if scenario == "spatial-siblings" {
            nodes[2] = selectorFixtureNode(
                "full",
                parentId: "root",
                role: kAXButtonRole as String,
                text: "Use Full access",
                frame: CGRect(x: 250, y: 340, width: 180, height: 44),
                depth: 1
            )
            nodes[3] = selectorFixtureNode(
                "continue",
                parentId: "root",
                role: kAXButtonRole as String,
                text: "Continue",
                frame: CGRect(x: 450, y: 340, width: 180, height: 44),
                depth: 1
            )
        }
        let selected = ultraContinueButtonIndex(in: NeutralAXQuery(nodes: nodes))
        let valid = ["valid", "spatial-siblings"].contains(scenario)
            ? selected != nil
            : selected == nil
        emit(
            ControlResult(
                ok: valid,
                action: action,
                requested: scenario,
                model: nil,
                effort: nil,
                message: valid
                    ? "Ultra confirmation fixture accepted"
                    : "Ultra confirmation fixture rejected"
            ),
            exitCode: valid ? 0 : 1
        )
    }

    if action == "--picker-wait-fixture" {
        let scenario = arguments.dropFirst().first ?? ""
        var reads = 0
        let valid: Bool
        switch scenario {
        case "selection-delayed":
            let state = waitForPickerSelection(
                categoryPrefix: "Effort ",
                targetLabel: "Medium",
                timeout: 0.2,
                interval: 1_000,
                readState: {
                    reads += 1
                    return ("Sol", reads >= 3 ? "Medium" : "High")
                }
            )
            valid = state?.1 == "Medium" && reads == 3
        case "selection-unchanged":
            valid = waitForPickerSelection(
                categoryPrefix: "Effort ",
                targetLabel: "Medium",
                timeout: 0.01,
                interval: 1_000,
                readState: { ("Sol", "High") }
            ) == nil
        case "fast-delayed":
            let state = waitForFastState(
                timeout: 0.2,
                interval: 1_000,
                readState: {
                    reads += 1
                    return reads >= 3 ? false : nil
                }
            )
            valid = state == false && reads == 3
        case "fast-unavailable":
            valid = waitForFastState(
                timeout: 0.01,
                interval: 1_000,
                readState: { nil }
            ) == nil
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
                    ? "picker wait fixture accepted"
                    : "picker wait fixture rejected"
            ),
            exitCode: valid ? 0 : 1
        )
    }

    if action == "--selection-payload-fixture" {
        let scenario = requested ?? ""
        func payload(_ value: String, _ label: String) -> String {
            let data = try! JSONEncoder().encode(
                PickerSelectionRequest(value: value, label: label)
            )
            return data.base64EncodedString()
        }
        let accepted: Bool
        switch scenario {
        case "model-future":
            accepted = validatedModelSelection(payload("gpt-5.7-terra", "Terra")) != nil
        case "model-label-mismatch":
            accepted = validatedModelSelection(payload("gpt-5.7-terra", "Sol")) == nil
        case "model-unsafe":
            accepted = validatedModelSelection(payload("gpt-5.7-terra;open", "Terra")) == nil
        case "reasoning-minimal":
            accepted = validatedEffortSelection(payload("minimal", "Minimal")) != nil
        case "reasoning-label-mismatch":
            accepted = validatedEffortSelection(payload("minimal", "Ultra")) == nil
        default:
            accepted = false
        }
        emit(
            ControlResult(
                ok: accepted,
                action: action,
                requested: scenario,
                model: nil,
                effort: nil,
                message: accepted
                    ? "selection payload fixture accepted"
                    : "selection payload fixture rejected"
            ),
            exitCode: accepted ? 0 : 1
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

    if action == "--power-fixture" {
        let scenario = arguments.dropFirst().first ?? ""
        let valid: Bool
        switch scenario {
        case "title-medium":
            valid = parsePickerTitle("5.6 Sol Medium").map { $0 == ("5.6 Sol", "Medium") } ?? false
        case "title-extra-high":
            valid = parsePickerTitle("5.6 Luna Extra High").map { $0 == ("5.6 Luna", "Extra High") } ?? false
        case "title-light":
            // "Low" and "Light" both map to the Light picker label.
            valid = parsePickerTitle("5.6 Terra Low")?.effort == "Light"
                && parsePickerTitle("5.6 Terra Light")?.effort == "Light"
        case "title-unreadable":
            valid = parsePickerTitle("Sol") == nil && parsePickerTitle("") == nil
        case "readout":
            valid = parsePowerReadout("5.6 Sol Standard, 3 of 5.")
                == PowerReadout(model: "5.6 Sol", level: "medium", position: 3)
                && parsePowerReadout("5.6 Terra Light, 1 of 5.")
                == PowerReadout(model: "5.6 Terra", level: "low", position: 1)
                && parsePowerReadout("5.6 Sol Extra High, 4 of 5.")
                == PowerReadout(model: "5.6 Sol", level: "xhigh", position: 4)
                && parsePowerReadout("Use Left and Right arrow keys to adjust power") == nil
        case "step":
            // Ranks ascend one per segment within a model; the ladder start
            // differs per chat, so the step is relative to the readout.
            let onDefault = PowerReadout(model: "5.6 Sol", level: "medium", position: 3)
            let onExplicit = PowerReadout(model: "5.6 Sol", level: "medium", position: 2)
            valid = nextPowerSegment(from: onDefault, to: "high") == 4
                && nextPowerSegment(from: onDefault, to: "low") == 2
                && nextPowerSegment(from: onExplicit, to: "xhigh") == 4
                && nextPowerSegment(from: onExplicit, to: "low") == 1
                && nextPowerSegment(from: onExplicit, to: "ultra") == nil
                && nextPowerSegment(from: onDefault, to: "minimal") == nil
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
                message: valid ? "power fixture accepted" : "power fixture rejected"
            ),
            exitCode: valid ? 0 : 1
        )
    }

    if action == "--approval-cycle-fixture" {
        let scenario = arguments.dropFirst().first ?? ""
        let valid: Bool
        switch scenario {
        case "three-modes":
            // Current Codex offers Ask, Approve, Full access: the cycle wraps
            // from Full access straight back to Ask instead of asking for Custom.
            let offered = ["ask", "approve", "yolo"]
            valid = nextOfferedApprovalMode(current: "ask", offered: offered) == "approve"
                && nextOfferedApprovalMode(current: "approve", offered: offered) == "yolo"
                && nextOfferedApprovalMode(current: "yolo", offered: offered) == "ask"
        case "with-custom":
            let offered = ["ask", "approve", "yolo", "custom"]
            valid = nextOfferedApprovalMode(current: "yolo", offered: offered) == "custom"
                && nextOfferedApprovalMode(current: "custom", offered: offered) == "ask"
        case "single-mode":
            valid = nextOfferedApprovalMode(current: "ask", offered: ["ask"]) == nil
        case "unknown-current":
            valid = nextOfferedApprovalMode(current: "other", offered: ["ask", "approve"]) == nil
        case "nested-confirm-label":
            // The live "Turn on Full Access?" dialog nests a static text that
            // repeats each button label, so descendant text reads "Confirm
            // Confirm" and "Cancel Cancel". The recognizer must still find
            // exactly one Confirm button.
            func node(_ id: String, _ parent: String?, _ role: String, _ title: String, _ frame: CGRect, depth: Int) -> NeutralAXNode {
                NeutralAXNode(id: id, parentId: parent, role: role, title: title, description: "", value: "", help: "", elementFrame: frame, enabled: true, hidden: false, selected: false, depth: depth)
            }
            let dialog = CGRect(x: 100, y: 100, width: 400, height: 200)
            let nodes = [
                node("w", nil, kAXWindowRole as String, "ChatGPT", CGRect(x: 0, y: 0, width: 1200, height: 900), depth: 0),
                node("g", "w", kAXGroupRole as String, "Turn on Full Access?", dialog, depth: 1),
                node("h", "g", "AXHeading", "Turn on Full Access?", CGRect(x: 120, y: 110, width: 300, height: 24), depth: 2),
                node("learn", "g", kAXButtonRole as String, "Learn more", CGRect(x: 120, y: 150, width: 90, height: 24), depth: 2),
                node("cancel", "g", kAXButtonRole as String, "Cancel", CGRect(x: 300, y: 250, width: 80, height: 30), depth: 2),
                node("cancel-text", "cancel", kAXStaticTextRole as String, "Cancel", CGRect(x: 310, y: 255, width: 60, height: 20), depth: 3),
                node("confirm", "g", kAXButtonRole as String, "Confirm", CGRect(x: 400, y: 250, width: 80, height: 30), depth: 2),
                node("confirm-text", "confirm", kAXStaticTextRole as String, "Confirm", CGRect(x: 410, y: 255, width: 60, height: 20), depth: 3),
            ]
            let query = NeutralAXQuery(nodes: nodes)
            valid = fullAccessConfirmationButtonIndex(in: query) == 6
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
                message: valid ? "approval cycle fixture accepted" : "approval cycle fixture rejected"
            ),
            exitCode: valid ? 0 : 1
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

    if action == "--dictation-fixture" {
        let scenario = requested ?? "idle"
        let observed: Bool
        switch scenario {
        case "idle":
            observed = dictationTextMatches(
                "Dictate Click to dictate or hold",
                phase: .idle
            )
        case "recording":
            observed = dictationTextMatches(
                "Stop dictation",
                phase: .recording
            )
        case "retry":
            observed = dictationTextMatches(
                "Retry dictation",
                phase: .retry
            )
        case "system-menu-rejected":
            observed = !dictationTextMatches(
                "Start Dictation…",
                phase: .idle
            )
        case "wrong-state-rejected":
            observed = !dictationTextMatches(
                "Stop dictation",
                phase: .idle
            )
        default:
            observed = false
        }
        emit(
            ControlResult(
                ok: observed,
                action: action,
                requested: scenario,
                model: nil,
                effort: nil,
                message: observed
                    ? "dictation fixture accepted"
                    : "dictation fixture rejected"
            ),
            exitCode: observed ? 0 : 1
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

    if action == "--traversal-depth-fixture" {
        let scenario = arguments.dropFirst().first ?? ""
        let valid: Bool
        switch scenario {
        case "current-composer":
            valid = shouldTraverseAXChildren(
                atDepth: 26,
                maximumDepth: maximumCodexWindowTraversalDepth
            )
        case "at-bound":
            valid = shouldTraverseAXChildren(
                atDepth: maximumCodexWindowTraversalDepth - 1,
                maximumDepth: maximumCodexWindowTraversalDepth
            )
        case "beyond-bound":
            valid = !shouldTraverseAXChildren(
                atDepth: maximumCodexWindowTraversalDepth,
                maximumDepth: maximumCodexWindowTraversalDepth
            )
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
                    ? "traversal depth fixture accepted"
                    : "traversal depth fixture rejected"
            ),
            exitCode: valid ? 0 : 1
        )
    }

    if action == "--composer-draft-fixture" {
        let scenario = arguments.dropFirst().first ?? ""
        let valid: Bool
        switch scenario {
        case "chromium-placeholder":
            valid = resolvedComposerDraft(
                value: "Ask Codex...",
                description: ""
            ).isEmpty
        case "description-placeholder":
            valid = resolvedComposerDraft(
                value: "Ask Codex...",
                description: "Ask Codex..."
            ).isEmpty
        case "chatgpt-placeholder":
            valid = resolvedComposerDraft(
                value: "Ask anything",
                description: ""
            ).isEmpty
        case "current-codex-placeholder":
            valid = resolvedComposerDraft(
                value: "\nDo anything",
                description: ""
            ).isEmpty
        case "plan-placeholder":
            valid = resolvedComposerDraft(
                value: "\nDescribe your task to generate a plan...",
                description: ""
            ).isEmpty
        case "real-draft":
            valid = resolvedComposerDraft(
                value: "Please fix the tests",
                description: ""
            ) == "Please fix the tests"
        case "placeholder-with-draft":
            valid = resolvedComposerDraft(
                value: "Ask Codex... then summarize",
                description: ""
            ) == "Ask Codex... then summarize"
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
                    ? "composer draft fixture accepted"
                    : "composer draft fixture rejected"
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
}
