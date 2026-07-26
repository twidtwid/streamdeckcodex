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

	tell application "/Applications/Codex.app" to activate
	delay 0.2

	tell application "System Events"
		if controlMode is "shortcut" then
			try
				my sendShortcut(payload)
			on error errorMessage number errorNumber
				if payload is "dictation-down" then
					key up "d"
					key up shift
					key up control
				end if
				error errorMessage number errorNumber
			end try
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
		else if payload is "dictation-down" then
			key down {control, shift}
			key down "d"
		else if payload is "keyboard-shortcuts" then
			keystroke "/" using {command down, shift down}
		else if payload is "back" then
			key code 33 using {command down}
		else if payload is "forward" then
			key code 30 using {command down}
		else if payload is "sidebar" then
			keystroke "b" using {command down}
		else
			error "Unknown Codex shortcut"
		end if
	end tell
end sendShortcut
