on run argv
	if (count of argv) < 1 then error "Missing Codex control mode"
	set controlMode to item 1 of argv
	set payload to ""
	if (count of argv) > 1 then set payload to item 2 of argv

	if controlMode is "dictation-up" then
		tell application "System Events"
			key up "d"
			key up shift
			key up control
		end tell
		return
	end if

	-- The Codex desktop bundle is currently presented as ChatGPT on macOS and
	-- is not guaranteed to live at /Applications/Codex.app. Its bundle ID is
	-- the stable identity across both names and install locations.
	tell application id "com.openai.codex" to activate
	delay 0.2

	tell application "System Events"
		if controlMode is "shortcut" then
			my sendShortcut(payload)
		else if controlMode is "slash" then
			if payload does not start with "/" then error "Invalid slash command"
			keystroke payload
			delay 0.15
			key code 36
		else if controlMode is "reasoning-menu" then
			keystroke "m" using {control down, shift down}
		else if controlMode is "model-menu" then
			keystroke "m" using {control down, shift down}
		else
			error "Unknown Codex control mode"
		end if
	end tell
end run

on sendShortcut(payload)
	tell application "System Events"
		if payload is "accept" or payload is "approve" or payload is "send" then
			key code 36
		else if payload is "reject" or payload is "decline" then
			key code 53
		else if payload is "keyboard-shortcuts" then
			keystroke "/" using {command down, shift down}
		else if payload is "back" then
			key code 33 using {command down}
		else if payload is "forward" then
			key code 30 using {command down}
		else if payload is "sidebar" then
			keystroke "b" using {command down}
		else if payload is "new-project" then
			keystroke "o" using {command down}
		else if payload is "settings" then
			keystroke "," using {command down}
		else if payload is "review-panel" then
			keystroke "g" using {control down, shift down}
		else if payload is "browser" then
			keystroke "t" using {command down}
		else if payload is "files" then
			keystroke "p" using {command down}
		else if payload is "side-chat" then
			keystroke "s" using {command down, option down}
		else
			error "Unknown Codex shortcut"
		end if
	end tell
end sendShortcut
