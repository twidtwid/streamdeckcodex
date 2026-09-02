-- Legacy cleanup only. Older installed builds held Control+Shift+D for
-- push-to-talk; this releases those keys if a previous process left them
-- down. Every live control now goes through the native codex-ui-control
-- helper, so no other mode exists here.
on run argv
	if (count of argv) < 1 then error "Missing Codex control mode"
	if item 1 of argv is not "dictation-up" then error "Unknown Codex control mode"
	tell application "System Events"
		key up "d"
		key up shift
		key up control
	end tell
end run
