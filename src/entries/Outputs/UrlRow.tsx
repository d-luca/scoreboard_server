import React from "react";
import { SmallButton } from "./SmallButton";

export function UrlRow({
	url,
	copied,
	onCopy,
}: {
	url: string | null;
	copied: boolean;
	onCopy(): void;
}): React.JSX.Element {
	return (
		<div className="flex min-w-0 flex-1 items-center gap-2">
			<code className="text-app-secondary bg-app-tertiary flex-1 truncate rounded px-2 py-1.5 text-xs">
				{url ?? "server starting…"}
			</code>
			<SmallButton disabled={!url} onClick={onCopy}>
				{copied ? "Copied!" : "Copy"}
			</SmallButton>
		</div>
	);
}
