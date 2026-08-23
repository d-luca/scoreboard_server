import React from "react";

interface DraftInputProps extends Omit<
	React.InputHTMLAttributes<HTMLInputElement>,
	"defaultValue" | "value"
> {
	value: string;
	onCommit(value: string): boolean | void;
}

/**
 * An uncontrolled input whose DOM value follows server state only while it is
 * not focused. Live WebSocket snapshots therefore never replace text the
 * operator is currently editing.
 */
export function DraftInput({ value, onCommit, onKeyDown, ...props }: DraftInputProps): React.JSX.Element {
	const inputRef = React.useRef<HTMLInputElement>(null);

	React.useLayoutEffect(() => {
		if (inputRef.current && document.activeElement !== inputRef.current) {
			inputRef.current.value = value;
		}
	}, [value]);

	return (
		<input
			ref={inputRef}
			defaultValue={value}
			onBlur={(event) => {
				const accepted = onCommit(event.currentTarget.value.trim());
				if (accepted === false) event.currentTarget.value = value;
			}}
			onKeyDown={(event) => {
				onKeyDown?.(event);
				if (event.defaultPrevented) return;
				if (event.key === "Enter") event.currentTarget.blur();
				if (event.key === "Escape") {
					event.currentTarget.value = value;
					event.currentTarget.blur();
				}
			}}
			{...props}
		/>
	);
}
