import { JSX, useState, useEffect, useRef } from "react";
import { Button } from "../ui/Button/Button";
import {
	useHotkeyStore,
	type HotkeyAction,
	type HotkeyMapping,
	findDuplicateHotkey,
	hotkeyActionLabels,
} from "@renderer/stores/hotkeyStore";

interface HotkeyRecorderProps {
	action: HotkeyAction;
	onCancel: () => void;
	onComplete: () => void;
	autoStart?: boolean;
}

export function HotkeyRecorder({
	action,
	onCancel,
	onComplete,
	autoStart = false,
}: HotkeyRecorderProps): JSX.Element {
	const [recording, setRecording] = useState(autoStart);
	const [capturedKeys, setCapturedKeys] = useState<string[]>([]);
	const [duplicateAction, setDuplicateAction] = useState<HotkeyAction | null>(null);
	const inputRef = useRef<HTMLDivElement>(null);
	const { setHotkey, hotkeys } = useHotkeyStore();

	useEffect(() => {
		if (!recording) return;

		const handleKeyDown = (event: KeyboardEvent): void => {
			event.preventDefault();
			event.stopPropagation();

			// Ignore modifier keys by themselves
			if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) {
				return;
			}

			const parts: string[] = [];
			if (event.ctrlKey) parts.push("Ctrl");
			if (event.altKey) parts.push("Alt");
			if (event.shiftKey) parts.push("Shift");

			let keyName = event.key;
			if (keyName === " ") keyName = "Space";
			else if (keyName.startsWith("Arrow")) keyName = keyName.replace("Arrow", "");
			else if (keyName.length === 1) keyName = keyName.toUpperCase();

			parts.push(keyName);
			setCapturedKeys(parts);

			// Create the new mapping
			const newMapping: HotkeyMapping = {
				key: event.key,
				ctrlKey: event.ctrlKey || undefined,
				altKey: event.altKey || undefined,
				shiftKey: event.shiftKey || undefined,
				enabled: true,
			};

			// Check for duplicate hotkey
			const duplicate = findDuplicateHotkey(hotkeys, action, newMapping);

			if (duplicate) {
				// Show warning - user must choose different key
				setDuplicateAction(duplicate);
				setRecording(false);
			} else {
				// No duplicate, save immediately
				setHotkey(action, newMapping);
				setRecording(false);

				// Small delay before completing to show the captured key
				setTimeout(() => {
					onComplete();
				}, 300);
			}
		};

		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [recording, action, setHotkey, onComplete, hotkeys]);

	useEffect(() => {
		if (recording && inputRef.current) {
			inputRef.current.focus();
		}
	}, [recording]);

	const handleStartRecording = (): void => {
		setCapturedKeys([]);
		setDuplicateAction(null);
		setRecording(true);
	};

	const handleCancelDuplicate = (): void => {
		setDuplicateAction(null);
		setCapturedKeys([]);
		setRecording(true);
	};

	return (
		<div className="flex flex-col gap-2">
			{duplicateAction ? (
				<div className="flex flex-col gap-2">
					<div className="bg-error-900/30 border-error-700 text-error-300 rounded-md border px-3 py-2 text-sm">
						<p className="font-medium">❌ Hotkey Already In Use</p>
						<p className="mt-1 text-xs">
							This key combination is already assigned to:{" "}
							<span className="font-semibold">{hotkeyActionLabels[duplicateAction]}</span>
						</p>
						<p className="mt-1 text-xs">Please choose a different key combination.</p>
					</div>
					<div className="flex items-center gap-2">
						<Button variant="default" size="sm" onClick={handleCancelDuplicate}>
							Try Again
						</Button>
						<Button variant="outline" size="sm" onClick={onCancel}>
							Cancel
						</Button>
					</div>
				</div>
			) : recording ? (
				<>
					<div
						ref={inputRef}
						tabIndex={0}
						className="bg-primary-900/50 border-primary-500 text-primary-300 min-w-32 rounded-md border-2 px-3 py-1.5 text-center text-sm font-medium outline-none"
					>
						{capturedKeys.length > 0 ? capturedKeys.join(" + ") : "Press any key..."}
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setRecording(false);
							onCancel();
						}}
					>
						Cancel
					</Button>
				</>
			) : (
				<>
					<Button variant="default" size="sm" onClick={handleStartRecording}>
						Record New Key
					</Button>
					<Button variant="outline" size="sm" onClick={onCancel}>
						Cancel
					</Button>
				</>
			)}
		</div>
	);
}
